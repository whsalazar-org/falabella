import { expect, test } from "@playwright/test";
import { openPlayground, providerFailurePrompt, sendPrompt } from "./fixtures";

test.describe("workspace shell", { tag: "@workspace-shell" }, () => {
  test("the tenant selector offers every demo tenant", async ({ page }) => {
    await openPlayground(page);
    const tenant = page.getByLabel("Tenant");

    await expect(tenant.locator("option")).toHaveText([
      "Falabella Retail",
      "Banco Falabella",
      "Sodimac",
    ]);

    await tenant.selectOption("Sodimac");
    await expect(tenant).toHaveValue("Sodimac");
  });

  test("the agent header shows approval status and artifact version", async ({
    page,
  }) => {
    await openPlayground(page);

    await expect(
      page.getByRole("heading", { name: "Customer Support Copilot" }),
    ).toBeVisible();
    await expect(page.getByText("Approved")).toBeVisible();
    await expect(page.getByText("Production agent · artifact v2.4")).toBeVisible();
  });

  test("the execution flow lists the full delivery path", async ({ page }) => {
    await openPlayground(page);

    const flow = page.getByRole("list").filter({ hasText: "Kong AI Gateway" });
    await expect(flow.getByRole("listitem")).toHaveCount(4);
    await expect(flow).toContainText("Frontend React");
    await expect(flow).toContainText("Entity API (BFF)");
    await expect(flow).toContainText("Model Provider");
  });

  test("the empty state is replaced once a conversation starts", async ({
    page,
  }) => {
    await openPlayground(page);
    await expect(
      page.getByRole("heading", { name: "Start a governed conversation" }),
    ).toBeVisible();

    await sendPrompt(page, providerFailurePrompt);

    await expect(
      page.getByRole("heading", { name: "Start a governed conversation" }),
    ).toBeHidden();
  });
});
