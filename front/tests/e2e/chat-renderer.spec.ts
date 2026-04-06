import { expect, request, test, type Page, type Route } from "@playwright/test";
import { config } from "dotenv";
import { resolve } from "path";
import { Client } from "pg";

config({ path: resolve(__dirname, "../../../.env") });

const API_BASE_URL = process.env.DUST_API_URL ?? "http://localhost:3000";
const APP_BASE_URL = process.env.DUST_APP_URL ?? "http://localhost:3011";
const DATABASE_URL =
  process.env.E2E_FRONT_DATABASE_URI ??
  "postgres://dev:dev@localhost:5432/dust_front";
const ADMIN_EMAIL = "admin@dust.local";
const ADMIN_WORKOS_USER_ID = "user_fake_4edd9f38";
const WORKSPACE_ID =
  process.env.DUST_UI_WORKSPACE_ID ??
  process.env.DUST_WORKSPACE_ID ??
  "tCaLBR44sT";
const AGENT_CONFIG_ID = process.env.DUST_AGENT_CONFIG_ID ?? "orTest01";
const DEFAULT_USER_CONTEXT = {
  timezone: "UTC",
  username: "e2e-renderer",
  fullName: "E2E Renderer",
  email: "e2e-renderer@dust.local",
  origin: "api" as const,
};

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueSid(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 12)}`;
}

function sessionApiUrl(path: string): string {
  return `${API_BASE_URL}/api/w/${WORKSPACE_ID}${path}`;
}

function appConversationUrl(conversationId: string, hash?: string): string {
  const query = `?region=us-central1&regionUrl=${encodeURIComponent(API_BASE_URL)}`;
  const suffix = hash ? `#${hash}` : "";
  return `${APP_BASE_URL}/w/${WORKSPACE_ID}/conversation/${conversationId}${query}${suffix}`;
}

function appNewConversationUrl(): string {
  const query = `?region=us-central1&regionUrl=${encodeURIComponent(API_BASE_URL)}`;
  return `${APP_BASE_URL}/w/${WORKSPACE_ID}/conversation/new${query}`;
}

type CreatedConversation = {
  conversationId: string;
  initialBody: any;
};

async function sessionGet(
  page: Page,
  path: string
) {
  const requestContext = await request.newContext({
    storageState: await page.context().storageState(),
  });
  try {
    const response = await requestContext.get(sessionApiUrl(path));
    const body = await response.json().catch(() => null);
    return { body, ok: response.ok(), status: response.status() };
  } finally {
    await requestContext.dispose();
  }
}

async function sessionPost(
  page: Page,
  path: string,
  payload: unknown
) {
  const requestContext = await request.newContext({
    storageState: await page.context().storageState(),
  });
  try {
    const response = await requestContext.post(sessionApiUrl(path), {
      data: payload,
    });
    const body = await response.json().catch(() => null);
    return { body, ok: response.ok(), status: response.status() };
  } finally {
    await requestContext.dispose();
  }
}

