import { test, expect } from "../../fixtures/electron";

test.describe("electron harness smoke", () => {
  test("@electron boots the desktop shell and exposes the preload bridge", async ({
    page,
    inputWindow,
    seedCompletedAppState,
  }) => {
    await seedCompletedAppState();

    await expect(page.getByTestId("chat-button")).toBeVisible();
    await expect(page.getByTestId("desktop-window-controls")).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const browserGlobal = globalThis as typeof globalThis & {
            window?: {
              electron?: {
                window?: unknown;
                inputWindow?: unknown;
                app?: unknown;
              };
            };
          };

          return Boolean(
            browserGlobal.window?.electron?.window &&
            browserGlobal.window?.electron?.inputWindow &&
            browserGlobal.window?.electron?.app,
          );
        }),
      )
      .toBe(true);
    await expect
      .poll(async () => inputWindow.url().includes("?window=input"))
      .toBe(true);
  });

  test("@electron opens and closes the desktop input window with chat visibility", async ({
    page,
    inputWindow,
    seedCompletedAppState,
    openChat,
  }) => {
    await seedCompletedAppState();

    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const browserGlobal = globalThis as typeof globalThis & {
            window?: {
              electron?: {
                inputWindow?: {
                  isOpen?: () => Promise<boolean>;
                };
              };
            };
          };

          return (
            (await browserGlobal.window?.electron?.inputWindow?.isOpen?.()) ??
            false
          );
        }),
      )
      .toBe(false);

    await openChat();

    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const browserGlobal = globalThis as typeof globalThis & {
            window?: {
              electron?: {
                inputWindow?: {
                  isOpen?: () => Promise<boolean>;
                };
              };
            };
          };

          return (
            (await browserGlobal.window?.electron?.inputWindow?.isOpen?.()) ??
            false
          );
        }),
      )
      .toBe(true);

    await inputWindow.getByTestId("chat-close-button").click();

    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const browserGlobal = globalThis as typeof globalThis & {
            window?: {
              electron?: {
                inputWindow?: {
                  isOpen?: () => Promise<boolean>;
                };
              };
            };
          };

          return (
            (await browserGlobal.window?.electron?.inputWindow?.isOpen?.()) ??
            false
          );
        }),
      )
      .toBe(false);
  });
});
