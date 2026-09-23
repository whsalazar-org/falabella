import { expect, test } from "@playwright/test";
import {
  apiBaseUrl,
  expectedModels,
  openPlayground,
  providerFailurePrompt,
  sendPrompt,
} from "./fixtures";

test.describe("chat error handling", { tag: "@chat-error-handling" }, () => {
  test("the API rejects an unsupported model", async ({ request }) => {
    const response = await request.post(`${apiBaseUrl}/v1/chat`, {
      data: {
        model: "not-a-real-model",
        messages: [{ role: "user", content: "Hello" }],
      },
    });

    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: "unsupported model" });
  });

  test("the API rejects an empty message list", async ({ request }) => {
    const response = await request.post(`${apiBaseUrl}/v1/chat`, {
      data: { model: expectedModels[0], messages: [] },
    });

    expect(response.status()).toBe(400);
    expect((await response.json()).error).toContain("between 1 and 100");
  });

  test("a provider failure surfaces in the playground", async ({ page }) => {
    await openPlayground(page);

    await sendPrompt(page, providerFailurePrompt);

    await expect(page.getByText("mock provider failure")).toBeVisible();
  });

  test("the playground recovers after a failed request", async ({ page }) => {
    await openPlayground(page);

    await sendPrompt(page, providerFailurePrompt);
    await expect(page.getByText("mock provider failure")).toBeVisible();

    await sendPrompt(page, "Where is my order?");

    await expect(page.getByText("mock provider failure")).toBeHidden();
    await expect(
      page.getByText("Mock answer from", { exact: false }),
    ).toBeVisible();
  });
});
