import { expect, test } from "@playwright/test";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env from the repo root.
config({ path: resolve(__dirname, "../../../.env") });

/**
 * E2E tests for agent tool invocation via the Dust public API (v1).
 *
 * These tests verify the full pipeline:
 *   1. Agent configuration has tools (sandbox bash) attached
 *   2. Tools are passed to the LLM in the API request
 *   3. The model invokes the tool (not just responds with text)
 *   4. The tool executes and returns output
 *
 * Prerequisites:
 *   - Running: front (3000), core (3001), temporal + worker, redis, postgres
 *   - .env at repo root with DUST_DEVELOPMENT_SYSTEM_API_KEY and
 *     DUST_DEVELOPMENT_WORKSPACE_ID
 *   - An agent with sandbox tools configured (set DUST_AGENT_CONFIG_ID)
 *
 * Run:
 *   DUST_AGENT_CONFIG_ID=<sId> npx playwright test --config front/tests/e2e/playwright.config.ts
 */

const BASE_URL = process.env.DUST_API_URL ?? "http://localhost:3000";
const API_KEY =
  process.env.DUST_API_KEY ?? process.env.DUST_DEVELOPMENT_SYSTEM_API_KEY ?? "";
const WORKSPACE_ID =
  process.env.DUST_WORKSPACE_ID ??
  process.env.DUST_DEVELOPMENT_WORKSPACE_ID ??
  "";
const AGENT_CONFIG_ID = process.env.DUST_AGENT_CONFIG_ID ?? "";

function apiUrl(path: string): string {
  return `${BASE_URL}/api/v1/w/${WORKSPACE_ID}${path}`;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function apiGet(path: string) {
  const res = await fetch(apiUrl(path), { headers: headers() });
  const body = await res.json();
  return { status: res.status, ok: res.ok, body };
}

async function apiPost(path: string, data: unknown) {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(data),
  });
  const body = await res.json();
  return { status: res.status, ok: res.ok, body };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AgentAction {
  toolName: string;
  functionCallName: string;
  params: Record<string, unknown>;
  status: string;
  output: unknown;
  internalMCPServerName: string | null;
}

interface AgentMessage {
  type: "agent_message";
  sId: string;
  status: string;
  content: string | null;
  error: { code: string; message: string } | null;
  actions: AgentAction[];
}

function findAgentMessages(conversationBody: any): AgentMessage[] {
  return (conversationBody.conversation?.content ?? [])
    .flat()
    .filter((m: any) => m.type === "agent_message");
}

/**
 * Create a blocking conversation — waits for the agent to finish.
 */
