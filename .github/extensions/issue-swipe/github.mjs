// GitHub access goes through the user's authenticated `gh` CLI so the
// extension never handles tokens itself.
import { execFile } from "node:child_process";

export const APPROVED_LABEL = "approved";
const REJECT_COMMENT = "Rejected during issue triage (issue-swipe canvas). Closing as not planned.";

function gh(args, { cwd } = {}) {
    return new Promise((resolve, reject) => {
        execFile("gh", args, { cwd, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                const message =
                    error.code === "ENOENT"
                        ? "GitHub CLI (gh) was not found on PATH. Install it and run `gh auth login`."
                        : (stderr || error.message).trim();
                reject(new Error(message));
                return;
            }
            resolve(stdout);
        });
    });
}

export async function resolveRepo(cwd) {
    const out = await gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], { cwd });
    return out.trim();
}

export async function listQueue(repo) {
    const out = await gh([
        "issue", "list",
        "--repo", repo,
        "--state", "open",
        "--limit", "200",
        "--json", "number,title,body,author,labels,createdAt,url,comments",
    ]);
    const issues = JSON.parse(out);
    return issues
        .filter((issue) => !issue.labels.some((label) => label.name === APPROVED_LABEL))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((issue) => ({
            number: issue.number,
            title: issue.title,
            body: issue.body ?? "",
            author: issue.author?.login ?? "unknown",
            labels: issue.labels.map((label) => ({ name: label.name, color: label.color })),
            createdAt: issue.createdAt,
            url: issue.url,
            commentCount: Array.isArray(issue.comments) ? issue.comments.length : 0,
        }));
}

async function ensureApprovedLabel(repo) {
    try {
        await gh([
            "label", "create", APPROVED_LABEL,
            "--repo", repo,
            "--color", "2da44e",
            "--description", "Approved to ship",
        ]);
    } catch (error) {
        if (!/already exists/i.test(error.message)) throw error;
    }
}

export async function approve(repo, number) {
    await ensureApprovedLabel(repo);
    await gh(["issue", "edit", String(number), "--repo", repo, "--add-label", APPROVED_LABEL]);
}

export async function reject(repo, number, reason) {
    const comment = reason ? `${REJECT_COMMENT}\n\nReason: ${reason}` : REJECT_COMMENT;
    await gh(["issue", "close", String(number), "--repo", repo, "--reason", "not planned", "--comment", comment]);
}

export async function undo(repo, decision) {
    if (decision.decision === "approve") {
        await gh(["issue", "edit", String(decision.number), "--repo", repo, "--remove-label", APPROVED_LABEL]);
    } else {
        await gh(["issue", "reopen", String(decision.number), "--repo", repo]);
    }
}