async function createConversation(
  page: Page,
  params: {
    blocking?: boolean;
    mentions?: { configurationId: string }[];
    message: string;
    title: string;
  }
): Promise<CreatedConversation> {
  const { blocking = false, mentions = [], message, title } = params;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { body, ok } = await sessionPost(page, "/assistant/conversations", {
      blocking,
      contentFragments: [],
      spaceId: null,
      title,
      visibility: "unlisted",
      message: {
        content: message,
        mentions,
        context: {
          origin: "web",
          profilePictureUrl: null,
          timezone: DEFAULT_USER_CONTEXT.timezone,
        },
      },
    });

    if (ok) {
      return {
        conversationId: body.conversation.sId,
        initialBody: body,
      };
    }

    if (body?.error?.type !== "rate_limit_error" || attempt === 4) {
      expect(ok, `Failed to create conversation: ${JSON.stringify(body)}`).toBe(
        true
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
  }

  throw new Error(`Failed to create conversation for title ${title}.`);
}

async function addMessage(
  page: Page,
  params: {
    blocking?: boolean;
    content: string;
    conversationId: string;
    mentions?: { configurationId: string }[];
  }
): Promise<any> {
  const { blocking = false, content, conversationId, mentions = [] } = params;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { body, ok } = await sessionPost(
      page,
      `/assistant/conversations/${conversationId}/messages`,
      {
        blocking,
        content,
        context: {
          origin: "web",
          profilePictureUrl: null,
          timezone: DEFAULT_USER_CONTEXT.timezone,
        },
        mentions,
      }
    );

    if (ok) {
      return body;
    }

    if (body?.error?.type !== "rate_limit_error" || attempt === 4) {
      expect(
        ok,
        `Failed to add message to conversation ${conversationId}: ${JSON.stringify(body)}`
      ).toBe(true);
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
  }
}

function findAgentMessages(conversationBody: any) {
  const getTimestamp = (message: any) => {
    const value = message.created ?? message.createdAt ?? 0;
    if (typeof value === "number") {
      return value;
    }

    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  return (conversationBody.messages ?? [])
    .filter((message: any) => message.type === "agent_message")
    .sort((a: any, b: any) => {
      const versionDelta = (Number(b.version) || 0) - (Number(a.version) || 0);
      if (versionDelta !== 0) {
        return versionDelta;
      }

      return getTimestamp(b) - getTimestamp(a);
    });
}

async function waitForAgentMessage(
  page: Page,
  conversationId: string
) {
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    const conversation = await sessionGet(
      page,
      `/assistant/conversations/${conversationId}/messages?limit=20&newResponseFormat=1`
    );
    expect(conversation.ok).toBe(true);

    const agentMessage = findAgentMessages(conversation.body)[0];
    if (
      agentMessage?.status === "succeeded" ||
      agentMessage?.status === "failed"
    ) {
      return agentMessage;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `Timed out waiting for agent message completion in conversation ${conversationId}.`
  );
}

async function waitForAgentMessageAfterVersion(
  page: Page,
  conversationId: string,
  previousVersion: number
) {
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    const conversation = await sessionGet(
      page,
      `/assistant/conversations/${conversationId}/messages?limit=20&newResponseFormat=1`
    );
    expect(conversation.ok).toBe(true);

    const agentMessage = findAgentMessages(conversation.body).find(
      (message: any) => (Number(message.version) || 0) > previousVersion
    );

    if (
      agentMessage &&
      (agentMessage.status === "succeeded" || agentMessage.status === "failed")
    ) {
      return agentMessage;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `Timed out waiting for a retried agent message in conversation ${conversationId}.`
  );
}

async function ensureAuthenticated(page: Page) {
  await page.goto(
    `${API_BASE_URL}/api/auth/login?returnTo=${encodeURIComponent(appNewConversationUrl())}`
  );

  const continueButton = page.getByRole("button", { name: "Continue" });
  if (await continueButton.isVisible().catch(() => false)) {
    await continueButton.click();
  }

  await page.waitForURL(/\/w\/.+\/conversation\/(new|[A-Za-z0-9]+)/, {
    timeout: 30_000,
  });
}

async function openConversation(
  page: Page,
  conversationId: string,
  hash?: string
) {
  await page.goto(appConversationUrl(conversationId, hash));
  await expect(
    page.getByRole("button", { name: "Files", exact: true })
  ).toBeVisible();
  await expect(page.locator(".tiptap.ProseMirror").first()).toBeVisible();
}

async function routeConversationEventsOnce(
  page: Page,
  params: {
    conversationId: string;
    eventPayload: unknown;
  }
) {
  let served = false;
  const pattern = `**/assistant/conversations/${params.conversationId}/events*`;

  await page.route(pattern, async (route: Route) => {
    if (served) {
      await route.fulfill({
        status: 200,
        headers: {
          "cache-control": "no-cache",
          "content-type": "text/event-stream",
        },
        body: "",
      });
      return;
    }

    served = true;
    await route.fulfill({
      status: 200,
      headers: {
        "cache-control": "no-cache",
        "content-type": "text/event-stream",
      },
      body: `data: ${JSON.stringify(params.eventPayload)}\n\n`,
    });
  });
}

async function routeRetriedAgentMessageSuccessOnce(
  page: Page,
  params: {
    conversationId: string;
    token: string;
  }
) {
  let served = false;
  const pattern = `**/assistant/conversations/${params.conversationId}/messages/*/events*`;

  await page.route(pattern, async (route: Route) => {
    if (served) {
      await route.fulfill({
        status: 200,
        headers: {
          "cache-control": "no-cache",
          "content-type": "text/event-stream",
        },
        body: "",
      });
      return;
    }

    served = true;

    const url = new URL(route.request().url());
    const messageId = url.pathname.split("/messages/")[1]?.split("/events")[0];
    expect(
      messageId,
      "Retried message stream request did not include a messageId"
    ).toBeTruthy();

    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();

    try {
      const now = new Date();
      await client.query(
        `UPDATE agent_messages
            SET status = 'succeeded',
                "errorCode" = null,
                "errorMessage" = null,
                "errorMetadata" = null,
                "completedAt" = $2
          WHERE id = (
            SELECT "agentMessageId" FROM messages WHERE "sId" = $1 LIMIT 1
          )`,
        [messageId, now.toISOString()]
      );

      await client.query(
        `INSERT INTO agent_step_contents
          ("createdAt", "updatedAt", "agentMessageId", step, index, version, type, value, "workspaceId")
         SELECT
          $2, $2, m."agentMessageId", 0, 0, 0, 'text_content', $3::jsonb, m."workspaceId"
         FROM messages m
         WHERE m."sId" = $1`,
        [
          messageId,
          now.toISOString(),
          JSON.stringify({
            type: "text_content",
            value: params.token,
            metadata: {
              phase: "final_answer",
              modelId: "fixture-model",
              clientId: "playwright",
            },
          }),
        ]
      );

      const messageRow = await client.query<{
        version: string;
        rank: string;
        parentMessageSId: string;
        agentMessageId: string;
        configurationName: string;
        configurationPictureUrl: string | null;
        configurationStatus: string;
      }>(
        `SELECT
            m.version,
            m.rank,
            parent."sId" AS "parentMessageSId",
            am.id AS "agentMessageId",
            ac.name AS "configurationName",
            ac."pictureUrl" AS "configurationPictureUrl",
            ac.status AS "configurationStatus"
          FROM messages m
          JOIN agent_messages am ON am.id = m."agentMessageId"
          LEFT JOIN messages parent ON parent.id = m."parentId"
          JOIN agent_configurations ac
            ON ac."workspaceId" = m."workspaceId"
           AND ac."sId" = am."agentConfigurationId"
         WHERE m."sId" = $1
         LIMIT 1`,
        [messageId]
      );

      expect(
        messageRow.rows[0],
        `Failed to load retried message ${messageId}`
      ).toBeTruthy();
      const message = messageRow.rows[0];

      await route.fulfill({
        status: 200,
        headers: {
          "cache-control": "no-cache",
          "content-type": "text/event-stream",
        },
        body: `data: ${JSON.stringify({
          eventId: uniqueSid("evt"),
          data: {
            type: "agent_message_success",
            created: now.getTime(),
            configurationId: AGENT_CONFIG_ID,
            messageId,
            runIds: [],
            message: {
              id: Number(message.agentMessageId),
              agentMessageId: Number(message.agentMessageId),
              type: "agent_message",
              sId: messageId,
              version: Number(message.version),
              rank: Number(message.rank),
              branchId: null,
              created: now.getTime(),
              completedTs: now.getTime(),
              parentMessageId: message.parentMessageSId,
              parentAgentMessageId: null,
              status: "succeeded",
              content: params.token,
              chainOfThought: null,
              error: null,
              visibility: "visible",
              richMentions: [],
              completionDurationMs: 250,
              reactions: [],
              prunedContext: false,
              configuration: {
                sId: AGENT_CONFIG_ID,
                name: message.configurationName,
                pictureUrl:
                  message.configurationPictureUrl ??
                  "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg",
                status: message.configurationStatus,
                canRead: true,
              },
              skipToolsValidation: false,
              actions: [],
              contents: [
                {
                  step: 0,
                  content: {
                    type: "text_content",
                    value: params.token,
                    metadata: {
                      phase: "final_answer",
                      modelId: "fixture-model",
                      clientId: "playwright",
                    },
                  },
                },
              ],
              modelInteractionDurationMs: 250,
            },
          },
        })}\n\n`,
      });
    } finally {
      await client.end();
    }
  });
}

async function createLongConversation(
  _page: Page,
  messageCount = 60
) {
  const seed = uniqueId("long");
  const messages = Array.from({ length: messageCount }, (_, index) => {
    return `${seed}-message-${String(index + 1).padStart(2, "0")}`;
  });
  const seeded = await seedConversationInDb({
    messageContents: messages,
    title: `${seed}-title`,
  });

  return {
    conversationId: seeded.conversationId,
    messageSids: seeded.messageSids,
    messages,
    seed,
  };
}

async function createPaginatedConversation(
  _page: Page
) {
  const seed = uniqueId("paginated");
  const messages = Array.from({ length: 52 }, (_, index) => {
    return `${seed}-message-${String(index + 1).padStart(2, "0")}`;
  });
  const seeded = await seedConversationInDb({
    messageContents: messages,
    title: `${seed}-title`,
  });

  return {
    conversationId: seeded.conversationId,
    messageSids: seeded.messageSids,
    messages,
    seed,
  };
}

async function seedConversationInDb(params: {
  messageContents: Array<
    | string
    | {
        content: string;
        createdAt?: string;
      }
  >;
  title: string;
}) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const workspaceRow = await client.query<{ id: string }>(
      'SELECT id FROM workspaces WHERE "sId" = $1 LIMIT 1',
      [WORKSPACE_ID]
    );
    const adminUser = await getAdminUser(client);

    expect(
      workspaceRow.rows[0]?.id,
      "Workspace row not found for UI tests"
    ).toBeTruthy();
    expect(adminUser.id, "Admin user not found for UI tests").toBeTruthy();

    const workspaceModelId = Number(workspaceRow.rows[0].id);
    const userId = Number(adminUser.id);
    const conversationSId = uniqueSid("cv");
    const now = new Date();

    const conversationInsert = await client.query<{ id: string }>(
      `INSERT INTO conversations
        ("createdAt", "updatedAt", "sId", title, visibility, depth, "workspaceId", "requestedSpaceIds", "hasError", metadata)
       VALUES
        ($1, $1, $2, $3, 'unlisted', 0, $4, ARRAY[]::bigint[], false, '{}'::jsonb)
       RETURNING id`,
      [now.toISOString(), conversationSId, params.title, workspaceModelId]
    );

    const conversationId = Number(conversationInsert.rows[0].id);

    await client.query(
      `INSERT INTO conversation_participants
        ("createdAt", "updatedAt", action, unread, "actionRequired", "workspaceId", "conversationId", "userId")
       VALUES
        ($1, $1, 'participating', false, false, $2, $3, $4)`,
      [now.toISOString(), workspaceModelId, conversationId, userId]
    );

    const messageSids: string[] = [];

    for (const [index, message] of params.messageContents.entries()) {
      const content = typeof message === "string" ? message : message.content;
      const createdAt =
        typeof message === "string"
          ? new Date(now.getTime() + index * 1_000).toISOString()
          : (message.createdAt ??
            new Date(now.getTime() + index * 1_000).toISOString());
      const userMessageInsert = await client.query<{ id: string }>(
        `INSERT INTO user_messages
          ("createdAt", "updatedAt", content, "workspaceId", "userId",
           "userContextUsername", "userContextTimezone", "userContextFullName",
           "userContextEmail", "userContextOrigin", "localMCPServerIds", "clientSideMCPServerIds")
         VALUES
          ($1, $1, $2, $3, $4, 'admin', 'UTC', 'Admin', 'admin@dust.local', 'web',
           ARRAY[]::varchar[], ARRAY[]::varchar[])
         RETURNING id`,
        [createdAt, content, workspaceModelId, userId]
      );

      const userMessageId = Number(userMessageInsert.rows[0].id);
      const messageSId = uniqueSid("ms");
      messageSids.push(messageSId);

      await client.query(
        `INSERT INTO messages
          ("createdAt", "updatedAt", "sId", version, visibility, rank, "workspaceId", "conversationId", "userMessageId")
         VALUES
          ($1, $1, $2, 0, 'visible', $3, $4, $5, $6)`,
        [
          createdAt,
          messageSId,
          index,
          workspaceModelId,
          conversationId,
          userMessageId,
        ]
      );
    }

    return { conversationId: conversationSId, messageSids };
  } finally {
    await client.end();
  }
}

async function getAdminUserSId() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const adminUser = await getAdminUser(client);
    expect(adminUser.sId, "Admin user sId not found for UI tests").toBeTruthy();
    return adminUser.sId;
  } finally {
    await client.end();
  }
}

async function getAdminUser(client: Client) {
  const userRow = await client.query<{ id: string; sId: string }>(
    `SELECT id, "sId"
       FROM users
      WHERE email = $1
        AND "workOSUserId" = $2
      LIMIT 1`,
    [ADMIN_EMAIL, ADMIN_WORKOS_USER_ID]
  );

  expect(
    userRow.rows[0]?.id,
    `Admin user not found for UI tests (${ADMIN_EMAIL}, ${ADMIN_WORKOS_USER_ID})`
  ).toBeTruthy();

  return userRow.rows[0];
}

