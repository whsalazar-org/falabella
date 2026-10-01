// Extension: issue-swipe
// Swipe through a repository's open issues as cards: right approves (adds the
// "approved" label), left rejects (closes as "not planned" with a comment).

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";
import * as github from "./github.mjs";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const REPO_PATTERN = "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$";

// GitHub is the durable store; this is only a per-repo cache plus an undo
// stack, shared by every panel that shows the same repository.
const stores = new Map(); // repo -> store
const instances = new Map(); // instanceId -> { server, url, repo }

function getStore(repo) {
    let store = stores.get(repo);
    if (!store) {
        store = { repo, issues: [], loaded: false, loading: null, error: null, history: [], listeners: new Map() }; // SSE response -> instanceId
        stores.set(repo, store);
    }
    return store;
}

function snapshot(store) {
    const last = store.history.at(-1);
    return {
        repo: store.repo,
        loaded: store.loaded,
        error: store.error,
        issues: store.issues,
        lastDecision: last ? { number: last.issue.number, title: last.issue.title, decision: last.decision } : null,
    };
}

function notify(store) {
    const payload = `event: state\ndata: ${JSON.stringify(snapshot(store))}\n\n`;
    for (const res of store.listeners.keys()) res.write(payload);
}

async function refresh(store) {
    if (!store.loading) {
        store.loading = (async () => {
            try {
                store.issues = await github.listQueue(store.repo);
                store.error = null;
                store.loaded = true;
            } catch (error) {
                store.error = error.message;
            } finally {
                store.loading = null;
                notify(store);
            }
        })();
    }
    await store.loading;
}

async function decide(store, number, decision, reason) {
    const index = store.issues.findIndex((issue) => issue.number === number);
    if (index === -1) {
        throw new CanvasError("issue_not_in_queue", `Issue #${number} is not in the triage queue for ${store.repo}.`);
    }
    // Optimistic: the card leaves the deck immediately and comes back on failure.
    const [issue] = store.issues.splice(index, 1);
    const entry = { issue, decision };
    store.history.push(entry);
    notify(store);
    try {
        if (decision === "approve") await github.approve(store.repo, number);
        else await github.reject(store.repo, number, reason);
        store.error = null;
    } catch (error) {
        store.history.splice(store.history.indexOf(entry), 1);
        store.issues.splice(Math.min(index, store.issues.length), 0, issue);
        store.error = `Could not ${decision} #${number}: ${error.message}`;
        notify(store);
        throw new CanvasError("github_failed", store.error);
    }
    notify(store);
    return { number, decision, remaining: store.issues.length };
}

async function undoLast(store) {
    const entry = store.history.pop();
    if (!entry) throw new CanvasError("nothing_to_undo", "There is no decision to undo.");
    try {
        await github.undo(store.repo, { number: entry.issue.number, decision: entry.decision });
    } catch (error) {
        store.history.push(entry);
        store.error = `Could not undo #${entry.issue.number}: ${error.message}`;
        notify(store);
        throw new CanvasError("github_failed", store.error);
    }
    store.issues.unshift(entry.issue);
    store.error = null;
    notify(store);
    return { number: entry.issue.number, undone: entry.decision, remaining: store.issues.length };
}

function readJson(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk;
            if (body.length > 64 * 1024) {
                reject(new Error("Request body too large"));
                req.destroy();
            }
        });
        req.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                reject(new Error("Invalid JSON"));
            }
        });
        req.on("error", reject);
    });
}

function sendJson(res, status, value) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(value));
}

async function handleRequest(req, res, store, port, instanceId) {
    // Reject other hosts (DNS rebinding) and non-JSON POSTs (cross-site form posts).
    if (req.headers.host !== `127.0.0.1:${port}`) return sendJson(res, 403, { error: "Forbidden host" });
    const url = new URL(req.url, `http://127.0.0.1:${port}`);

    if (req.method === "GET" && url.pathname === "/") {
        const html = await readFile(join(extensionDir, "ui.html"), "utf8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(html);
    }
    if (req.method === "GET" && url.pathname === "/events") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
        res.write(`event: state\ndata: ${JSON.stringify(snapshot(store))}\n\n`);
        store.listeners.set(res, instanceId);
        req.on("close", () => store.listeners.delete(res));
        if (!store.loaded && !store.loading) refresh(store);
        return;
    }
    if (req.method === "POST") {
        if (!String(req.headers["content-type"]).startsWith("application/json")) {
            return sendJson(res, 415, { error: "Expected application/json" });
        }
        try {
            const body = await readJson(req);
            if (url.pathname === "/api/decide") {
                const number = Number(body.number);
                if (!Number.isInteger(number) || !["approve", "reject"].includes(body.decision)) {
                    return sendJson(res, 400, { error: "Expected { number, decision: 'approve' | 'reject' }" });
                }
                return sendJson(res, 200, await decide(store, number, body.decision));
            }
            if (url.pathname === "/api/undo") return sendJson(res, 200, await undoLast(store));
            if (url.pathname === "/api/refresh") {
                await refresh(store);
                return sendJson(res, 200, { remaining: store.issues.length });
            }
        } catch (error) {
            return sendJson(res, 409, { error: error.message });
        }
    }
    sendJson(res, 404, { error: "Not found" });
}

