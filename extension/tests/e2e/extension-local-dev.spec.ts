import {
  type BrowserContext,
  test as base,
  chromium,
  expect,
  type Page,
} from "@playwright/test";
import { mkdtemp, rm } from "fs/promises";
import { createServer, type Server } from "http";
import { tmpdir } from "os";
import { resolve } from "path";

type ExtensionFixtures = {
  extensionContext: BrowserContext;
  extensionId: string;
  extensionPage: Page;
};

const extensionBuildPath = resolve(__dirname, "../../platforms/chrome/build");
const defaultAgentName = "openrouter-test";
const hiddenSecret = "DUST-SECRET-73Q-MANGO";
const visibleDecoy = "DUST-DECOY-11Z-SPOON";

let fixtureServer: Server | null = null;
let fixtureServerUrl = "";

async function startFixtureServer(): Promise<string> {
  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Local Extension Fixture</title>
  </head>
  <body>
    <main>
      <article>
        <h1>Extension Fixture</h1>
        <p>Alpha beta gamma delta.</p>
        <p>The visible decoy code is ${visibleDecoy}.</p>
        <ul>
          <li>First bullet</li>
          <li>Second bullet</li>
        </ul>
        <div style="display: none">
          Hidden page secret for the Dust extension test: ${hiddenSecret}
        </div>
      </article>
    </main>
  </body>
</html>`;

  return new Promise((resolveUrl, reject) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve fixture server address."));
        return;
      }

      fixtureServer = server;
      resolveUrl(`http://127.0.0.1:${address.port}/`);
    });
  });
}

async function sendRuntimeMessage<T>(
  page: Page,
  message: Record<string, unknown>
): Promise<T> {
  return page.evaluate((payload) => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(response);
      });
    });
  }, message) as Promise<T>;
}

async function ensureAuthenticated(
  extensionContext: BrowserContext,
  extensionId: string,
  extensionPage: Page
) {
  if (
    (await extensionPage.getByRole("button", { name: "Sign in" }).count()) === 0
  ) {
    await expect(extensionPage).not.toHaveURL(/\/login$/);
    return;
  }

  const authTabPromise = extensionContext.waitForEvent("page", (page) => {
    return !page.url().startsWith(`chrome-extension://${extensionId}`);
  });

  await extensionPage.getByRole("button", { name: "Sign in" }).click();

  const authTab = await authTabPromise;
  await authTab.waitForLoadState("domcontentloaded");

  await expect(authTab).toHaveURL(/localhost:7600\/user_management\/authorize/);
  await expect(authTab.getByText("FAKE WORKOS - LOCAL DEV")).toBeVisible();

  const closePromise = authTab.waitForEvent("close");
  await authTab.getByRole("button", { name: "Continue" }).click();
  await closePromise;

  await expect(extensionPage).not.toHaveURL(/\/login$/);
  await expect(extensionPage.getByText(/⇧|Ctrl\+E/)).toBeVisible();
}

async function submitMessageThroughUi(page: Page, message: string) {
  const editor = page.locator(".tiptap.ProseMirror").first();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type(message);
  await page.keyboard.press("Enter");
}

async function selectAgentThroughUi(page: Page, agentName: string) {
  const agentCard = page
    .locator('[role="button"]')
    .filter({ hasText: agentName })
    .first();

  await expect(agentCard).toBeVisible();
  await agentCard.click();

  await expect(page.locator(".tiptap.ProseMirror").first()).toContainText(
    `@${agentName}`
  );
}

