import { config } from "../config.js";

export type LlmProvider = "mock" | "claude";

type LlmChatInput = {
  provider: LlmProvider;
  model: string;
  prompt: string;
  systemPrompt?: string | undefined;
};

type ClaudeResponse = {
  content?: Array<{ type: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

const MODEL_CATALOG: Record<LlmProvider, string[]> = {
  mock: ["mock-echo-v1"],
  claude: [
    "claude-3-5-haiku-latest",
    "claude-3-5-sonnet-latest",
    "claude-3-7-sonnet-latest"
  ]
};

const DEFAULT_SYSTEM_PROMPT =
  "You are an AI trading copilot. Help improve TypeScript strategies, risk settings, and explain tradeoffs clearly.";

export class LlmService {
  getOptions() {
    const availableProviders = config.CLAUDE_API_KEY
      ? (["claude", "mock"] as const)
      : (["mock", "claude"] as const);

    const defaultProvider = config.CLAUDE_API_KEY ? "claude" : "mock";

    return {
      providers: availableProviders.map((provider) => ({
        provider,
        models: MODEL_CATALOG[provider],
        enabled: provider === "mock" || Boolean(config.CLAUDE_API_KEY)
      })),
      defaultProvider,
      defaultModel: MODEL_CATALOG[defaultProvider][0]
    };
  }

  async chat(input: LlmChatInput) {
    if (input.provider === "mock") {
      return {
        provider: "mock" as const,
        model: input.model,
        text: [
          "Mock provider response:",
          "",
          "Suggested next steps:",
          "1. Validate risk limits before live run.",
          "2. Compare short/long MA sensitivity on 3 different windows.",
          "3. Add stop-loss logic in strategy parameters."
        ].join("\n"),
        usage: {
          inputTokens: Math.ceil(input.prompt.length / 4),
          outputTokens: 40
        }
      };
    }

    return this.chatClaude(input);
  }

  private async chatClaude(input: LlmChatInput) {
    if (!config.CLAUDE_API_KEY) {
      throw new Error("CLAUDE_API_KEY is not configured");
    }

    const response = await fetch(`${config.CLAUDE_BASE_URL.replace(/\/+$/, "")}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": config.CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: config.CLAUDE_MAX_TOKENS,
        system: input.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: input.prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Claude API error (${response.status}): ${details.slice(0, 400)}`);
    }

    const payload = (await response.json()) as ClaudeResponse;
    const text = (payload.content ?? [])
      .filter((chunk) => chunk.type === "text")
      .map((chunk) => chunk.text ?? "")
      .join("\n")
      .trim();

    return {
      provider: "claude" as const,
      model: input.model,
      text: text || "Claude returned an empty response.",
      usage: {
        inputTokens: payload.usage?.input_tokens ?? null,
        outputTokens: payload.usage?.output_tokens ?? null
      }
    };
  }
}
