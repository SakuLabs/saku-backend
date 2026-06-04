import { Test, TestingModule } from '@nestjs/testing';
import {
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { LlmProxyController } from './llm-proxy.controller';
import { LlmProxyUsageService } from './llm-proxy-usage.service';

const createResMock = () => {
  const res = {
    status: jest.fn(),
    set: jest.fn(),
    send: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  res.set.mockReturnValue(res);
  return res as unknown as Response & {
    status: jest.Mock;
    set: jest.Mock;
    send: jest.Mock;
    json: jest.Mock;
  };
};

describe('LlmProxyController', () => {
  let controller: LlmProxyController;
  const ORIGINAL_ENV = process.env;
  const fetchMock = jest.fn();
  const usageMock = {
    limit: 1_000_000,
    currentWindow: jest.fn().mockReturnValue('2026-06'),
    getUsedTokens: jest.fn(),
    assertWithinLimit: jest.fn(),
    record: jest.fn(),
  };

  beforeEach(async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'development',
      LLM_PROXY_ENABLED: 'true',
      LLM_PROXY_TOKEN: 'dev-token',
      LLM_BASE_URL: 'https://llm.example.com/v1',
      LLM_API_KEY: 'real-key',
    };
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
    usageMock.getUsedTokens.mockReset().mockResolvedValue(0);
    usageMock.assertWithinLimit.mockReset().mockResolvedValue(undefined);
    usageMock.record.mockReset().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LlmProxyController],
      providers: [{ provide: LlmProxyUsageService, useValue: usageMock }],
    }).compile();

    controller = module.get(LlmProxyController);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('404s when the proxy is disabled', async () => {
    process.env.LLM_PROXY_ENABLED = 'false';
    await expect(
      controller.chatCompletions({}, 'Bearer dev-token', createResMock()),
    ).rejects.toThrow(NotFoundException);
  });

  it('404s in production even when enabled', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      controller.chatCompletions({}, 'Bearer dev-token', createResMock()),
    ).rejects.toThrow(NotFoundException);
  });

  it('404s when no proxy token is configured', async () => {
    delete process.env.LLM_PROXY_TOKEN;
    await expect(
      controller.chatCompletions({}, 'Bearer dev-token', createResMock()),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects a wrong or missing proxy token', async () => {
    await expect(
      controller.chatCompletions({}, 'Bearer wrong', createResMock()),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      controller.chatCompletions({}, undefined, createResMock()),
    ).rejects.toThrow(UnauthorizedException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the request upstream with the real API key', async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: jest.fn().mockResolvedValue('{"choices":[]}'),
      headers: { get: () => 'application/json' },
    });
    const res = createResMock();

    await controller.chatCompletions(
      { model: 'gpt-x', messages: [] },
      'Bearer dev-token',
      res,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://llm.example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer real-key',
        }) as Record<string, string>,
      }),
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({ model: 'gpt-x', messages: [], stream: false });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('{"choices":[]}');
  });

  it('mirrors upstream error status and body', async () => {
    fetchMock.mockResolvedValue({
      status: 429,
      text: jest.fn().mockResolvedValue('{"error":"rate limit"}'),
      headers: { get: () => 'application/json' },
    });
    const res = createResMock();

    await controller.chatCompletions({}, 'Bearer dev-token', res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.send).toHaveBeenCalledWith('{"error":"rate limit"}');
  });

  it('rejects with 429 when the monthly token budget is spent', async () => {
    usageMock.assertWithinLimit.mockRejectedValue(
      new HttpException('limit', 429),
    );
    await expect(
      controller.chatCompletions({}, 'Bearer dev-token', createResMock()),
    ).rejects.toThrow(HttpException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records token usage from the upstream usage block', async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: jest
        .fn()
        .mockResolvedValue('{"choices":[],"usage":{"total_tokens":1234}}'),
      headers: { get: () => 'application/json' },
    });

    await controller.chatCompletions({}, 'Bearer dev-token', createResMock());

    expect(usageMock.record).toHaveBeenCalledWith(1234);
  });

  it('falls back to a chars/4 estimate when usage is missing', async () => {
    const text = '{"choices":[]}';
    fetchMock.mockResolvedValue({
      status: 200,
      text: jest.fn().mockResolvedValue(text),
      headers: { get: () => 'application/json' },
    });
    const body = { messages: [] };

    await controller.chatCompletions(body, 'Bearer dev-token', createResMock());

    const expected = Math.ceil((JSON.stringify(body).length + text.length) / 4);
    expect(usageMock.record).toHaveBeenCalledWith(expected);
  });

  it('reports current usage on GET /dev/llm/usage', async () => {
    usageMock.getUsedTokens.mockResolvedValue(42);

    await expect(controller.getUsage('Bearer dev-token')).resolves.toEqual({
      window: '2026-06',
      usedTokens: 42,
      limit: 1_000_000,
    });
    await expect(controller.getUsage('Bearer wrong')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('returns 502 when the upstream request fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const res = createResMock();

    await controller.chatCompletions({}, 'Bearer dev-token', res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Gagal menghubungi asisten AI',
    });
  });
});