async function waitForSecretInUi(page: Page, secret: string): Promise<void> {
  const deadline = Date.now() + 90_000;
  const secretLocator = page.getByText(secret, { exact: false });
  const virtuosoLicenseWarning = page.getByText(
    /VirtuosoMessageListLicense is missing a license key/i
  );

  while (Date.now() < deadline) {
    if ((await secretLocator.count()) > 0) {
      await expect(secretLocator.first()).toBeVisible();
      return;
    }

    if ((await virtuosoLicenseWarning.count()) > 0) {
      if (await virtuosoLicenseWarning.first().isVisible()) {
        throw new Error(
          "Conversation UI did not render because the Virtuoso message list license key is missing."
        );
      }
    }

    const allowButton = page.getByRole("button", { name: "Allow" });
    if ((await allowButton.count()) > 0) {
      const firstAllow = allowButton.first();
      if (await firstAllow.isVisible()) {
        await firstAllow.click();
        await page.waitForTimeout(500);
        continue;
      }
    }

    const retryButton = page.getByRole("button", { name: "Retry" });
    if ((await retryButton.count()) > 0) {
      const firstRetry = retryButton.first();
      if (await firstRetry.isVisible()) {
        throw new Error(
          "Agent conversation reached a visible error state requiring retry."
        );
      }
    }

    await page.waitForTimeout(750);
  }

  throw new Error(
    "Timed out waiting for the hidden secret to appear in the UI."
  );
}

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
    test.beforeAll(async () => {
      fixtureServerUrl = await startFixtureServer();
    });

    test.afterAll(async () => {
      if (!fixtureServer) {
        return;
      }

      fixtureServer.closeAllConnections?.();

      await new Promise<void>((resolve, reject) => {
        fixtureServer?.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          fixtureServer = null;
          resolve();
        });
      });
    });

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
      await ensureAuthenticated(extensionContext, extensionId, extensionPage);
      await expect(
        extensionPage.getByRole("button", { name: "Sign in" })
      ).toHaveCount(0);
    });

    test("reads the active localhost page content", async ({
      extensionContext,
      extensionId,
      extensionPage,
    }) => {
      await ensureAuthenticated(extensionContext, extensionId, extensionPage);

      const targetPage = await extensionContext.newPage();
      try {
        await targetPage.goto(fixtureServerUrl);
        await expect(targetPage).toHaveTitle("Local Extension Fixture");

        const capture = await sendRuntimeMessage<{
          title: string;
          url: string;
          content?: string;
          error?: string;
        }>(extensionPage, {
          type: "GET_ACTIVE_TAB",
          includeContent: true,
          includeCapture: false,
        });

        expect(capture.error).toBeUndefined();
        expect(capture.title).toBe("Local Extension Fixture");
        expect(capture.url).toBe(fixtureServerUrl);

        const normalizedContent = capture.content?.replace(/\s+/g, " ").trim();
        expect(normalizedContent).toContain("# Extension Fixture");
        expect(normalizedContent).toContain("Alpha beta gamma delta.");
        expect(normalizedContent).toContain(visibleDecoy);
        expect(normalizedContent).toContain(hiddenSecret);
        expect(normalizedContent).toContain("- First bullet");
        expect(normalizedContent).toContain("- Second bullet");
      } finally {
        await targetPage.close();
      }
    });

    test("asks an agent for the hidden page secret and verifies the reply", async ({
      extensionContext,
      extensionId,
      extensionPage,
    }) => {
      await ensureAuthenticated(extensionContext, extensionId, extensionPage);

      const targetPage = await extensionContext.newPage();
      try {
        await targetPage.goto(fixtureServerUrl);
        await expect(targetPage).toHaveTitle("Local Extension Fixture");
        await extensionPage.goto(`chrome-extension://${extensionId}/main.html`);

        await selectAgentThroughUi(extensionPage, defaultAgentName);

        await submitMessageThroughUi(
          extensionPage,
          "Read the browser tab titled Local Extension Fixture and tell me the hidden secret string from that page."
        );

        await expect(extensionPage).toHaveURL(
          /\/w\/[^/]+\/conversation\/[^/]+/
        );
        await waitForSecretInUi(extensionPage, hiddenSecret);
      } finally {
        await targetPage.close();
      }
    });
  });
