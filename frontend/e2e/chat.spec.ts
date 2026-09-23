import { expect, test } from "@playwright/test";
import {
  apiBaseUrl,
  expectedModels,
  openPlayground,
  sendPrompt,
} from "./fixtures";

test.describe("chat completion", { tag: "@chat-completion" }, () => {
  test("the API returns an assistant message", async ({ request }) => {
    const response = await request.post(`${apiBaseUrl}/v1/chat`, {
      data: {
        model: expectedModels[0],
        messages: [{ role: "user", content: "Where is my order?" }],
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.message.role).toBe("assistant");
    expect(body.message.content).toContain("Where is my order?");
  });

  test("a prompt round-trips through the gateway into the transcript", async ({
    page,
  }) => {
    await openPlayground(page);

    await sendPrompt(page, "Where is my order?");

    await expect(page.getByText("You", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Customer Support Copilot", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Mock answer from", { exact: false }),
    ).toBeVisible();
  });

  test("a starter prompt fills the composer", async ({ page }) => {
    await openPlayground(page);
    const suggestion = "Summarize our return policy for a customer";

    await page.getByRole("button", { name: suggestion }).click();

    await expect(page.getByLabel("Message")).toHaveValue(suggestion);
  });

  test("the composer stays disabled without a prompt", async ({ page }) => {
    await openPlayground(page);

    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});
