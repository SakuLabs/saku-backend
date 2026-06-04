import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Tracks cumulative LLM proxy token usage per calendar month (UTC) so the
 * dev proxy can stop forwarding once the budget is spent and the provider
 * bill stays bounded. Limit comes from `LLM_PROXY_TOKEN_LIMIT`
 * (default 1,000,000 tokens per month).
 */
@Injectable()
export class LlmProxyUsageService {
  private readonly logger = new Logger(LlmProxyUsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  get limit(): number {
    return Number(process.env.LLM_PROXY_TOKEN_LIMIT ?? '1000000');
  }

  /** Window key for the current UTC month, e.g. "2026-06". */
  currentWindow(): string {
    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${now.getUTCFullYear()}-${month}`;
  }

  async getUsedTokens(): Promise<number> {
    const row = await this.prisma.llmProxyUsage.findUnique({
      where: { id: this.currentWindow() },
    });
    return row?.totalTokens ?? 0;
  }

  /** Throws 429 when this month's budget is already spent. */
  async assertWithinLimit(): Promise<void> {
    const used = await this.getUsedTokens();
    if (used >= this.limit) {
      throw new HttpException(
        `Batas token proxy bulan ini tercapai (${used}/${this.limit})`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async record(tokens: number): Promise<void> {
    if (!Number.isFinite(tokens) || tokens <= 0) return;
    const window = this.currentWindow();
    try {
      await this.prisma.llmProxyUsage.upsert({
        where: { id: window },
        create: { id: window, totalTokens: tokens },
        update: { totalTokens: { increment: tokens } },
      });
    } catch (err) {
      // Never fail the proxied response over accounting; log and move on.
      this.logger.error(`Failed to record proxy usage: ${String(err)}`);
    }
  }
}
