"use client";

import { FormEvent, useEffect, useState } from "react";
import styles from "./page.module.css";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

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
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>AI workspace</span>
          <h1>One conversation, many models.</h1>
        </div>
        <label>
          Model
          <select
            value={model}
            onChange={(event) => setModel(event.target.value)}
            disabled={!models.length || loading}
          >
            {!models.length && <option>Loading…</option>}
            {models.map((availableModel) => (
              <option key={availableModel}>{availableModel}</option>
            ))}
          </select>
        </label>
      </header>

      <section className={styles.chat} aria-live="polite">
        {!messages.length && (
          <div className={styles.empty}>
            <div className={styles.spark}>✦</div>
            <h2>What can I help you explore?</h2>
            <p>Select a model and start a conversation.</p>
          </div>
        )}
        {messages.map((message, index) => (
          <article
            className={`${styles.message} ${styles[message.role]}`}
            key={`${message.role}-${index}`}
          >
            <span>{message.role === "user" ? "You" : model}</span>
            <p>{message.content}</p>
          </article>
        ))}
        {loading && <p className={styles.thinking}>Thinking…</p>}
      </section>

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
            placeholder="Message a model…"
            rows={2}
            disabled={loading}
            aria-label="Message"
          />
          <button type="submit" disabled={!prompt.trim() || !model || loading}>
            Send <span>↗</span>
          </button>
        </div>
        <small>Enter to send · Shift + Enter for a new line</small>
      </form>
    </main>
  );
}
