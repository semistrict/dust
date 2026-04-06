import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import {
  toToolChoiceParam,
  toTools,
} from "@app/lib/api/llm/utils/openai_like/chat/conversation_to_openai";
import { toTool } from "@app/lib/api/llm/utils/openai_like/responses/conversation_to_openai";
import { describe, expect, it } from "vitest";

function asFunctionTool(tool: unknown): {
  function: {
    name: string;
    strict?: boolean;
    parameters?: unknown;
  };
} {
  return tool as {
    function: {
      name: string;
      strict?: boolean;
      parameters?: unknown;
    };
  };
}

// Realistic sandbox bash tool specification — the tool that exposed the bug.
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

// Tool with all required properties (no optionals).
const SEARCH_SPEC: AgentActionSpecification = {
  name: "search",
  description: "Search the web.",
  inputSchema: {
    properties: {
      query: {
        type: "string",
        description: "The search query.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

describe("toTools (Chat Completions format)", () => {
  it("preserves the original required array from inputSchema", () => {
    const tools = toTools([BASH_SPEC]);
    const params = asFunctionTool(tools[0]).function.parameters as {
      required?: string[];
    };

    // Only "command" should be required — workingDirectory and timeoutMs are optional.
    expect(params.required).toEqual(["command"]);
  });

  it("sets strict: false to avoid schema validation rejections", () => {
    const tools = toTools([BASH_SPEC]);

    expect(asFunctionTool(tools[0]).function.strict).toBe(false);
  });

  it("preserves additionalProperties from inputSchema", () => {
    const tools = toTools([BASH_SPEC]);
    const params = asFunctionTool(tools[0]).function.parameters as {
      additionalProperties?: boolean;
    };

    expect(params.additionalProperties).toBe(false);
  });

  it("includes all properties from the input schema", () => {
    const tools = toTools([BASH_SPEC]);
    const params = asFunctionTool(tools[0]).function.parameters as {
      properties?: Record<string, unknown>;
    };

    expect(Object.keys(params.properties ?? {})).toEqual([
      "command",
      "workingDirectory",
      "timeoutMs",
    ]);
  });

  it("handles multiple tools", () => {
    const tools = toTools([BASH_SPEC, SEARCH_SPEC]);

    expect(tools).toHaveLength(2);
    expect(asFunctionTool(tools[0]).function.name).toBe("bash");
    expect(asFunctionTool(tools[1]).function.name).toBe("search");
  });

  it("handles empty specifications", () => {
    const tools = toTools([]);
    expect(tools).toEqual([]);
  });

  it("produces the same schema as the Responses API toTool for the same input", () => {
    const chatTool = toTools([BASH_SPEC])[0];
    const responsesTool = toTool(BASH_SPEC);

    // Both should have strict: false.
    expect(asFunctionTool(chatTool).function.strict).toBe(false);
    expect(responsesTool.strict).toBe(false);

    // Both should preserve the original required array.
    const chatParams = asFunctionTool(chatTool).function.parameters as {
      required?: string[];
    };
    const responsesParams = responsesTool.parameters as {
      required?: string[];
    };
    expect(chatParams.required).toEqual(responsesParams.required);

    // Both should have the same properties.
    const chatProps = (
      asFunctionTool(chatTool).function.parameters as {
        properties?: Record<string, unknown>;
      }
    ).properties;
    const responsesProps = (
      responsesTool.parameters as { properties?: Record<string, unknown> }
    ).properties;
    expect(Object.keys(chatProps ?? {})).toEqual(
      Object.keys(responsesProps ?? {})
    );
  });
});

describe("toToolChoiceParam", () => {
  it("returns 'auto' when no forced tool call", () => {
    const result = toToolChoiceParam([BASH_SPEC], undefined);
    expect(result).toBe("auto");
  });

  it("returns forced tool when specified and present", () => {
    const result = toToolChoiceParam([BASH_SPEC], "bash");
    expect(result).toEqual({
      type: "function",
      function: { name: "bash" },
    });
  });

  it("returns 'auto' when forced tool is not in specifications", () => {
    const result = toToolChoiceParam([BASH_SPEC], "nonexistent");
    expect(result).toBe("auto");
  });
});