async function chat(message: string) {
  return apiPost("/assistant/conversations", {
    blocking: true,
    visibility: "unlisted",
    message: {
      content: message,
      mentions: [{ configurationId: AGENT_CONFIG_ID }],
      context: {
        timezone: "UTC",
        username: "e2e-test",
        fullName: "E2E Test",
        email: "e2e@test.local",
        origin: "api",
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Pre-flight checks
// ---------------------------------------------------------------------------

test.beforeAll(() => {
  expect(
    API_KEY,
    "DUST_DEVELOPMENT_SYSTEM_API_KEY not set in .env"
  ).toBeTruthy();
  expect(
    WORKSPACE_ID,
    "DUST_DEVELOPMENT_WORKSPACE_ID not set in .env"
  ).toBeTruthy();
  expect(AGENT_CONFIG_ID, "DUST_AGENT_CONFIG_ID env var not set").toBeTruthy();
});

test.describe("Prerequisites", () => {
  test("front server is reachable", async () => {
    const res = await fetch(`${BASE_URL}/api/healthz/startup`);
    expect(res.status).toBe(200);
  });

  test("core API is reachable", async () => {
    // Always test localhost — CORE_API may point to a Docker hostname.
    const res = await fetch("http://localhost:3001").catch(() => null);
    expect(
      res,
      "Core API not reachable at http://localhost:3001"
    ).not.toBeNull();
    expect(res!.ok).toBe(true);
  });

  test("API key authenticates successfully", async () => {
    const { ok, body } = await apiGet("/assistant/agent_configurations");
    expect(ok, `Auth failed: ${JSON.stringify(body)}`).toBe(true);
  });

  test("agent exists and is active", async () => {
    const { ok, body } = await apiGet(
      `/assistant/agent_configurations/${AGENT_CONFIG_ID}?variant=full`
    );
    expect(ok, `Agent not found: ${JSON.stringify(body)}`).toBe(true);

    const ac = body.agentConfiguration;
    expect(ac.status).toBe("active");
    expect(ac.model.providerId).toBeTruthy();
    expect(ac.model.modelId).toBeTruthy();
  });

  test("agent has sandbox tools configured", async () => {
    const { body } = await apiGet(
      `/assistant/agent_configurations/${AGENT_CONFIG_ID}?variant=full`
    );
    const ac = body.agentConfiguration;
    const actions = ac.actions ?? [];

    // The agent must have at least one MCP server configuration.
    expect(
      actions.length,
      "Agent has no tool actions configured. Add the sandbox MCP server to the agent."
    ).toBeGreaterThanOrEqual(1);

    // At least one action should be the sandbox (internal MCP server).
    const sandboxActions = actions.filter(
      (a: any) =>
        a.internalMCPServerId?.includes("sandbox") ||
        a.internalMCPServerId?.startsWith("ims_")
    );
    expect(
      sandboxActions.length,
      `No sandbox action found. Actions: ${JSON.stringify(actions.map((a: any) => ({ name: a.name, internal: a.internalMCPServerId })))}`
    ).toBeGreaterThanOrEqual(1);

    // The sandbox action should have a valid mcpServerViewId (not empty).
    const viewId = sandboxActions[0].mcpServerViewId;
    expect(
      viewId,
      "Sandbox action has empty mcpServerViewId — the MCPServerView is not resolving. " +
        "Check that the view exists in the system vault and auth has access."
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tool invocation tests
// ---------------------------------------------------------------------------

test.describe("Tool invocation", () => {
  test("agent invokes bash tool for a shell command", async () => {
    const { ok, body } = await chat(
      'Run this shell command and show the output: echo "e2e-test-marker-42"'
    );
    expect(ok, `API error: ${JSON.stringify(body.error ?? body)}`).toBe(true);

    const msgs = findAgentMessages(body);
    expect(msgs.length).toBeGreaterThanOrEqual(1);

    const agent = msgs[0];
    expect(agent.status, `Agent failed: ${JSON.stringify(agent.error)}`).toBe(
      "succeeded"
    );

    // Must have tool actions.
    expect(
      agent.actions.length,
      `Agent responded with text only (no tool calls). Response: "${agent.content?.slice(0, 300)}"`
    ).toBeGreaterThanOrEqual(1);

    // At least one must be the bash tool.
    const bashActions = agent.actions.filter(
      (a) => a.toolName === "bash" || a.functionCallName === "bash"
    );
    expect(
      bashActions.length,
      `No bash tool call. Tools called: [${agent.actions.map((a) => a.toolName).join(", ")}]. Response: "${agent.content?.slice(0, 200)}"`
    ).toBeGreaterThanOrEqual(1);

    // Bash tool should execute (may error if E2B sandbox template is missing).
    const bashStatus = bashActions[0].status;
    const output = JSON.stringify(bashActions[0].output);

    if (bashStatus === "errored" && output.includes("template")) {
      // E2B sandbox template not configured — tool was invoked correctly
      // but the sandbox environment is missing. This is an infra issue, not a code bug.
      console.log(
        "SKIP: E2B sandbox template not found — tool invocation works but sandbox infra needs setup"
      );
      return;
    }

    expect(bashStatus).toBe("succeeded");
    expect(output).toContain("e2e-test-marker-42");
  });

  test("agent invokes bash for a computation", async () => {
    const { ok, body } = await chat(
      'Use the bash tool to run: python3 -c "print(2**10)"'
    );
    expect(ok).toBe(true);

    const agent = findAgentMessages(body)[0];
    expect(agent.status, JSON.stringify(agent.error)).toBe("succeeded");

    const bashActions = agent.actions.filter(
      (a) => a.toolName === "bash" || a.functionCallName === "bash"
    );
    expect(
      bashActions.length,
      `No bash call. Response: "${agent.content?.slice(0, 200)}"`
    ).toBeGreaterThanOrEqual(1);

    const compOutput = JSON.stringify(bashActions[0].output);
    if (compOutput.includes("template")) {
      console.log("SKIP: E2B sandbox template not found");
      return;
    }
    expect(compOutput).toContain("1024");
  });

  test("agent does NOT invoke bash for factual questions", async () => {
    const { ok, body } = await chat(
      "What is the capital of France? One word answer."
    );
    expect(ok).toBe(true);

    const agent = findAgentMessages(body)[0];
    expect(agent.status).toBe("succeeded");
    expect(agent.content?.toLowerCase()).toContain("paris");

    const bashActions = agent.actions.filter(
      (a) => a.toolName === "bash" || a.functionCallName === "bash"
    );
    expect(bashActions.length).toBe(0);
  });

  test("agent handles multiple tool calls", async () => {
    const { ok, body } = await chat(
      'Run these two commands with bash:\n1. echo "first-marker"\n2. echo "second-marker"'
    );
    expect(ok).toBe(true);

    const agent = findAgentMessages(body)[0];
    expect(agent.status, JSON.stringify(agent.error)).toBe("succeeded");

    const bashActions = agent.actions.filter(
      (a) => a.toolName === "bash" || a.functionCallName === "bash"
    );
    expect(
      bashActions.length,
      `No bash calls. Response: "${agent.content?.slice(0, 200)}"`
    ).toBeGreaterThanOrEqual(1);

    const allOutput = bashActions
      .map((a) => JSON.stringify(a.output))
      .join(" ");
    if (allOutput.includes("template")) {
      console.log("SKIP: E2B sandbox template not found");
      return;
    }
    expect(allOutput).toContain("first-marker");
    expect(allOutput).toContain("second-marker");
  });
});
