import { HttpException } from '@nestjs/common';
import { LlmProxyUsageService } from './llm-proxy-usage.service';
import { createPrismaMock, MockPrisma } from '../../../test/utils/prisma-mock';
import { PrismaService } from '../../prisma/prisma.service';

describe('LlmProxyUsageService', () => {
  const ORIGINAL_ENV = process.env;
  let prisma: MockPrisma;
  let service: LlmProxyUsageService;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.LLM_PROXY_TOKEN_LIMIT;
    prisma = createPrismaMock();
    service = new LlmProxyUsageService(prisma as unknown as PrismaService);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('defaults the limit to 1M tokens and reads LLM_PROXY_TOKEN_LIMIT', () => {
    expect(service.limit).toBe(1_000_000);
    process.env.LLM_PROXY_TOKEN_LIMIT = '500000';
    expect(service.limit).toBe(500_000);
  });

  it('uses the current UTC month as the window key', () => {
    expect(service.currentWindow()).toMatch(/^\d{4}-\d{2}$/);
  });

  it('passes when usage is under the limit', async () => {
    prisma.llmProxyUsage.findUnique.mockResolvedValue({
      id: service.currentWindow(),
      totalTokens: 999_999,
      updatedAt: new Date(),
    });
    await expect(service.assertWithinLimit()).resolves.toBeUndefined();
  });

  it('throws 429 once the limit is reached', async () => {
    prisma.llmProxyUsage.findUnique.mockResolvedValue({
      id: service.currentWindow(),
      totalTokens: 1_000_000,
      updatedAt: new Date(),
    });
    await expect(service.assertWithinLimit()).rejects.toMatchObject({
      status: 429,
    });
    await expect(service.assertWithinLimit()).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('treats a missing row as zero usage', async () => {
    prisma.llmProxyUsage.findUnique.mockResolvedValue(null);
    await expect(service.getUsedTokens()).resolves.toBe(0);
    await expect(service.assertWithinLimit()).resolves.toBeUndefined();
  });

  it('upserts the window counter when recording usage', async () => {
    await service.record(250);
    expect(prisma.llmProxyUsage.upsert).toHaveBeenCalledWith({
      where: { id: service.currentWindow() },
      create: { id: service.currentWindow(), totalTokens: 250 },
      update: { totalTokens: { increment: 250 } },
    });
  });

  it('ignores zero, negative, and non-finite token counts', async () => {
    await service.record(0);
    await service.record(-5);
    await service.record(Number.NaN);
    expect(prisma.llmProxyUsage.upsert).not.toHaveBeenCalled();
  });

  it('swallows accounting errors so the proxied response still succeeds', async () => {
    prisma.llmProxyUsage.upsert.mockRejectedValue(new Error('db down'));
    await expect(service.record(100)).resolves.toBeUndefined();
  });
});
