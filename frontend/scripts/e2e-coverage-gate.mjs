#!/usr/bin/env node
/**
 * Deterministic E2E coverage gate.
 *
 * Validates `frontend/e2e/coverage-map.yml` against the Playwright suite and
 * resolves the changed files of a pull request against it. Copilot code review
 * gives advisory feedback about missing coverage; this script is the backstop
 * that cannot be skipped.
 *
 * Usage:
 *   node frontend/scripts/e2e-coverage-gate.mjs [--base <ref>] [--head <ref>]
 *                                               [--mode warn|block]
 *                                               [--changed-files <file>]
 *                                               [--summary <file>]
 *
 * Exit codes: 0 = pass (or warn-only), 1 = uncovered/invalid in block mode,
 * 2 = the gate itself could not run.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(frontendRoot, "..");
const mapPath = path.join(frontendRoot, "e2e", "coverage-map.yml");

function parseArgs(argv) {
  const args = {
    base: process.env.E2E_COVERAGE_BASE ?? "",
    head: process.env.E2E_COVERAGE_HEAD ?? "HEAD",
    mode: process.env.E2E_COVERAGE_GATE_MODE ?? "warn",
    changedFiles: "",
    summary: process.env.GITHUB_STEP_SUMMARY ?? "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--base") args.base = value ?? "";
    else if (flag === "--head") args.head = value ?? "HEAD";
    else if (flag === "--mode") args.mode = value ?? "warn";
    else if (flag === "--changed-files") args.changedFiles = value ?? "";
    else if (flag === "--summary") args.summary = value ?? "";
    else continue;
    index += 1;
  }
  if (args.mode !== "warn" && args.mode !== "block") {
    throw new Error(`--mode must be "warn" or "block", got "${args.mode}"`);
  }
  return args;
}

/** Converts a repo-relative glob into an anchored regular expression. */
function globToRegExp(glob) {
  let pattern = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*") {
      if (glob[index + 1] === "*") {
        // `**/` matches zero or more segments; a trailing `**` matches the rest.
        if (glob[index + 2] === "/") {
          pattern += "(?:[^/]+/)*";
          index += 2;
        } else {
          pattern += ".*";
          index += 1;
        }
      } else {
        pattern += "[^/]*";
      }
    } else if (char === "?") {
      pattern += "[^/]";
    } else {
      pattern += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${pattern}$`);
}

const matchesAny = (file, globs = []) =>
  globs.some((glob) => globToRegExp(glob).test(file));

function changedFiles({ base, head, changedFiles: listFile }) {
  if (listFile) {
    return readFileSync(listFile, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }
  if (!base) {
    throw new Error("provide --base <ref> or --changed-files <file>");
  }
  const output = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=d", `${base}...${head}`],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

/** Collects the Playwright tags declared in a spec file. */
function specTags(specRelativePath) {
  const source = readFileSync(path.join(frontendRoot, specRelativePath), "utf8");
  return new Set(
    Array.from(source.matchAll(/tag:\s*(\[[^\]]*\]|"[^"]*"|'[^']*'|`[^`]*`)/g))
      .flatMap(([, raw]) => raw.match(/@[\w.-]+/g) ?? []),
  );
}

function loadMap() {
  if (!existsSync(mapPath)) {
    throw new Error(`coverage map not found at ${path.relative(repoRoot, mapPath)}`);
  }
  const map = parse(readFileSync(mapPath, "utf8"));
  if (!map || !Array.isArray(map.features) || map.features.length === 0) {
    throw new Error("coverage map must declare a non-empty `features` list");
  }
  if (!map.change_rules || !Array.isArray(map.change_rules.relevant)) {
    throw new Error("coverage map must declare `change_rules.relevant`");
  }
  return map;
}

