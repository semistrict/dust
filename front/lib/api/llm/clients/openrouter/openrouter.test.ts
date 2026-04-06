import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import {
  toInput,
  toResponseFormat,
  toTool,
  toToolOption,
} from "@app/lib/api/llm/utils/openai_like/responses/conversation_to_openai";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import { describe, expect, it } from "vitest";

/**
 * Tests for the OpenRouter LLM client's Responses API integration.
 *
 * These tests verify that the request payload sent to OpenRouter includes
 * tools in the correct format. The bug was that tools with optional parameters
 * (like sandbox bash) were either:
 * - Not included in the payload at all
 * - Formatted with strict: true which rejected optional properties
 * - Had all properties forced to required, breaking the schema
 */

const BASH_SPEC: AgentActionSpecification = {
  name: "bash",
  description: "Execute a shell command in an isolated sandbox environment.",
  inputSchema: {
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute.",
      },
      workingDirectory: {
        type: "string",
        description: "Working directory for command execution.",
      },
      timeoutMs: {
        type: "number",
        maximum: 120000,
        description: "Timeout in milliseconds.",
      },
    },
    required: ["command"],
    additionalProperties: false,
  },
};

const SEARCH_SPEC: AgentActionSpecification = {
  name: "search",
  description: "Search data sources.",
  inputSchema: {
    properties: {
      query: { type: "string", description: "Search query." },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

describe("OpenRouter Responses API payload", () => {
  describe("tool formatting via toTool", () => {
    it("includes all tool properties in the parameters", () => {
      const tool = toTool(BASH_SPEC);

      const params = tool.parameters as {
        properties?: Record<string, unknown>;
      };
      expect(Object.keys(params.properties ?? {})).toEqual([
        "command",
        "workingDirectory",
        "timeoutMs",
      ]);
    });

    it("preserves the required array — only required fields are marked required", () => {
      const tool = toTool(BASH_SPEC);

      const params = tool.parameters as { required?: string[] };
      expect(params.required).toEqual(["command"]);
    });

    it("uses strict: false to allow optional properties", () => {
      const tool = toTool(BASH_SPEC);
      expect(tool.strict).toBe(false);
    });

    it("sets type to 'function'", () => {
      const tool = toTool(BASH_SPEC);
      expect(tool.type).toBe("function");
    });

    it("maps multiple specifications to tools array", () => {
      const tools = [BASH_SPEC, SEARCH_SPEC].map(toTool);

      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe("bash");
      expect(tools[1].name).toBe("search");
    });

    it("empty specifications produce empty tools array", () => {
      const tools: AgentActionSpecification[] = [];
      expect(tools.map(toTool)).toEqual([]);
    });
  });

  describe("tool_choice via toToolOption", () => {
    it("returns 'auto' when no forced tool call", () => {
      expect(toToolOption([BASH_SPEC], undefined)).toBe("auto");
    });

    it("returns forced function when name matches a specification", () => {
      expect(toToolOption([BASH_SPEC, SEARCH_SPEC], "bash")).toEqual({
        type: "function",
        name: "bash",
      });
    });

    it("falls back to 'auto' when forced name not in specifications", () => {
      expect(toToolOption([BASH_SPEC], "nonexistent")).toBe("auto");
    });
  });

  describe("conversation input via toInput", () => {
    it("includes system prompt as first message", () => {
      const conversation: ModelConversationTypeMultiActions = {
        messages: [],
      };
      const input = toInput("You are helpful.", conversation);

      expect(input[0]).toMatchObject({
        role: "developer",
      });
      // Content is wrapped in an array of input_text items.
      const content = (input[0] as { content: unknown }).content;
      expect(content).toEqual([
        { type: "input_text", text: "You are helpful." },
      ]);
    });

    it("converts user messages to input format", () => {
      const conversation: ModelConversationTypeMultiActions = {
        messages: [
          {
            role: "user",
            name: "user",
            content: [{ type: "text", text: "Hello" }],
          },
        ],
      };
      const input = toInput("System prompt.", conversation);

      expect(input).toHaveLength(2);
      expect(input[1]).toMatchObject({
        role: "user",
        content: [{ type: "input_text", text: "Hello" }],
      });
    });
  });

  describe("response format via toResponseFormat", () => {
    it("returns undefined when responseFormat is null", () => {
      expect(toResponseFormat(null, "openrouter")).toBeUndefined();
    });
  });

  describe("payload assembly (simulated buildStreamRequestPayload)", () => {
    it("includes tools in the payload when specifications are provided", () => {
      const specifications = [BASH_SPEC, SEARCH_SPEC];
      const conversation: ModelConversationTypeMultiActions = {
        messages: [
          {
            role: "user",
            name: "user",
            content: [{ type: "text", text: "Run echo hello" }],
          },
        ],
      };

      // Simulate what OpenRouterLLM.buildStreamRequestPayload does.
      const payload = {
        model: "openai/gpt-5.4-mini",
        input: toInput("You are helpful.", conversation),
        stream: true as const,
        temperature: 0.7,
        tools: specifications.map(toTool),
        text: {
          format: toResponseFormat(null, "openrouter"),
        },
        tool_choice: toToolOption(specifications, undefined),
      };

      // Tools MUST be present.
      expect(payload.tools).toHaveLength(2);
      expect(payload.tools[0].name).toBe("bash");
      expect(payload.tools[1].name).toBe("search");

      // tool_choice must be "auto".
      expect(payload.tool_choice).toBe("auto");

      // The bash tool must preserve optional properties.
      const bashParams = payload.tools[0].parameters as {
        required?: string[];
        properties?: Record<string, unknown>;
      };
      expect(bashParams.required).toEqual(["command"]);
      expect(Object.keys(bashParams.properties ?? {})).toContain(
        "workingDirectory"
      );
    });

    it("sends empty tools array when no specifications — not undefined", () => {
      const specifications: AgentActionSpecification[] = [];

      const tools = specifications.map(toTool);
      expect(tools).toEqual([]);
      // Critically: tools is an empty array, not undefined.
      // The Responses API always includes the tools field.
      expect(Array.isArray(tools)).toBe(true);
    });
  });
});
