import { test, expect } from "../../fixtures/extension";
import { VASSIST_REACT_ROOT_ID } from "../../../src/utils/VAssistDomIds";

test.describe("extension runtime resilience", () => {
  test("@extension remounts after the injected root is replaced and the react root appears later", async ({
    page,
    seedCompletedAppState,
    openChat,
  }) => {
    await seedCompletedAppState();
    await expect(page.getByTestId("chat-button")).toBeVisible();

    await page.evaluate((reactRootId) => {
      const existing = document.getElementById(
        "virtual-assistant-extension-root",
      );
      existing?.remove();

      const replacement = document.createElement("div");
      replacement.id = "virtual-assistant-extension-root";
      document.body.appendChild(replacement);

      window.setTimeout(() => {
        if (replacement.shadowRoot) {
          return;
        }

        const shadowRoot = replacement.attachShadow({ mode: "open" });
        const reactRoot = document.createElement("div");
        reactRoot.id = reactRootId;
        shadowRoot.appendChild(reactRoot);
      }, 150);
    }, VASSIST_REACT_ROOT_ID);

    await expect(page.getByTestId("chat-button")).toHaveCount(0);
    await expect(page.getByTestId("chat-button")).toBeVisible({
      timeout: 15_000,
    });

    await openChat();
    await expect(page.getByTestId("chat-input-textarea")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "data-vassist-test-mode",
      "true",
    );
  });
});