async function startServer(store, instanceId) {
    let port = 0;
    const server = createServer((req, res) => {
        handleRequest(req, res, store, port, instanceId).catch((error) => {
            if (!res.headersSent) sendJson(res, 500, { error: error.message });
            else res.end();
        });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;
    return { server, url: `http://127.0.0.1:${port}/` };
}

async function closeInstance(instanceId) {
    const entry = instances.get(instanceId);
    if (!entry) return;
    instances.delete(instanceId);
    const { listeners } = getStore(entry.repo);
    for (const [res, owner] of listeners) {
        if (owner === instanceId) {
            listeners.delete(res);
            res.end();
        }
    }
    await new Promise((resolve) => entry.server.close(() => resolve()));
}

function storeFor(ctx) {
    const entry = instances.get(ctx.instanceId);
    if (!entry) throw new CanvasError("unknown_instance", `Canvas instance ${ctx.instanceId} is not open.`);
    return getStore(entry.repo);
}

const numberSchema = { type: "integer", minimum: 1, description: "Issue number" };

await joinSession({
    canvases: [
        createCanvas({
            id: "issue-swipe",
            displayName: "Issue triage",
            description:
                "Swipe through a repository's open issues as cards: right approves (adds the 'approved' label), left rejects (closes as not planned).",
            inputSchema: {
                type: "object",
                properties: {
                    repo: {
                        type: "string",
                        pattern: REPO_PATTERN,
                        description: "owner/name; defaults to the repository this extension lives in",
                    },
                },
                additionalProperties: false,
            },
            actions: [
                {
                    name: "get_queue",
                    description: "List the issues still waiting for a decision, oldest first.",
                    handler: async (ctx) => {
                        const store = storeFor(ctx);
                        if (!store.loaded) await refresh(store);
                        if (store.error && !store.loaded) throw new CanvasError("github_failed", store.error);
                        const { lastDecision } = snapshot(store);
                        return {
                            repo: store.repo,
                            remaining: store.issues.length,
                            issues: store.issues.slice(0, 50).map(({ number, title, author, labels, url }) => ({
                                number,
                                title,
                                author,
                                labels: labels.map((label) => label.name),
                                url,
                            })),
                            lastDecision,
                        };
                    },
                },
                {
                    name: "approve",
                    description: "Approve an issue to ship: adds the 'approved' label (same as swiping right).",
                    inputSchema: { type: "object", properties: { number: numberSchema }, required: ["number"], additionalProperties: false },
                    handler: async (ctx) => decide(storeFor(ctx), ctx.input.number, "approve"),
                },
                {
                    name: "reject",
                    description: "Reject an issue: closes it as 'not planned' with a comment (same as swiping left).",
                    inputSchema: {
                        type: "object",
                        properties: { number: numberSchema, reason: { type: "string", maxLength: 2000 } },
                        required: ["number"],
                        additionalProperties: false,
                    },
                    handler: async (ctx) => decide(storeFor(ctx), ctx.input.number, "reject", ctx.input.reason),
                },
                {
                    name: "undo",
                    description: "Undo the most recent approve or reject decision.",
                    handler: async (ctx) => undoLast(storeFor(ctx)),
                },
                {
                    name: "refresh",
                    description: "Reload open issues from GitHub.",
                    handler: async (ctx) => {
                        const store = storeFor(ctx);
                        await refresh(store);
                        if (store.error) throw new CanvasError("github_failed", store.error);
                        return { repo: store.repo, remaining: store.issues.length };
                    },
                },
            ],
            open: async (ctx) => {
                const repo = ctx.input?.repo ?? (await github.resolveRepo(extensionDir));
                let entry = instances.get(ctx.instanceId);
                if (entry && entry.repo !== repo) {
                    await closeInstance(ctx.instanceId);
                    entry = undefined;
                }
                if (!entry) {
                    const store = getStore(repo);
                    entry = { ...(await startServer(store, ctx.instanceId)), repo };
                    instances.set(ctx.instanceId, entry);
                }
                return { title: `Issue triage · ${repo}`, url: entry.url };
            },
            onClose: async (ctx) => closeInstance(ctx.instanceId),
        }),
    ],
});
