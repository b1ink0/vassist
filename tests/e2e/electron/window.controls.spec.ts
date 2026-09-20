import { test, expect } from "../../fixtures/electron";

test.describe("electron window controls", () => {
  test("@electron desktop window controls minimize and maximize the main window", async ({
    page,
    electronApp,
    seedCompletedAppState,
  }) => {
    await seedCompletedAppState();

    const browserWindow = await electronApp.browserWindow(page);

    await page.getByTestId("desktop-window-minimize-button").click();
    await expect
      .poll(async () =>
        browserWindow.evaluate((window) => window.isMinimized()),
      )
      .toBe(true);

    await browserWindow.evaluate((window) => window.restore());

    await page.getByTestId("desktop-window-maximize-button").click();
    await expect
      .poll(async () =>
        browserWindow.evaluate((window) => window.isMaximized()),
      )
      .toBe(true);

    await page.getByTestId("desktop-window-maximize-button").click();
    await expect
      .poll(async () =>
        browserWindow.evaluate((window) => window.isMaximized()),
      )
      .toBe(false);
  });
});
