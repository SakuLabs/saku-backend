import { BadGatewayException } from '@nestjs/common';
import { LlmClient, LlmMessage, LlmToolDef } from './llm.client';

describe('LlmClient', () => {
  const ORIGINAL_ENV = process.env;
  let client: LlmClient;

  const messages: LlmMessage[] = [{ role: 'user', content: 'hi' }];
  const tools: LlmToolDef[] = [];

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      LLM_BASE_URL: 'https://mimo.test/v1',
      LLM_API_KEY: 'key-123',
      LLM_MODEL: 'mimo-1',
    };
    client = new LlmClient();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  it('posts to the chat completions endpoint and returns the assistant message', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'hello' } }],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await client.chat(messages, tools);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://mimo.test/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers['Authorization']).toBe('Bearer key-123');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('mimo-1');
    expect(body.messages).toEqual(messages);
    expect(body.tool_choice).toBe('auto');
    expect(result.content).toBe('hello');
  });

  it('routes through the dev proxy when LLM_PROXY_URL is set', async () => {
    process.env.LLM_PROXY_URL = 'https://deployed.test/dev/llm';
    process.env.LLM_PROXY_TOKEN = 'proxy-token';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'hello' } }],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await client.chat(messages, tools);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://deployed.test/dev/llm/chat/completions');
    expect(init.headers['Authorization']).toBe('Bearer proxy-token');
  });

  it('uses the real provider when LLM_PROXY_URL is not set', async () => {
    delete process.env.LLM_PROXY_URL;
    process.env.LLM_PROXY_TOKEN = 'proxy-token'; // set but unused without URL
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'hello' } }],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await client.chat(messages, tools);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://mimo.test/v1/chat/completions');
    expect(init.headers['Authorization']).toBe('Bearer key-123');
  });

  it('returns tool_calls when present', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'list_tasks', arguments: '{}' },
                },
              ],
            },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const result = await client.chat(messages, tools);
    expect(result.tool_calls?.[0].function.name).toBe('list_tasks');
  });

  it('throws BadGatewayException on non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    }) as unknown as typeof fetch;

    await expect(client.chat(messages, tools)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('throws BadGatewayException when fetch rejects (network/timeout)', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('aborted')) as unknown as typeof fetch;

    await expect(client.chat(messages, tools)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
