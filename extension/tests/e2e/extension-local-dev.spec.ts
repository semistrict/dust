import {
  type BrowserContext,
  test as base,
  chromium,
  expect,
  type Page,
} from "@playwright/test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { resolve } from "path";

type ExtensionFixtures = {
  extensionContext: BrowserContext;
  extensionId: string;
  extensionPage: Page;
};

const extensionBuildPath = resolve(__dirname, "../../platforms/chrome/build");

const test = base.extend<ExtensionFixtures>({
  extensionContext: [
    async ({}, use) => {
      const userDataDir = await mkdtemp(
        resolve(tmpdir(), "dust-extension-playwright-")
      );

      const context = await chromium.launchPersistentContext(userDataDir, {
        channel: "chromium",
        headless: true,
        args: [
          `--disable-extensions-except=${extensionBuildPath}`,
          `--load-extension=${extensionBuildPath}`,
        ],
      });

      try {
        await use(context);
      } finally {
        await context.close();
        await rm(userDataDir, { recursive: true, force: true });
      }
    },
    { scope: "worker" },
  ],

  extensionId: [
    async ({ extensionContext }, use) => {
      let [serviceWorker] = extensionContext.serviceWorkers();
      if (!serviceWorker) {
        serviceWorker = await extensionContext.waitForEvent("serviceworker");
      }

      const extensionId = new URL(serviceWorker.url()).host;
      await use(extensionId);
    },
    { scope: "worker" },
  ],

  extensionPage: async ({ extensionContext, extensionId }, use) => {
    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/main.html`);
    await use(page);
    await page.close();
  },
});

test.describe
  .serial("Chrome extension local dev smoke tests", () => {
    test("shows the login screen when unauthenticated", async ({
      extensionPage,
    }) => {
      await expect(
        extensionPage.getByRole("button", { name: "Sign in" })
      ).toBeVisible();
      await expect(
        extensionPage.getByText(
          "Get more done, faster, with the power of your agents at your fingertips."
        )
      ).toBeVisible();
    });

    test("signs in through fake WorkOS and reaches the authenticated shell", async ({
      extensionContext,
      extensionId,
      extensionPage,
    }) => {
      const authTabPromise = extensionContext.waitForEvent("page", (page) => {
        return !page.url().startsWith(`chrome-extension://${extensionId}`);
      });

      await extensionPage.getByRole("button", { name: "Sign in" }).click();

      const authTab = await authTabPromise;
      await authTab.waitForLoadState("domcontentloaded");

      await expect(authTab).toHaveURL(
        /localhost:7600\/user_management\/authorize/
      );
      await expect(authTab.getByText("FAKE WORKOS - LOCAL DEV")).toBeVisible();

      const closePromise = authTab.waitForEvent("close");
      await authTab.getByRole("button", { name: "Continue" }).click();
      await closePromise;

      await expect(extensionPage).not.toHaveURL(/\/login$/);
      await expect(extensionPage.getByText(/⇧|Ctrl\+E/)).toBeVisible();
      await expect(
        extensionPage.getByRole("button", { name: "Sign in" })
      ).toHaveCount(0);
    });
  });