async function seedConversationWithAgentFixture(params: {
  action?: {
    doneLabel?: string;
    functionCallName?: string;
    runningLabel?: string;
  };
  agentConfigurationId?: string;
  agentContent?: string;
  agentError?: {
    code: string;
    message: string;
  };
  agentStatus: "failed" | "succeeded";
  fillerAfterCount?: number;
  title: string;
  userMessage: string;
}) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const workspaceRow = await client.query<{ id: string }>(
      'SELECT id FROM workspaces WHERE "sId" = $1 LIMIT 1',
      [WORKSPACE_ID]
    );
    const adminUser = await getAdminUser(client);

    expect(
      workspaceRow.rows[0]?.id,
      "Workspace row not found for UI tests"
    ).toBeTruthy();
    expect(adminUser.id, "Admin user not found for UI tests").toBeTruthy();

    const workspaceModelId = Number(workspaceRow.rows[0].id);
    const userId = Number(adminUser.id);
    const conversationSId = uniqueSid("cv");
    const userMessageSId = uniqueSid("ms");
    const agentMessageSId = uniqueSid("ms");
    const now = new Date();
    const agentCompletedAt = new Date(now.getTime() + 3_000).toISOString();

    const conversationInsert = await client.query<{ id: string }>(
      `INSERT INTO conversations
        ("createdAt", "updatedAt", "sId", title, visibility, depth, "workspaceId", "requestedSpaceIds", "hasError", metadata)
       VALUES
        ($1, $1, $2, $3, 'unlisted', 0, $4, ARRAY[]::bigint[], false, '{}'::jsonb)
       RETURNING id`,
      [now.toISOString(), conversationSId, params.title, workspaceModelId]
    );
    const conversationId = Number(conversationInsert.rows[0].id);

    await client.query(
      `INSERT INTO conversation_participants
        ("createdAt", "updatedAt", action, unread, "actionRequired", "workspaceId", "conversationId", "userId")
       VALUES
        ($1, $1, 'participating', false, false, $2, $3, $4)`,
      [now.toISOString(), workspaceModelId, conversationId, userId]
    );

    const userMessageInsert = await client.query<{ id: string }>(
      `INSERT INTO user_messages
        ("createdAt", "updatedAt", content, "workspaceId", "userId",
         "userContextUsername", "userContextTimezone", "userContextFullName",
         "userContextEmail", "userContextOrigin", "localMCPServerIds", "clientSideMCPServerIds")
       VALUES
        ($1, $1, $2, $3, $4, 'admin', 'UTC', 'Admin', 'admin@dust.local', 'web',
         ARRAY[]::varchar[], ARRAY[]::varchar[])
       RETURNING id`,
      [now.toISOString(), params.userMessage, workspaceModelId, userId]
    );
    const userMessageId = Number(userMessageInsert.rows[0].id);

    const userMessageRowInsert = await client.query<{ id: string }>(
      `INSERT INTO messages
        ("createdAt", "updatedAt", "sId", version, visibility, rank, "workspaceId", "conversationId", "userMessageId")
       VALUES
        ($1, $1, $2, 0, 'visible', 0, $3, $4, $5)
       RETURNING id`,
      [
        now.toISOString(),
        userMessageSId,
        workspaceModelId,
        conversationId,
        userMessageId,
      ]
    );
    const userMessageRowId = Number(userMessageRowInsert.rows[0].id);

    const agentMessageInsert = await client.query<{ id: string }>(
      `INSERT INTO agent_messages
        ("createdAt", "updatedAt", status, "errorCode", "errorMessage", "errorMetadata",
         "skipToolsValidation", "agentConfigurationId", "agentConfigurationVersion",
         "modelInteractionDurationMs", "completedAt", "prunedContext", "workspaceId")
       VALUES
        ($1, $1, $2, $3, $4, $5::jsonb, false, $6, 0, 1200, $7, false, $8)
       RETURNING id`,
      [
        now.toISOString(),
        params.agentStatus,
        params.agentError?.code ?? null,
        params.agentError?.message ?? null,
        params.agentError
          ? JSON.stringify({
              errorTitle:
                params.agentStatus === "failed"
                  ? "Something went wrong"
                  : undefined,
            })
          : null,
        params.agentConfigurationId ?? "dust",
        agentCompletedAt,
        workspaceModelId,
      ]
    );
    const agentMessageId = Number(agentMessageInsert.rows[0].id);

    await client.query(
      `INSERT INTO messages
        ("createdAt", "updatedAt", "sId", version, visibility, rank, "workspaceId",
         "conversationId", "agentMessageId", "parentId")
       VALUES
        ($1, $1, $2, 0, 'visible', 1, $3, $4, $5, $6)`,
      [
        agentCompletedAt,
        agentMessageSId,
        workspaceModelId,
        conversationId,
        agentMessageId,
        userMessageRowId,
      ]
    );

    if (params.action) {
      const functionCallId = uniqueSid("call");
      const stepContentInsert = await client.query<{ id: string }>(
        `INSERT INTO agent_step_contents
          ("createdAt", "updatedAt", "agentMessageId", step, index, version, type, value, "workspaceId")
         VALUES
          ($1, $1, $2, 0, 0, 0, 'function_call', $3::jsonb, $4)
         RETURNING id`,
        [
          now.toISOString(),
          agentMessageId,
          JSON.stringify({
            type: "function_call",
            value: {
              id: functionCallId,
              name:
                params.action.functionCallName ??
                "dust_chrome_extension__list_browser_tabs",
              arguments: "{}",
            },
          }),
          workspaceModelId,
        ]
      );

      await client.query(
        `INSERT INTO agent_mcp_actions
          ("createdAt", "updatedAt", "mcpServerConfigurationId", version, status,
           "citationsAllocated", "augmentedInputs", "toolConfiguration", "stepContext",
           "executionDurationMs", "workspaceId", "agentMessageId", "stepContentId")
         VALUES
          ($1, $1, 'fixture-tool', 0, 'succeeded', 0, '{}'::jsonb, $2::jsonb, '{}'::jsonb,
           450, $3, $4, $5)`,
        [
          now.toISOString(),
          JSON.stringify({
            sId: "fixture-tool",
            name:
              params.action.functionCallName ??
              "dust_chrome_extension__list_browser_tabs",
            type: "mcp_configuration",
            permission: "never_ask",
            originalName: "list_browser_tabs",
            toolServerId: "ims_fixture",
            mcpServerName: "dust_chrome_extension",
            mcpServerViewId: "msv_fixture",
            internalMCPServerId: "ims_fixture",
            displayLabels: {
              done: params.action.doneLabel ?? "Listed browser tabs",
              running: params.action.runningLabel ?? "Listing browser tabs",
            },
            additionalConfiguration: {},
          }),
          workspaceModelId,
          agentMessageId,
          Number(stepContentInsert.rows[0].id),
        ]
      );
    }

    if (params.agentContent) {
      await client.query(
        `INSERT INTO agent_step_contents
          ("createdAt", "updatedAt", "agentMessageId", step, index, version, type, value, "workspaceId")
         VALUES
          ($1, $1, $2, $3, 0, 0, 'text_content', $4::jsonb, $5)`,
        [
          agentCompletedAt,
          agentMessageId,
          params.action ? 1 : 0,
          JSON.stringify({
            type: "text_content",
            value: params.agentContent,
            metadata: {
              phase: "final_answer",
              modelId: "fixture-model",
              clientId: "playwright",
            },
          }),
          workspaceModelId,
        ]
      );
    }

    const fillerAfterCount = params.fillerAfterCount ?? 0;
    for (let index = 0; index < fillerAfterCount; index += 1) {
      const createdAt = new Date(
        now.getTime() + 4_000 + index * 1_000
      ).toISOString();
      const fillerInsert = await client.query<{ id: string }>(
        `INSERT INTO user_messages
          ("createdAt", "updatedAt", content, "workspaceId", "userId",
           "userContextUsername", "userContextTimezone", "userContextFullName",
           "userContextEmail", "userContextOrigin", "localMCPServerIds", "clientSideMCPServerIds")
         VALUES
          ($1, $1, $2, $3, $4, 'admin', 'UTC', 'Admin', 'admin@dust.local', 'web',
           ARRAY[]::varchar[], ARRAY[]::varchar[])
         RETURNING id`,
        [
          createdAt,
          `agent-fixture-filler-${index + 1}-${conversationSId}`,
          workspaceModelId,
          userId,
        ]
      );

      await client.query(
        `INSERT INTO messages
          ("createdAt", "updatedAt", "sId", version, visibility, rank, "workspaceId", "conversationId", "userMessageId")
         VALUES
          ($1, $1, $2, 0, 'visible', $3, $4, $5, $6)`,
        [
          createdAt,
          uniqueSid("ms"),
          index + 2,
          workspaceModelId,
          conversationId,
          Number(fillerInsert.rows[0].id),
        ]
      );
    }

    return { conversationId: conversationSId, agentMessageSId };
  } finally {
    await client.end();
  }
}

