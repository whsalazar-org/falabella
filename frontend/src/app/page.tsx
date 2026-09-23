"use client";

import { FormEvent, useEffect, useState } from "react";
import styles from "./page.module.css";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

const starterPrompts = [
  "Summarize our return policy for a customer",
  "Draft a helpful response for a delayed order",
  "Compare two products in a concise table",
];

const architecture = [
  { name: "Frontend React", detail: "Agent playground", tone: "live" },
  { name: "Entity API (BFF)", detail: "Control plane", tone: "live" },
  { name: "Kong AI Gateway", detail: "Policy & routing", tone: "live" },
  { name: "Model Provider", detail: "OpenAI compatible", tone: "ready" },
];

export default function Home() {
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${apiBaseUrl}/v1/models`)
      .then((response) => {
        if (!response.ok) throw new Error("Could not load models");
        return response.json() as Promise<{ models: string[] }>;
      })
      .then(({ models: availableModels }) => {
        setModels(availableModels);
        setModel(availableModels[0] ?? "");
      })
      .catch((requestError: Error) => setError(requestError.message));
  }, []);

  async function submitPrompt(event: FormEvent) {
    event.preventDefault();
    const content = prompt.trim();
    if (!content || !model || loading) return;

    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setPrompt("");
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${apiBaseUrl}/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: nextMessages }),
      });
      const body = (await response.json()) as {
        message?: Message;
        error?: string;
      };
      if (!response.ok || !body.message) {
        throw new Error(body.error ?? "The model did not return a response");
      }
      setMessages([...nextMessages, body.message]);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Request failed",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>N</span>
          <div>
            <strong>Nova</strong>
            <small>AI control plane</small>
          </div>
        </div>

        <nav className={styles.navigation} aria-label="Main navigation">
          <span>Workspace</span>
          <button className={styles.navItem} type="button">
            <i>⌂</i> Overview
          </button>
          <button className={`${styles.navItem} ${styles.active}`} type="button">
            <i>✦</i> Playground
          </button>
          <button className={styles.navItem} type="button">
            <i>◎</i> Agents <b>3</b>
          </button>
          <button className={styles.navItem} type="button">
            <i>◇</i> Artifacts
          </button>
          <button className={styles.navItem} type="button">
            <i>⌘</i> Models
          </button>
          <span>Governance</span>
          <button className={styles.navItem} type="button">
            <i>✓</i> Approvals <b>2</b>
          </button>
          <button className={styles.navItem} type="button">
            <i>◉</i> Observability
          </button>
        </nav>

        <div className={styles.environment}>
          <span className={styles.pulse} />
          <div>
            <strong>Demo environment</strong>
            <small>All systems operational</small>
          </div>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.mobileBrand}>NOVA</div>
          <div className={styles.tenant}>
            <span>Tenant</span>
            <select aria-label="Tenant">
              <option>Falabella Retail</option>
              <option>Banco Falabella</option>
              <option>Sodimac</option>
            </select>
          </div>
          <div className={styles.userProfile}>
            <button type="button" aria-label="Notifications">
              ◌
            </button>
            <span>MC</span>
            <div>
              <strong>Mario Contreras</strong>
              <small>Platform admin</small>
            </div>
          </div>
        </header>

        <div className={styles.content}>
          <section className={styles.titleRow}>
            <div>
              <span className={styles.eyebrow}>Agent workspace</span>
              <h1>Test the complete AI delivery path</h1>
              <p>
                Run a governed agent through the control plane, gateway, and
                configured model provider.
              </p>
            </div>
            <button className={styles.secondaryButton} type="button">
              View architecture <span>↗</span>
            </button>
          </section>

          <div className={styles.workspace}>
            <section className={styles.playground}>
              <header className={styles.agentHeader}>
                <div className={styles.agentIcon}>CS</div>
                <div>
                  <div className={styles.agentName}>
                    <h2>Customer Support Copilot</h2>
                    <span>Approved</span>
                  </div>
                  <p>Production agent · artifact v2.4</p>
                </div>
                <label>
                  Model
                  <select
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    disabled={!models.length || loading}
                  >
                    {!models.length && <option>Loading models…</option>}
                    {models.map((availableModel) => (
                      <option key={availableModel}>{availableModel}</option>
                    ))}
                  </select>
                </label>
              </header>

              <div className={styles.contextBar}>
                <span>
                  <i className={styles.greenDot} /> Tenant scoped
                </span>
                <span>Knowledge: Support policies</span>
                <span>Trace: Langfuse</span>
              </div>

              <div className={styles.chat} aria-live="polite">
                {!messages.length && (
                  <div className={styles.empty}>
                    <div className={styles.emptyIcon}>✦</div>
                    <h3>Start a governed conversation</h3>
                    <p>
                      Try a retail support scenario or write your own prompt.
                    </p>
                    <div className={styles.suggestions}>
                      {starterPrompts.map((suggestion) => (
                        <button
                          type="button"
                          key={suggestion}
                          onClick={() => setPrompt(suggestion)}
                        >
                          {suggestion}
                          <span>→</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((message, index) => (
                  <article
                    className={`${styles.message} ${styles[message.role]}`}
                    key={`${message.role}-${index}`}
                  >
                    <span>
                      {message.role === "user"
                        ? "You"
                        : "Customer Support Copilot"}
                    </span>
                    <p>{message.content}</p>
                  </article>
                ))}
                {loading && (
                  <p className={styles.thinking}>
                    <span /> Routing through Kong AI Gateway…
                  </p>
                )}
              </div>

              <form className={styles.composer} onSubmit={submitPrompt}>
                {error && <p className={styles.error}>{error}</p>}
                <div>
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder="Ask the support agent…"
                    rows={2}
                    disabled={loading}
                    aria-label="Message"
                  />
                  <button
                    type="submit"
                    disabled={!prompt.trim() || !model || loading}
                  >
                    Send <span>↑</span>
                  </button>
                </div>
                <small>
                  Requests follow tenant policy and are traced when Langfuse is
                  configured.
                </small>
              </form>
            </section>

            <aside className={styles.flowPanel}>
              <div className={styles.panelHeading}>
                <div>
                  <span>Live request route</span>
                  <h2>Execution flow</h2>
                </div>
                <i className={loading ? styles.running : ""} />
              </div>

              <ol className={styles.flow}>
                {architecture.map((step, index) => (
                  <li key={step.name}>
                    <div className={styles.stepNumber}>
                      {index < architecture.length - 1 ? index + 1 : "AI"}
                    </div>
                    <div>
                      <strong>{step.name}</strong>
                      <span>{step.detail}</span>
                    </div>
                    <em className={styles[step.tone]}>
                      {loading && index === 3 ? "Running" : step.tone}
                    </em>
                  </li>
                ))}
              </ol>

              <div className={styles.capabilities}>
                <span>Control-plane capabilities</span>
                <div>
                  <article>
                    <i>✓</i>
                    <p>
                      <strong>Approval</strong>
                      <small>Policy passed</small>
                    </p>
                  </article>
                  <article>
                    <i>◇</i>
                    <p>
                      <strong>Artifact Management</strong>
                      <small>Agent v2.4</small>
                    </p>
                  </article>
                  <article>
                    <i>⌘</i>
                    <p>
                      <strong>Provisioning Layer</strong>
                      <small>{model || "Awaiting model"}</small>
                    </p>
                  </article>
                  <article>
                    <i>◎</i>
                    <p>
                      <strong>Knowledge Retrieval</strong>
                      <small>Extension point</small>
                    </p>
                  </article>
                </div>
              </div>

              <div className={styles.traceCard}>
                <div>
                  <span className={styles.pulse} />
                  <strong>Observability ready</strong>
                </div>
                <p>OTLP traces are exported to Langfuse when configured.</p>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
