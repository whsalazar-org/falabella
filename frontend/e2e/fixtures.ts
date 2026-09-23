/**
 * Shared constants and helpers for the end-to-end suite.
 *
 * Every spec talks to the running Compose stack: the browser hits the Next.js
 * app, and API assertions go through the Kong gateway (never straight to the Go
 * API) so gateway routing stays covered.
 */
import { expect, type Page } from "@playwright/test";

/** Kong gateway prefix; the Go API is deliberately not addressed directly. */
export const apiBaseUrl =
  process.env.E2E_API_BASE_URL ?? "http://localhost:8000/api";

/** Models served by the stack under the E2E Compose override. */
export const expectedModels = ["gpt-4o-mini", "gpt-4.1-mini"];

/**
 * Prompt marker recognised by `mock-provider`, which then answers with an
 * error. Use it to exercise failure handling without flaky real providers.
 */
export const providerFailurePrompt =
  "Please trigger-provider-failure for this request";

/** Opens the playground and waits until the model catalogue has loaded. */
export async function openPlayground(page: Page) {
  await page.goto("/");
  const modelSelect = page.getByLabel("Model");
  await expect(modelSelect).toBeEnabled();
  return modelSelect;
}

/** Sends a prompt through the composer. */
export async function sendPrompt(page: Page, prompt: string) {
  await page.getByLabel("Message").fill(prompt);
  await page.getByRole("button", { name: "Send" }).click();
}