async function seedConversationWithInlineAttachment(params: {
  attachmentTitle: string;
  title: string;
  userMessage: string;
}) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const workspaceRow = await client.query<{ id: string }>(
      'SELECT id FROM workspaces WHERE "sId" = $1 LIMIT 1',
      [WORKSPACE_ID]
    );
    const adminUser = await getAdminUser(client);

    expect(
      workspaceRow.rows[0]?.id,
      "Workspace row not found for UI tests"
    ).toBeTruthy();
    expect(adminUser.id, "Admin user not found for UI tests").toBeTruthy();

    const workspaceModelId = Number(workspaceRow.rows[0].id);
    const userId = Number(adminUser.id);
    const conversationSId = uniqueSid("cv");
    const contentFragmentSId = uniqueSid("cf");
    const contentMessageSId = uniqueSid("ms");
    const userMessageSId = uniqueSid("ms");
    const now = new Date();

    const conversationInsert = await client.query<{ id: string }>(
      `INSERT INTO conversations
        ("createdAt", "updatedAt", "sId", title, visibility, depth, "workspaceId", "requestedSpaceIds", "hasError", metadata)
       VALUES
        ($1, $1, $2, $3, 'unlisted', 0, $4, ARRAY[]::bigint[], false, '{}'::jsonb)
       RETURNING id`,
      [now.toISOString(), conversationSId, params.title, workspaceModelId]
    );
    const conversationId = Number(conversationInsert.rows[0].id);

    await client.query(
      `INSERT INTO conversation_participants
        ("createdAt", "updatedAt", action, unread, "actionRequired", "workspaceId", "conversationId", "userId")
       VALUES
        ($1, $1, 'participating', false, false, $2, $3, $4)`,
      [now.toISOString(), workspaceModelId, conversationId, userId]
    );

    const contentFragmentInsert = await client.query<{ id: string }>(
      `INSERT INTO content_fragments
        ("createdAt", "updatedAt", "sId", title, "contentType", "sourceUrl", "textBytes",
         version, "workspaceId", "userId", "userContextUsername", "userContextFullName",
         "userContextEmail", "userContextProfilePictureUrl", "nodeId", "nodeDataSourceViewId",
         "nodeType", "expiredReason", "spaceId", "fileId")
       VALUES
        ($1, $1, $2, $3, 'text/plain', 'https://example.com/attachment.txt', 12,
         'latest', $4, $5, 'admin', 'Admin', 'admin@dust.local', null, null, null,
         null, 'data_source_deleted', null, null)
       RETURNING id`,
      [
        now.toISOString(),
        contentFragmentSId,
        params.attachmentTitle,
        workspaceModelId,
        userId,
      ]
    );
    const contentFragmentId = Number(contentFragmentInsert.rows[0].id);

    await client.query(
      `INSERT INTO messages
        ("createdAt", "updatedAt", "sId", version, visibility, rank, "workspaceId",
         "conversationId", "contentFragmentId")
       VALUES
        ($1, $1, $2, 0, 'visible', 0, $3, $4, $5)`,
      [
        now.toISOString(),
        contentMessageSId,
        workspaceModelId,
        conversationId,
        contentFragmentId,
      ]
    );

    const userMessageInsert = await client.query<{ id: string }>(
      `INSERT INTO user_messages
        ("createdAt", "updatedAt", content, "workspaceId", "userId",
         "userContextUsername", "userContextTimezone", "userContextFullName",
         "userContextEmail", "userContextOrigin", "localMCPServerIds", "clientSideMCPServerIds")
       VALUES
        ($1, $1, $2, $3, $4, 'admin', 'UTC', 'Admin', 'admin@dust.local', 'web',
         ARRAY[]::varchar[], ARRAY[]::varchar[])
       RETURNING id`,
      [
        new Date(now.getTime() + 1_000).toISOString(),
        params.userMessage,
        workspaceModelId,
        userId,
      ]
    );

    await client.query(
      `INSERT INTO messages
        ("createdAt", "updatedAt", "sId", version, visibility, rank, "workspaceId",
         "conversationId", "userMessageId")
       VALUES
        ($1, $1, $2, 0, 'visible', 1, $3, $4, $5)`,
      [
        new Date(now.getTime() + 1_000).toISOString(),
        userMessageSId,
        workspaceModelId,
        conversationId,
        Number(userMessageInsert.rows[0].id),
      ]
    );

    return { conversationId: conversationSId };
  } finally {
    await client.end();
  }
}

async function _seedConversationWithBlockedValidation(params: {
  fillerAfterCount?: number;
  fillerContentRepeat?: number;
  humanReadableDescription?: string;
  title: string;
  userMessage: string;
}) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const workspaceRow = await client.query<{ id: string }>(
      'SELECT id FROM workspaces WHERE "sId" = $1 LIMIT 1',
      [WORKSPACE_ID]
    );
    const adminUser = await getAdminUser(client);

    expect(
      workspaceRow.rows[0]?.id,
      "Workspace row not found for UI tests"
    ).toBeTruthy();
    expect(adminUser.id, "Admin user not found for UI tests").toBeTruthy();

    const workspaceModelId = Number(workspaceRow.rows[0].id);
    const userId = Number(adminUser.id);
    const now = new Date();
    const conversationSId = uniqueSid("cv");
    const userMessageSId = uniqueSid("ms");
    const agentMessageSId = uniqueSid("ms");

    const conversationInsert = await client.query<{ id: string }>(
      `INSERT INTO conversations
        ("createdAt", "updatedAt", "sId", title, visibility, depth, "workspaceId", "requestedSpaceIds", "hasError", metadata)
       VALUES
        ($1, $1, $2, $3, 'unlisted', 0, $4, ARRAY[]::bigint[], false, '{}'::jsonb)
       RETURNING id`,
      [now.toISOString(), conversationSId, params.title, workspaceModelId]
    );
    const conversationId = Number(conversationInsert.rows[0].id);

    await client.query(
      `INSERT INTO conversation_participants
        ("createdAt", "updatedAt", action, unread, "actionRequired", "workspaceId", "conversationId", "userId")
       VALUES
        ($1, $1, 'participating', false, true, $2, $3, $4)`,
      [now.toISOString(), workspaceModelId, conversationId, userId]
    );

    const userMessageInsert = await client.query<{ id: string }>(
      `INSERT INTO user_messages
        ("createdAt", "updatedAt", content, "workspaceId", "userId",
         "userContextUsername", "userContextTimezone", "userContextFullName",
         "userContextEmail", "userContextOrigin", "localMCPServerIds", "clientSideMCPServerIds")
       VALUES
        ($1, $1, $2, $3, $4, 'admin', 'UTC', 'Admin', 'admin@dust.local', 'web',
         ARRAY[]::varchar[], ARRAY[]::varchar[])
       RETURNING id`,
      [now.toISOString(), params.userMessage, workspaceModelId, userId]
    );
    const userMessageId = Number(userMessageInsert.rows[0].id);

    const userMessageRowInsert = await client.query<{ id: string }>(
      `INSERT INTO messages
        ("createdAt", "updatedAt", "sId", version, visibility, rank, "workspaceId", "conversationId", "userMessageId")
       VALUES
        ($1, $1, $2, 0, 'visible', 0, $3, $4, $5)
       RETURNING id`,
      [
        now.toISOString(),
        userMessageSId,
        workspaceModelId,
        conversationId,
        userMessageId,
      ]
    );
    const userMessageRowId = Number(userMessageRowInsert.rows[0].id);

    const agentMessageInsert = await client.query<{ id: string }>(
      `INSERT INTO agent_messages
        ("createdAt", "updatedAt", status, "errorCode", "errorMessage", "errorMetadata",
         "skipToolsValidation", "agentConfigurationId", "agentConfigurationVersion",
         "modelInteractionDurationMs", "completedAt", "prunedContext", "workspaceId")
       VALUES
        ($1, $1, 'succeeded', null, null, null, false, $2, 0, 1200, $1, false, $3)
       RETURNING id`,
      [
        new Date(now.getTime() + 1_000).toISOString(),
        AGENT_CONFIG_ID,
        workspaceModelId,
      ]
    );
    const agentMessageId = Number(agentMessageInsert.rows[0].id);

    await client.query<{ id: string }>(
      `INSERT INTO messages
        ("createdAt", "updatedAt", "sId", version, visibility, rank, "workspaceId",
         "conversationId", "agentMessageId", "parentId")
       VALUES
        ($1, $1, $2, 0, 'visible', 1, $3, $4, $5, $6)
       RETURNING id`,
      [
        new Date(now.getTime() + 1_000).toISOString(),
        agentMessageSId,
        workspaceModelId,
        conversationId,
        agentMessageId,
        userMessageRowId,
      ]
    );

    const stepContentInsert = await client.query<{ id: string }>(
      `INSERT INTO agent_step_contents
        ("createdAt", "updatedAt", "agentMessageId", step, index, version, type, value, "workspaceId")
       VALUES
        ($1, $1, $2, 0, 0, 0, 'function_call', $3::jsonb, $4)
       RETURNING id`,
      [
        new Date(now.getTime() + 1_500).toISOString(),
        agentMessageId,
        JSON.stringify({
          type: "function_call",
          value: {
            id: uniqueSid("call"),
            name: "dust_chrome_extension__interact_with_page",
            arguments: JSON.stringify({
              humanReadableDescription:
                params.humanReadableDescription ?? "click the secret button",
            }),
          },
        }),
        workspaceModelId,
      ]
    );

    await client.query(
      `INSERT INTO agent_mcp_actions
        ("createdAt", "updatedAt", "mcpServerConfigurationId", version, status,
         "citationsAllocated", "augmentedInputs", "toolConfiguration", "stepContext",
         "executionDurationMs", "workspaceId", "agentMessageId", "stepContentId")
       VALUES
        ($1, $1, 'fixture-tool', 0, 'blocked_validation_required', 0, $2::jsonb, $3::jsonb, '{}'::jsonb,
         null, $4, $5, $6)`,
      [
        new Date(now.getTime() + 2_000).toISOString(),
        JSON.stringify({
          humanReadableDescription:
            params.humanReadableDescription ?? "click the secret button",
        }),
        JSON.stringify({
          sId: "fixture-tool",
          name: "interact_with_page",
          type: "mcp_configuration",
          permission: "high",
          originalName: "interact_with_page",
          toolServerId: "ims_fixture",
          mcpServerName: "dust-chrome-extension",
          internalMCPServerId: "ims_fixture",
          displayLabels: {
            done: "Interacted with the page",
            running: "Interacting with the page",
          },
          additionalConfiguration: {},
        }),
        workspaceModelId,
        agentMessageId,
        Number(stepContentInsert.rows[0].id),
      ]
    );

    const fillerAfterCount = params.fillerAfterCount ?? 0;
    const fillerContentRepeat = params.fillerContentRepeat ?? 1;
    for (let index = 0; index < fillerAfterCount; index += 1) {
      const createdAt = new Date(
        now.getTime() + 3_000 + index * 1_000
      ).toISOString();
      const fillerInsert = await client.query<{ id: string }>(
        `INSERT INTO user_messages
          ("createdAt", "updatedAt", content, "workspaceId", "userId",
           "userContextUsername", "userContextTimezone", "userContextFullName",
           "userContextEmail", "userContextOrigin", "localMCPServerIds", "clientSideMCPServerIds")
         VALUES
          ($1, $1, $2, $3, $4, 'admin', 'UTC', 'Admin', 'admin@dust.local', 'web',
           ARRAY[]::varchar[], ARRAY[]::varchar[])
         RETURNING id`,
        [
          createdAt,
          Array.from(
            { length: fillerContentRepeat },
            () => `blocked-validation-filler-${index + 1}-${conversationSId}`
          ).join(" "),
          workspaceModelId,
          userId,
        ]
      );

      await client.query(
        `INSERT INTO messages
          ("createdAt", "updatedAt", "sId", version, visibility, rank, "workspaceId", "conversationId", "userMessageId")
         VALUES
          ($1, $1, $2, 0, 'visible', $3, $4, $5, $6)`,
        [
          createdAt,
          uniqueSid("ms"),
          index + 2,
          workspaceModelId,
          conversationId,
          Number(fillerInsert.rows[0].id),
        ]
      );
    }

    return { conversationId: conversationSId };
  } finally {
    await client.end();
  }
}