/** Checks the map is internally consistent with the suite (anti-drift). */
function validateMap(map) {
  const problems = [];
  const declaredTags = new Map();

  for (const feature of map.features) {
    if (!feature.id) {
      problems.push("a feature is missing an `id`");
      continue;
    }
    if (!Array.isArray(feature.paths) || feature.paths.length === 0) {
      problems.push(`feature "${feature.id}" declares no \`paths\``);
    }
    if (!Array.isArray(feature.specs) || feature.specs.length === 0) {
      problems.push(`feature "${feature.id}" declares no \`specs\``);
      continue;
    }
    for (const spec of feature.specs) {
      declaredTags.set(spec, declaredTags.get(spec) ?? new Set());
      declaredTags.get(spec).add(`@${feature.id}`);
      if (!existsSync(path.join(frontendRoot, spec))) {
        problems.push(`feature "${feature.id}" references missing spec \`frontend/${spec}\``);
        continue;
      }
      if (!specTags(spec).has(`@${feature.id}`)) {
        problems.push(
          `spec \`frontend/${spec}\` does not carry the \`@${feature.id}\` tag required by the coverage map`,
        );
      }
    }
  }

  const knownIds = new Set(map.features.map((feature) => `@${feature.id}`));
  for (const spec of declaredTags.keys()) {
    if (!existsSync(path.join(frontendRoot, spec))) continue;
    for (const tag of specTags(spec)) {
      if (!knownIds.has(tag)) {
        problems.push(
          `spec \`frontend/${spec}\` uses tag \`${tag}\` which is not declared in the coverage map`,
        );
      }
    }
  }

  return problems;
}

function classify(files, rules) {
  const relevant = [];
  for (const file of files) {
    if (matchesAny(file, rules.exempt ?? [])) continue;
    if (matchesAny(file, rules.relevant ?? [])) relevant.push(file);
  }
  return relevant;
}

function resolveCoverage(relevantFiles, features) {
  const covered = [];
  const uncovered = [];
  for (const file of relevantFiles) {
    const matched = features.filter((feature) => matchesAny(file, feature.paths));
    if (matched.length) {
      covered.push({ file, features: matched.map((feature) => feature.id) });
    } else {
      uncovered.push(file);
    }
  }
  return { covered, uncovered };
}

function report(lines, summaryPath) {
  const text = lines.join("\n");
  process.stdout.write(`${text}\n`);
  if (summaryPath) {
    try {
      appendFileSync(summaryPath, `${text}\n`);
    } catch (error) {
      process.stdout.write(`could not write job summary: ${error.message}\n`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const map = loadMap();
  const problems = validateMap(map);
  const files = changedFiles(args);
  const relevant = classify(files, map.change_rules);
  const { covered, uncovered } = resolveCoverage(relevant, map.features);

  const lines = ["## E2E coverage gate", ""];
  if (problems.length) {
    lines.push("### Coverage map problems", "");
    problems.forEach((problem) => lines.push(`- ${problem}`));
    lines.push("");
  }
  if (!relevant.length) {
    lines.push("No E2E-relevant files changed. Nothing to check.");
  } else {
    lines.push("### E2E-relevant changes", "");
    covered.forEach(({ file, features }) =>
      lines.push(`- \`${file}\` → covered by ${features.map((id) => `\`@${id}\``).join(", ")}`),
    );
    uncovered.forEach((file) => lines.push(`- \`${file}\` → **no mapped E2E spec**`));
    lines.push("");
  }
  if (uncovered.length) {
    lines.push(
      "Add or extend a spec in `frontend/e2e/`, then declare it in",
      "`frontend/e2e/coverage-map.yml`. Comment `@e2e-test-author` on the pull",
      "request to have the agent generate it, or run the `write-e2e-test` skill",
      "locally. If E2E coverage genuinely does not apply, add the",
      "`e2e-coverage: not-required` label with a justification comment.",
      "",
    );
  }

  const failed = problems.length > 0 || uncovered.length > 0;
  lines.push(
    failed
      ? args.mode === "block"
        ? "Result: **failed** (blocking mode)."
        : "Result: **warning** (warn-only mode; not blocking yet)."
      : "Result: **passed**.",
  );
  report(lines, args.summary);

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `status=${failed ? "failed" : "passed"}\nuncovered=${uncovered.join(" ")}\n`,
    );
  }
  return failed && args.mode === "block" ? 1 : 0;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(`e2e coverage gate could not run: ${error.message}\n`);
  process.exitCode = 2;
}
