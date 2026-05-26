import { test, expect } from "../../fixtures/extension";

test.describe("extension harness", () => {
  test("@extension seeds ready state and injects the assistant UI", async ({
    page,
    seedCompletedAppState,
  }) => {
    await seedCompletedAppState({
      uiConfig: {
        enableModelLoading: false,
        autoLoadOnAllPages: true,
      },
    });

    await expect(page.locator("html")).toHaveAttribute(
      "data-vassist-test-mode",
      "true",
    );
    await expect(page.getByTestId("chat-button")).toBeVisible();
  });

  test("@extension seeds setup wizard state inside the injected app", async ({
    page,
    seedSetupWizardAppState,
  }) => {
    await seedSetupWizardAppState({
      uiConfig: {
        enableModelLoading: false,
        autoLoadOnAllPages: true,
      },
    });

    await expect(page.getByTestId("setup-wizard")).toBeVisible();
    await expect(page.getByTestId("setup-step-title")).toContainText("Welcome");
  });
});
