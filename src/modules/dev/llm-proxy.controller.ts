import { timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Headers,
  Logger,
  NotFoundException,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { LlmProxyUsageService } from './llm-proxy-usage.service';

/**
 * Development-only LLM proxy so teammates can run the agent locally without
 * holding the real provider API key. They point their local backend at this
 * instance (`LLM_PROXY_URL=https://<deployed-host>/dev/llm`) and authenticate
 * with the shared `LLM_PROXY_TOKEN` instead of the provider key — see
 * LlmClient, which switches to these vars when `LLM_PROXY_URL` is set.
 *
 * The route only exists when ALL of the following hold, otherwise it 404s:
 * - `NODE_ENV` is not `production`
 * - `LLM_PROXY_ENABLED=true`
 * - `LLM_PROXY_TOKEN` is set (never run the proxy unauthenticated)
 */
@ApiExcludeController()
@Controller('dev/llm')
export class LlmProxyController {
  private readonly logger = new Logger(LlmProxyController.name);

  constructor(private readonly usage: LlmProxyUsageService) {}

  private get enabled(): boolean {
    return (
      process.env.NODE_ENV !== 'production' &&
      process.env.LLM_PROXY_ENABLED === 'true' &&
      Boolean(process.env.LLM_PROXY_TOKEN)
    );
  }

  private get timeoutMs(): number {
    return Number(process.env.LLM_TIMEOUT_MS ?? '30000');
  }

  @Post('chat/completions')
  async chatCompletions(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.enabled) {
      throw new NotFoundException();
    }
    this.assertProxyToken(authorization);
    await this.usage.assertWithinLimit();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const upstream = await fetch(
        `${process.env.LLM_BASE_URL ?? ''}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.LLM_API_KEY ?? ''}`,
          },
          // Force non-streaming: the proxy buffers the upstream body and
          // LlmClient never streams anyway.
          body: JSON.stringify({ ...body, stream: false }),
          signal: controller.signal,
        },
      );

      const text = await upstream.text();
      await this.usage.record(this.extractTokens(body, text));
      res
        .status(upstream.status)
        .set(
          'Content-Type',
          upstream.headers.get('content-type') ?? 'application/json',
        )
        .send(text);
    } catch (err) {
      this.logger.error(`LLM proxy request failed: ${String(err)}`);
      res.status(502).json({ message: 'Gagal menghubungi asisten AI' });
    } finally {
      clearTimeout(timer);
    }
  }

  @Get('usage')
  async getUsage(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<{ window: string; usedTokens: number; limit: number }> {
    if (!this.enabled) {
      throw new NotFoundException();
    }
    this.assertProxyToken(authorization);
    return {
      window: this.usage.currentWindow(),
      usedTokens: await this.usage.getUsedTokens(),
      limit: this.usage.limit,
    };
  }

  /**
   * Token count for accounting: prefer the provider's `usage.total_tokens`
   * (OpenAI-compatible, MiMo included); fall back to a rough chars/4 estimate
   * so a missing usage block never makes a request count as free.
   */
  private extractTokens(body: Record<string, unknown>, text: string): number {
    try {
      const parsed = JSON.parse(text) as {
        usage?: { total_tokens?: number };
      };
      const total = parsed.usage?.total_tokens;
      if (typeof total === 'number' && total > 0) return total;
    } catch {
      // not JSON — fall through to the estimate
    }
    return Math.ceil((JSON.stringify(body).length + text.length) / 4);
  }

  private assertProxyToken(authorization: string | undefined): void {
    const token = authorization?.replace(/^Bearer\s+/i, '') ?? '';
    const expected = process.env.LLM_PROXY_TOKEN ?? '';
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Token proxy tidak valid');
    }
  }
}