async function seedConversationWithBranchApproval(params: {
  action?: {
    doneLabel?: string;
    functionCallName?: string;
    runningLabel?: string;
  };
  agentConfigurationId?: string;
  branchAgentContent: string;
  title: string;
  userMessage: string;
}) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const workspaceRow = await client.query<{ id: string }>(
      'SELECT id FROM workspaces WHERE "sId" = $1 LIMIT 1',
      [WORKSPACE_ID]
    );
    const adminUser = await getAdminUser(client);
    const agentConfigurationRow = await client.query<{
      name: string;
      pictureUrl: string | null;
      status: string;
    }>(
      `SELECT name, "pictureUrl", status
         FROM agent_configurations
        WHERE "workspaceId" = $1
          AND "sId" = $2
        LIMIT 1`,
      [
        Number(workspaceRow.rows[0].id),
        params.agentConfigurationId ?? AGENT_CONFIG_ID,
      ]
    );

    expect(
      workspaceRow.rows[0]?.id,
      "Workspace row not found for UI tests"
    ).toBeTruthy();
    expect(adminUser.id, "Admin user not found for UI tests").toBeTruthy();
    expect(
      agentConfigurationRow.rows[0]?.name,
      "Agent configuration not found for branch approval UI tests"
    ).toBeTruthy();

    const workspaceModelId = Number(workspaceRow.rows[0].id);
    const userId = Number(adminUser.id);
    const now = new Date();
    const conversationSId = uniqueSid("cv");
    const userMessageSId = uniqueSid("ms");
    const branchAgentMessageSId = uniqueSid("ms");
    const branchDisplayId = uniqueSid("branch");
    const branchCompletedAt = new Date(now.getTime() + 3_000).toISOString();

    const conversationInsert = await client.query<{ id: string }>(
      `INSERT INTO conversations
        ("createdAt", "updatedAt", "sId", title, visibility, depth, "workspaceId", "requestedSpaceIds", "hasError", metadata)
       VALUES
        ($1, $1, $2, $3, 'unlisted', 0, $4, ARRAY[]::bigint[], false, '{}'::jsonb)
       RETURNING id`,
      [now.toISOString(), conversationSId, params.title, workspaceModelId]
    );
    const conversationId = Number(conversationInsert.rows[0].id);

    await client.query(
      `INSERT INTO conversation_participants
        ("createdAt", "updatedAt", action, unread, "actionRequired", "workspaceId", "conversationId", "userId")
       VALUES
        ($1, $1, 'participating', false, false, $2, $3, $4)`,
      [now.toISOString(), workspaceModelId, conversationId, userId]
    );

    const userMessageInsert = await client.query<{ id: string }>(
      `INSERT INTO user_messages
        ("createdAt", "updatedAt", content, "workspaceId", "userId",
         "userContextUsername", "userContextTimezone", "userContextFullName",
         "userContextEmail", "userContextOrigin", "localMCPServerIds", "clientSideMCPServerIds")
       VALUES
        ($1, $1, $2, $3, $4, 'admin', 'UTC', 'Admin', 'admin@dust.local', 'web',
         ARRAY[]::varchar[], ARRAY[]::varchar[])
       RETURNING id`,
      [now.toISOString(), params.userMessage, workspaceModelId, userId]
    );
    const userMessageId = Number(userMessageInsert.rows[0].id);

    const userMessageRowInsert = await client.query<{ id: string }>(
      `INSERT INTO messages
        ("createdAt", "updatedAt", "sId", version, visibility, rank, "workspaceId", "conversationId", "userMessageId")
       VALUES
        ($1, $1, $2, 0, 'visible', 0, $3, $4, $5)
       RETURNING id`,
      [
        now.toISOString(),
        userMessageSId,
        workspaceModelId,
        conversationId,
        userMessageId,
      ]
    );
    const userMessageRowId = Number(userMessageRowInsert.rows[0].id);

    const branchInsert = await client.query<{ id: string }>(
      `INSERT INTO conversation_branches
        ("createdAt", "updatedAt", state, "workspaceId", "conversationId", "userId", "previousMessageId")
       VALUES
        ($1, $1, 'open', $2, $3, $4, $5)
       RETURNING id`,
      [
        new Date(now.getTime() + 1_000).toISOString(),
        workspaceModelId,
        conversationId,
        userId,
        userMessageRowId,
      ]
    );
    const branchId = Number(branchInsert.rows[0].id);

    const agentMessageInsert = await client.query<{ id: string }>(
      `INSERT INTO agent_messages
        ("createdAt", "updatedAt", status, "errorCode", "errorMessage", "errorMetadata",
         "skipToolsValidation", "agentConfigurationId", "agentConfigurationVersion",
         "modelInteractionDurationMs", "completedAt", "prunedContext", "workspaceId")
       VALUES
        ($1, $1, 'succeeded', null, null, null, false, $2, 0, 1200, $3, false, $4)
       RETURNING id`,
      [
        new Date(now.getTime() + 2_000).toISOString(),
        params.agentConfigurationId ?? AGENT_CONFIG_ID,
        branchCompletedAt,
        workspaceModelId,
      ]
    );
    const agentMessageId = Number(agentMessageInsert.rows[0].id);

    const branchMessageRowInsert = await client.query<{ id: string }>(
      `INSERT INTO messages
        ("createdAt", "updatedAt", "sId", version, visibility, rank, "workspaceId",
         "conversationId", "branchId", "agentMessageId", "parentId")
       VALUES
        ($1, $1, $2, 0, 'visible', 1, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        branchCompletedAt,
        branchAgentMessageSId,
        workspaceModelId,
        conversationId,
        branchId,
        agentMessageId,
        userMessageRowId,
      ]
    );
    let fullMessageActions: any[] = [];
    let fullMessageContents: Array<{ step: number; content: any }> = [
      {
        step: 0,
        content: {
          type: "text_content",
          value: params.branchAgentContent,
          metadata: {
            phase: "final_answer",
            modelId: "fixture-model",
            clientId: "playwright",
          },
        },
      },
    ];

    if (params.action) {
      const functionCallId = uniqueSid("call");
      const stepContentInsert = await client.query<{ id: string }>(
        `INSERT INTO agent_step_contents
          ("createdAt", "updatedAt", "agentMessageId", step, index, version, type, value, "workspaceId")
         VALUES
          ($1, $1, $2, 0, 0, 0, 'function_call', $3::jsonb, $4)
         RETURNING id`,
        [
          new Date(now.getTime() + 2_100).toISOString(),
          agentMessageId,
          JSON.stringify({
            type: "function_call",
            value: {
              id: functionCallId,
              name:
                params.action.functionCallName ??
                "dust_chrome_extension__list_browser_tabs",
              arguments: "{}",
            },
          }),
          workspaceModelId,
        ]
      );

      const actionInsert = await client.query<{
        id: string;
        createdAt: string;
        updatedAt: string;
      }>(
        `INSERT INTO agent_mcp_actions
          ("createdAt", "updatedAt", "mcpServerConfigurationId", version, status,
           "citationsAllocated", "augmentedInputs", "toolConfiguration", "stepContext",
           "executionDurationMs", "workspaceId", "agentMessageId", "stepContentId")
         VALUES
          ($1, $1, 'fixture-tool', 0, 'succeeded', 0, '{}'::jsonb, $2::jsonb, '{}'::jsonb,
           450, $3, $4, $5)
         RETURNING id, "createdAt", "updatedAt"`,
        [
          new Date(now.getTime() + 2_200).toISOString(),
          JSON.stringify({
            sId: "fixture-tool",
            name:
              params.action.functionCallName ??
              "dust_chrome_extension__list_browser_tabs",
            type: "mcp_configuration",
            permission: "never_ask",
            originalName: "list_browser_tabs",
            toolServerId: "ims_fixture",
            mcpServerName: "dust_chrome_extension",
            mcpServerViewId: "msv_fixture",
            internalMCPServerId: "ims_fixture",
            displayLabels: {
              done: params.action.doneLabel ?? "Listed browser tabs",
              running: params.action.runningLabel ?? "Listing browser tabs",
            },
            additionalConfiguration: {},
          }),
          workspaceModelId,
          agentMessageId,
          Number(stepContentInsert.rows[0].id),
        ]
      );

      fullMessageActions = [
        {
          id: Number(actionInsert.rows[0].id),
          sId: "act_fixture",
          step: 0,
          createdAt: Date.parse(actionInsert.rows[0].createdAt),
          updatedAt: Date.parse(actionInsert.rows[0].updatedAt),
          type: "mcp_configuration",
          status: "succeeded",
          functionCallId,
          generatedFiles: [],
          output: null,
          error: null,
          toolConfiguration: {
            sId: "fixture-tool",
            name:
              params.action.functionCallName ??
              "dust_chrome_extension__list_browser_tabs",
            type: "mcp_configuration",
            permission: "never_ask",
            originalName: "list_browser_tabs",
            toolServerId: "ims_fixture",
            mcpServerName: "dust_chrome_extension",
            mcpServerViewId: "msv_fixture",
            internalMCPServerId: "ims_fixture",
            displayLabels: {
              done: params.action.doneLabel ?? "Listed browser tabs",
              running: params.action.runningLabel ?? "Listing browser tabs",
            },
            additionalConfiguration: {},
          },
          citations: [],
          executionDurationMs: 450,
        },
      ];
      fullMessageContents = [
        {
          step: 0,
          content: {
            type: "function_call",
            value: {
              id: functionCallId,
              name:
                params.action.functionCallName ??
                "dust_chrome_extension__list_browser_tabs",
              arguments: "{}",
            },
          },
        },
        {
          step: 1,
          content: {
            type: "text_content",
            value: params.branchAgentContent,
            metadata: {
              phase: "final_answer",
              modelId: "fixture-model",
              clientId: "playwright",
            },
          },
        },
      ];

      await client.query(
        `INSERT INTO agent_step_contents
          ("createdAt", "updatedAt", "agentMessageId", step, index, version, type, value, "workspaceId")
         VALUES
          ($1, $1, $2, 1, 0, 0, 'text_content', $3::jsonb, $4)`,
        [
          branchCompletedAt,
          agentMessageId,
          JSON.stringify({
            type: "text_content",
            value: params.branchAgentContent,
            metadata: {
              phase: "final_answer",
              modelId: "fixture-model",
              clientId: "playwright",
            },
          }),
          workspaceModelId,
        ]
      );
    } else {
      await client.query(
        `INSERT INTO agent_step_contents
          ("createdAt", "updatedAt", "agentMessageId", step, index, version, type, value, "workspaceId")
         VALUES
          ($1, $1, $2, 0, 0, 0, 'text_content', $3::jsonb, $4)`,
        [
          branchCompletedAt,
          agentMessageId,
          JSON.stringify({
            type: "text_content",
            value: params.branchAgentContent,
            metadata: {
              phase: "final_answer",
              modelId: "fixture-model",
              clientId: "playwright",
            },
          }),
          workspaceModelId,
        ]
      );
    }

    return {
      branchAgentMessageSId,
      branchEvent: {
        eventId: uniqueSid("evt"),
        data: {
          type: "agent_message_new",
          created: Date.parse(branchCompletedAt),
          configurationId: params.agentConfigurationId ?? AGENT_CONFIG_ID,
          messageId: branchAgentMessageSId,
          message: {
            id: agentMessageId,
            agentMessageId,
            type: "agent_message",
            sId: branchAgentMessageSId,
            version: 0,
            rank: 1,
            branchId: branchDisplayId,
            created: Date.parse(branchCompletedAt),
            completedTs: Date.parse(branchCompletedAt),
            parentMessageId: userMessageSId,
            parentAgentMessageId: null,
            status: "succeeded",
            content: params.branchAgentContent,
            chainOfThought: null,
            error: null,
            visibility: "visible",
            richMentions: [],
            completionDurationMs: 1200,
            reactions: [],
            prunedContext: false,
            configuration: {
              sId: params.agentConfigurationId ?? AGENT_CONFIG_ID,
              name: agentConfigurationRow.rows[0].name,
              pictureUrl:
                agentConfigurationRow.rows[0].pictureUrl ??
                "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg",
              status: agentConfigurationRow.rows[0].status,
              canRead: true,
            },
            skipToolsValidation: false,
            actions: fullMessageActions,
            contents: fullMessageContents,
            modelInteractionDurationMs: 1200,
          },
        },
      },
      conversationId: conversationSId,
    };
  } finally {
    await client.end();
  }
}

async function waitForLicenseWarningToStayGone(
  page: Page
) {
  const warning = page.getByText(
    /VirtuosoMessageListLicense is missing a license key|Purchase one from/i
  );
  await expect(warning).toHaveCount(0);
}

async function getScrollTop(
  page: Page
): Promise<number> {
  return page
    .getByTestId("conversation-scroll-container")
    .evaluate((element: HTMLElement) => element.scrollTop);
}

async function getScrollMetrics(
  page: Page
): Promise<{ clientHeight: number; scrollHeight: number; scrollTop: number }> {
  return page
    .getByTestId("conversation-scroll-container")
    .evaluate((element: HTMLElement) => {
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
      };
    });
}

async function scrollConversationToTop(
  page: Page
) {
  await page
    .getByTestId("conversation-scroll-container")
    .evaluate((element: HTMLElement) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
}

async function submitPlainMessage(
  page: Page,
  message: string
) {
  const editor = page.locator(".tiptap.ProseMirror").first();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type(message);
  await page.keyboard.press("Enter");
}

async function openUserMessageActions(
  page: Page,
  messageText: string
) {
  const message = page.getByText(messageText, { exact: false }).first();
  await expect(message).toBeVisible();
  await message.hover();
  const actionButton = page
    .getByRole("button", { name: "Message actions" })
    .last();
  await expect(actionButton).toBeVisible();
  await actionButton.click();
}

test.describe
  .serial("Chat renderer regression coverage", () => {
    test.beforeAll(async () => {
      const res = await fetch(`${API_BASE_URL}/api/healthz/startup`);
      expect(res.status).toBe(200);
    });

    test.beforeEach(async ({ page }) => {
      await ensureAuthenticated(page);
    });

    test("renders an existing plain conversation without the old license warning", async ({
      page,
    }) => {
      const firstMessage = uniqueId("plain-render-first");
      const secondMessage = uniqueId("plain-render-second");

      const { conversationId } = await createConversation(page, {
        message: firstMessage,
        title: uniqueId("plain-render-title"),
      });
      await addMessage(page, { conversationId, content: secondMessage });

      await openConversation(page, conversationId);
      await waitForLicenseWarningToStayGone(page);
      await expect(
        page.getByText(firstMessage, { exact: false })
      ).toBeVisible();
      await expect(
        page.getByText(secondMessage, { exact: false })
      ).toBeVisible();
    });

    test("opens a long conversation at the bottom with the latest message visible", async ({
      page,
    }) => {
      const { conversationId, messages } = await createLongConversation(page);

      await openConversation(page, conversationId);
      await waitForLicenseWarningToStayGone(page);
      await expect(
        page.getByText(messages.at(-1) ?? "", { exact: false })
      ).toBeVisible();
      await expect(page.getByText(messages[0], { exact: false })).toHaveCount(
        0
      );
    });

    test("opens a deep link hash at the targeted message instead of the latest one", async ({
      page,
    }) => {
      const { conversationId, messages, messageSids } =
        await createLongConversation(page);
      const targetMessageSid = messageSids[10];

      expect(targetMessageSid).toBeTruthy();

      await openConversation(page, conversationId, targetMessageSid);
      await waitForLicenseWarningToStayGone(page);
      await expect(
        page.getByText(messages[10], { exact: false })
      ).toBeVisible();

      const metrics = await getScrollMetrics(page);
      const bottomOffset =
        metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop;
      expect(bottomOffset).toBeGreaterThan(100);
    });

    test("scrolling upward loads older messages and preserves viewport after prepend", async ({
      page,
    }) => {
      const { conversationId, messages } =
        await createPaginatedConversation(page);

      await openConversation(page, conversationId);
      await waitForLicenseWarningToStayGone(page);

      const oldestVisibleFromInitialPage = messages[5];
      await expect(
        page.getByText(oldestVisibleFromInitialPage, { exact: false })
      ).toBeVisible();

      await scrollConversationToTop(page);
      await expect(page.getByText(messages[0], { exact: false })).toBeVisible({
        timeout: 30_000,
      });

      const scrollTopAfterPrepend = await getScrollTop(page);
      expect(scrollTopAfterPrepend).toBeGreaterThan(0);
      await expect(
        page.getByText(oldestVisibleFromInitialPage, { exact: false })
      ).toBeVisible();
    });

    test("keeps the composer visible while browsing a long conversation", async ({
      page,
    }) => {
      const { conversationId } = await createLongConversation(page);

      await openConversation(page, conversationId);
      await scrollConversationToTop(page);

      await expect(page.locator(".tiptap.ProseMirror").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Files" })).toBeVisible();
    });

    test("sending a plain message from the UI creates and renders a new conversation", async ({
      page,
    }) => {
      const message = uniqueId("ui-send");

      await page.goto(appNewConversationUrl());
      await expect(page.locator(".tiptap.ProseMirror").first()).toBeVisible();

      await submitPlainMessage(page, message);

      await page.waitForURL(/\/w\/.+\/conversation\/[A-Za-z0-9]+/, {
        timeout: 30_000,
      });
      await waitForLicenseWarningToStayGone(page);
      await expect(page.getByText(message, { exact: false })).toBeVisible({
        timeout: 30_000,
      });
    });

    test("shows the empty new-conversation shell before any messages exist", async ({
      page,
    }) => {
      await page.goto(appNewConversationUrl());
      await waitForLicenseWarningToStayGone(page);

      await expect(page.locator(".tiptap.ProseMirror").first()).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Chat with..." })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Create", exact: true })
      ).toBeVisible();
    });

    test("the bottom arrow jumps a long conversation back to the latest messages", async ({
      page,
    }) => {
      const { conversationId, messages } = await createLongConversation(
        page,
        80
      );

      await openConversation(page, conversationId);
      await scrollConversationToTop(page);

      const bottomButton = page.getByRole("button", {
        name: "Scroll to bottom",
      });

      await expect(bottomButton).toBeVisible();
      await bottomButton.evaluate((element: HTMLButtonElement) =>
        element.click()
      );

      await expect(
        page.getByText(messages.at(-1) ?? "", { exact: false })
      ).toBeVisible();
      await expect(bottomButton).toHaveCount(0);
    });

    test("stays pinned to the bottom when a new message is sent from the open conversation", async ({
      page,
    }) => {
      const { conversationId, messages } = await createLongConversation(
        page,
        40
      );
      const newMessage = uniqueId("sticky-bottom");

      await openConversation(page, conversationId);
      await expect(
        page.getByText(messages.at(-1) ?? "", { exact: false })
      ).toBeVisible();

      await submitPlainMessage(page, newMessage);

      await expect(page.getByText(newMessage, { exact: false })).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        page.getByRole("button", { name: "Scroll to bottom" })
      ).toHaveCount(0);
    });

    test("groups consecutive user messages from the same sender under one timestamp row", async ({
      page,
    }) => {
      const createdAt = "2026-01-15T18:17:00.000Z";
      const expectedTimestamp = new Date(createdAt).toLocaleTimeString(
        "en-US",
        {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
        }
      );
      const firstMessage = uniqueId("grouped-one");
      const secondMessage = uniqueId("grouped-two");

      const seeded = await seedConversationInDb({
        title: uniqueId("grouped-title"),
        messageContents: [
          { content: firstMessage, createdAt },
          {
            content: secondMessage,
            createdAt: new Date(
              new Date(createdAt).getTime() + 20_000
            ).toISOString(),
          },
        ],
      });

      await openConversation(page, seeded.conversationId);
      const container = page.getByTestId("conversation-scroll-container");

      await expect(
        container.getByText(firstMessage, { exact: false })
      ).toBeVisible();
      await expect(
        container.getByText(secondMessage, { exact: false })
      ).toBeVisible();
      await expect(
        container.getByText(expectedTimestamp, { exact: true })
      ).toHaveCount(1);
    });

    test("renders date separators for messages from different days", async ({
      page,
    }) => {
      const conversation = await seedConversationInDb({
        title: uniqueId("date-separators"),
        messageContents: [
          {
            content: uniqueId("date-one"),
            createdAt: "2024-01-10T08:00:00.000Z",
          },
          {
            content: uniqueId("date-two"),
            createdAt: "2024-01-10T08:05:00.000Z",
          },
          {
            content: uniqueId("date-three"),
            createdAt: "2024-01-12T08:00:00.000Z",
          },
        ],
      });

      await openConversation(page, conversation.conversationId);

      await expect(page.getByText("10/01/2024", { exact: true })).toBeVisible();
      await expect(page.getByText("12/01/2024", { exact: true })).toBeVisible();
    });

    test("editing a user message updates the rendered row in place", async ({
      page,
    }) => {
      const originalMessage = uniqueId("edit-original");
      const updatedMessage = uniqueId("edit-updated");

      await page.goto(appNewConversationUrl());
      await submitPlainMessage(page, originalMessage);
      await page.waitForURL(/\/w\/.+\/conversation\/[A-Za-z0-9]+/, {
        timeout: 30_000,
      });

      await openUserMessageActions(page, originalMessage);
      await page.getByRole("menuitem", { name: "Edit message" }).click();

      const editContainer = page
        .getByRole("button", { name: "Save" })
        .locator(
          "xpath=ancestor::div[contains(@class,'bg-muted-background')][1]"
        );
      const editEditor = editContainer.locator(
        ".tiptap.ProseMirror[contenteditable='true']"
      );
      await expect(editEditor).toBeVisible();
      await editEditor.click();
      await page.keyboard.press(
        process.platform === "darwin" ? "Meta+a" : "Control+a"
      );
      await page.keyboard.type(updatedMessage);
      await page.getByRole("button", { name: "Save" }).click();

      await expect(
        page.getByText(updatedMessage, { exact: false })
      ).toBeVisible();
      await expect(page.getByText("(edited)", { exact: false })).toBeVisible();
    });

    test("deleting a user message updates the row to the deleted state in place", async ({
      page,
    }) => {
      const message = uniqueId("delete-message");

      await page.goto(appNewConversationUrl());
      await submitPlainMessage(page, message);
      await page.waitForURL(/\/w\/.+\/conversation\/[A-Za-z0-9]+/, {
        timeout: 30_000,
      });

      await openUserMessageActions(page, message);
      await page.getByRole("menuitem", { name: "Delete message" }).click();
      await page.getByRole("button", { name: "Delete" }).click();

      const deletedRow = page
        .getByText("Message was deleted", { exact: false })
        .locator(
          "xpath=ancestor::div[contains(@class,'mx-auto max-w-3xl')][1]"
        );

      await expect(
        deletedRow.getByText("Message was deleted", { exact: false })
      ).toBeVisible();
      await expect(deletedRow.getByText(message, { exact: false })).toHaveCount(
        0
      );
    });

    test("renders a completed agent message and opens the breakdown side panel", async ({
      page,
    }) => {
      const agentReply = uniqueId("completed-agent-reply");
      const { conversationId } = await seedConversationWithAgentFixture({
        agentStatus: "succeeded",
        title: uniqueId("completed-agent-title"),
        userMessage: uniqueId("completed-agent-user"),
        agentContent: agentReply,
        action: {},
      });

      await openConversation(page, conversationId);
      await expect(page.getByText(agentReply, { exact: false })).toBeVisible();

      await page.getByText(/Completed in/i).click();
      await expect(
        page.getByText("Breakdown of the tools used", { exact: false })
      ).toBeVisible();
      await expect(
        page.getByText("Listed browser tabs", { exact: false })
      ).toBeVisible();
    });

    test("streaming agent messages transition to final content in the open UI", async ({
      page,
    }) => {
      const token = uniqueId("streaming-agent-token");
      const { conversationId } = await createConversation(page, {
        blocking: false,
        mentions: [{ configurationId: AGENT_CONFIG_ID }],
        message: `Run the bash command \`sleep 2; printf ${token}\` and reply with only the stdout.`,
        title: uniqueId("streaming-agent-title"),
      });

      await openConversation(page, conversationId);
      await expect(page.getByText(/Thinking/i).first()).toBeVisible();

      const agentMessage = await waitForAgentMessage(page, conversationId);
      expect(
        agentMessage.status,
        JSON.stringify(agentMessage.error ?? null)
      ).toBe("succeeded");
      expect(agentMessage.content).toContain(token);

      await expect(page.getByText(token, { exact: true })).toBeVisible();
      await expect(
        page.getByText(/Completed in|Message breakdown/i).first()
      ).toBeVisible();
    });

    test("renders a failed agent message with its retry affordance", async ({
      page,
    }) => {
      const failureMessage = uniqueId("failed-agent-message");
      const { conversationId } = await seedConversationWithAgentFixture({
        agentStatus: "failed",
        title: uniqueId("failed-agent-title"),
        userMessage: uniqueId("failed-agent-user"),
        agentError: {
          code: "fixture_error",
          message: failureMessage,
        },
      });

      await openConversation(page, conversationId);
      await expect(
        page.getByText("Something went wrong", { exact: false })
      ).toBeVisible();
      await expect(
        page.getByText(failureMessage, { exact: false })
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    });

    test("retrying a failed agent message replaces it with a successful retry", async ({
      page,
    }) => {
      const token = uniqueId("retry-agent-token");
      const failureMessage = uniqueId("retry-agent-failure");
      const { conversationId } = await seedConversationWithAgentFixture({
        agentConfigurationId: AGENT_CONFIG_ID,
        agentStatus: "failed",
        title: uniqueId("retry-agent-title"),
        userMessage: `Run the bash command \`printf ${token}\` and reply with only the stdout.`,
        agentError: {
          code: "fixture_error",
          message: failureMessage,
        },
      });

      await openConversation(page, conversationId);
      await expect(
        page.getByText(failureMessage, { exact: false })
      ).toBeVisible();
      const initialConversation = await sessionGet(
        page,
        `/assistant/conversations/${conversationId}/messages?limit=20&newResponseFormat=1`
      );
      expect(initialConversation.ok).toBe(true);
      const previousVersion =
        Number(findAgentMessages(initialConversation.body)[0]?.version) || 0;
      await routeRetriedAgentMessageSuccessOnce(page, {
        conversationId,
        token,
      });

      await page
        .getByTestId("conversation-scroll-container")
        .getByRole("button", { name: "Retry", exact: true })
        .click();
      const agentMessage = await waitForAgentMessageAfterVersion(
        page,
        conversationId,
        previousVersion
      );

      expect(
        agentMessage.status,
        JSON.stringify(agentMessage.error ?? null)
      ).toBe("succeeded");

      await expect(page.getByText(token, { exact: false })).toBeVisible();
      await expect(
        page.getByText(failureMessage, { exact: false })
      ).toHaveCount(0);
    });

    test("renders the manual validation banner when a blocked action requires approval", async ({
      page,
    }) => {
      const adminUserSId = await getAdminUserSId();
      const { conversationId, agentMessageSId } =
        await seedConversationWithAgentFixture({
          agentConfigurationId: "dust",
          agentContent: "Pending approval fixture",
          agentStatus: "succeeded",
          title: uniqueId("blocked-validation-title"),
          userMessage: uniqueId("blocked-validation-user"),
        });
      await page.route(
        `**/assistant/conversations/${conversationId}/actions/blocked`,
        async (route: Route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              blockedActions: [
                {
                  messageId: agentMessageSId,
                  userId: adminUserSId,
                  conversationId,
                  actionId: uniqueSid("act"),
                  configurationId: "fixture-tool",
                  created: Date.now(),
                  inputs: {
                    humanReadableDescription: "click the secret button",
                  },
                  stake: "high",
                  metadata: {
                    toolName: "interact_with_page",
                    mcpServerName: "dust-chrome-extension",
                    agentName: "openrouter-test",
                    icon: null,
                  },
                  status: "blocked_validation_required",
                  authorizationInfo: null,
                },
              ],
            }),
          });
        }
      );

      await openConversation(page, conversationId);
      await expect(page.getByText(/1 manual action required/i)).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Review", exact: true })
      ).toBeVisible();
      await expect(
        page.getByText(/Allow .*click the secret button\?/i)
      ).toBeVisible();
    });

    test("the Review button scrolls to the blocked validation message", async ({
      page,
    }) => {
      const adminUserSId = await getAdminUserSId();
      const { conversationId, agentMessageSId } =
        await seedConversationWithAgentFixture({
          agentConfigurationId: "dust",
          agentContent: "Pending approval fixture",
          agentStatus: "succeeded",
          fillerAfterCount: 30,
          title: uniqueId("blocked-validation-scroll-title"),
          userMessage: uniqueId("blocked-validation-scroll-user"),
        });
      await page.route(
        `**/assistant/conversations/${conversationId}/actions/blocked`,
        async (route: Route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              blockedActions: [
                {
                  messageId: agentMessageSId,
                  userId: adminUserSId,
                  conversationId,
                  actionId: uniqueSid("act"),
                  configurationId: "fixture-tool",
                  created: Date.now(),
                  inputs: {
                    humanReadableDescription: "click the secret button",
                  },
                  stake: "high",
                  metadata: {
                    toolName: "interact_with_page",
                    mcpServerName: "dust-chrome-extension",
                    agentName: "openrouter-test",
                    icon: null,
                  },
                  status: "blocked_validation_required",
                  authorizationInfo: null,
                },
              ],
            }),
          });
        }
      );

      await openConversation(page, conversationId);
      await page
        .getByTestId("conversation-scroll-container")
        .evaluate((element: HTMLElement) => {
          element.scrollTop = element.scrollHeight;
          element.dispatchEvent(new Event("scroll", { bubbles: true }));
        });
      const scrollBefore = await getScrollTop(page);
      expect(scrollBefore).toBeGreaterThan(100);

      await page.getByRole("button", { name: "Review", exact: true }).click();

      await expect(
        page.getByText(/Allow .*click the secret button\?/i)
      ).toBeVisible();
      await expect
        .poll(async () => getScrollTop(page), {
          message:
            "Expected Review to scroll back toward the blocked validation message",
        })
        .toBeLessThan(scrollBefore - 100);
    });

    test("branch approval sheet renders branch messages", async ({ page }) => {
      const { conversationId, branchEvent } =
        await seedConversationWithBranchApproval({
          agentConfigurationId: AGENT_CONFIG_ID,
          branchAgentContent: "Branch approval fixture output",
          title: uniqueId("branch-approval-title"),
          userMessage: uniqueId("branch-approval-user"),
        });

      await routeConversationEventsOnce(page, {
        conversationId,
        eventPayload: branchEvent,
      });

      await openConversation(page, conversationId);

      await expect(
        page.getByText(
          /Review the Agent message before publishing it in the conversation\./i
        )
      ).toBeVisible();
      await expect(
        page.getByText("Branch approval fixture output")
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Reject", exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Publish in conversation",
          exact: true,
        })
      ).toBeVisible();
    });

    test("branch approval details tab opens for a selected agent message", async ({
      page,
    }) => {
      const { conversationId, branchEvent } =
        await seedConversationWithBranchApproval({
          action: {
            doneLabel: "Listed browser tabs",
            functionCallName: "dust_chrome_extension__list_browser_tabs",
            runningLabel: "Listing browser tabs",
          },
          agentConfigurationId: AGENT_CONFIG_ID,
          branchAgentContent: "Branch approval details fixture output",
          title: uniqueId("branch-approval-details-title"),
          userMessage: uniqueId("branch-approval-details-user"),
        });

      await routeConversationEventsOnce(page, {
        conversationId,
        eventPayload: branchEvent,
      });

      await openConversation(page, conversationId);
      await expect(
        page.getByText("Branch approval details fixture output")
      ).toBeVisible();

      await page.getByText(/Completed in/i).click();

      await expect(
        page.getByText("Breakdown of the tools used", { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText("Listed browser tabs", { exact: true })
      ).toBeVisible();
    });

    test("opens the files side panel from a conversation", async ({ page }) => {
      const { conversationId } = await createConversation(page, {
        message: uniqueId("files-panel"),
        title: uniqueId("files-title"),
      });

      await openConversation(page, conversationId);
      await page.getByRole("button", { name: "Files", exact: true }).click();

      await expect
        .poll(async () => page.evaluate(() => window.location.hash), {
          message: "Expected files panel hash params to be set.",
        })
        .toContain("spt=files");
      await expect(
        page.getByText("Working Files", { exact: false })
      ).toBeVisible();
    });

    test("renders inline attachment citations beneath a user message", async ({
      page,
    }) => {
      const attachmentTitle = uniqueId("inline-attachment");
      const { conversationId } = await seedConversationWithInlineAttachment({
        title: uniqueId("inline-attachment-title"),
        attachmentTitle,
        userMessage: uniqueId("inline-attachment-user"),
      });

      await openConversation(page, conversationId);
      await expect(
        page.getByText(attachmentTitle, { exact: false })
      ).toBeVisible();
    });
  });
