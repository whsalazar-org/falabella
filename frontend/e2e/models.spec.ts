import { expect, test } from "@playwright/test";
import { apiBaseUrl, expectedModels, openPlayground } from "./fixtures";

test.describe("model catalogue", { tag: "@models-catalog" }, () => {
  test("the API lists the configured models", async ({ request }) => {
    const response = await request.get(`${apiBaseUrl}/v1/models`);

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ models: expectedModels });
  });

  test("the playground offers every model and selects the first one", async ({
    page,
  }) => {
    const modelSelect = await openPlayground(page);

    await expect(modelSelect.locator("option")).toHaveText(expectedModels);
    await expect(modelSelect).toHaveValue(expectedModels[0]);
  });

  test("selecting a model updates the provisioning summary", async ({
    page,
  }) => {
    const modelSelect = await openPlayground(page);

    await modelSelect.selectOption(expectedModels[1]);

    await expect(modelSelect).toHaveValue(expectedModels[1]);
    await expect(
      page.getByText("Provisioning Layer").locator(".."),
    ).toContainText(expectedModels[1]);
  });
});
