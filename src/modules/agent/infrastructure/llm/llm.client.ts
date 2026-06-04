import { BadGatewayException, Injectable, Logger } from '@nestjs/common';

export interface LlmToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LlmToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
}

export interface LlmResponseMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: LlmToolCall[];
}

interface ChatCompletionResponse {
  choices: { message: LlmResponseMessage }[];
}

@Injectable()
export class LlmClient {
  private readonly logger = new Logger(LlmClient.name);

  // Dev-only: when LLM_PROXY_URL is set, route every LLM call through a
  // teammate's deployed /dev/llm proxy (authenticated with LLM_PROXY_TOKEN)
  // instead of the real provider, so the real API key never needs sharing.
  private get proxyUrl(): string {
    return process.env.LLM_PROXY_URL ?? '';
  }
  private get baseUrl(): string {
    return this.proxyUrl || (process.env.LLM_BASE_URL ?? '');
  }
  private get apiKey(): string {
    return this.proxyUrl
      ? (process.env.LLM_PROXY_TOKEN ?? '')
      : (process.env.LLM_API_KEY ?? '');
  }
  private get model(): string {
    return process.env.LLM_MODEL ?? '';
  }
  private get timeoutMs(): number {
    return Number(process.env.LLM_TIMEOUT_MS ?? '30000');
  }

  async chat(
    messages: LlmMessage[],
    tools: LlmToolDef[],
  ): Promise<LlmResponseMessage> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          tools,
          tool_choice: 'auto',
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text();
        this.logger.error(`LLM responded ${res.status}: ${detail}`);
        throw new BadGatewayException('Asisten AI sedang tidak tersedia');
      }

      const data = (await res.json()) as ChatCompletionResponse;
      const message = data.choices?.[0]?.message;
      if (!message) {
        throw new BadGatewayException('Respons asisten AI tidak valid');
      }
      return message;
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      this.logger.error(`LLM request failed: ${String(err)}`);
      throw new BadGatewayException('Gagal menghubungi asisten AI');
    } finally {
      clearTimeout(timer);
    }
  }
}
