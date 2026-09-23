import { expect, test } from "@playwright/test";
import { apiBaseUrl } from "./fixtures";

test.describe("gateway health", { tag: "@api-health" }, () => {
  test("Kong routes /api/health to the Go API", async ({ request }) => {
    const response = await request.get(`${apiBaseUrl}/health`);

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("unknown gateway paths are not routed to the API", async ({
    request,
  }) => {
    const response = await request.get(`${apiBaseUrl}/not-a-route`);

    expect(response.ok()).toBeFalsy();
  });
});
