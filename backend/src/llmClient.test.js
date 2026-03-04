const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createLlmClient } = require('./llmClient');

// ---------------------------------------------------------------------------
// テスト用 OpenAI クライアントモック
// 各呼び出しパラメータをクロージャでキャプチャしてテスト間の競合を防ぐ
// ---------------------------------------------------------------------------
function makeMockOpenAiClient(responseContent) {
  let lastParams;
  const client = {
    chat: {
      completions: {
        create: async (params) => {
          lastParams = params;
          return {
            choices: [{ message: { content: responseContent } }]
          };
        }
      }
    },
    getLastParams: () => lastParams
  };
  return client;
}

// ---------------------------------------------------------------------------
// createLlmClient - 基本
// ---------------------------------------------------------------------------
describe('createLlmClient', () => {
  it('openai プロバイダーで complete 関数を持つオブジェクトを返す', () => {
    const client = createLlmClient({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      _openaiClient: makeMockOpenAiClient('response text')
    });
    assert.equal(typeof client.complete, 'function');
  });

  it('anthropic プロバイダーはエラーをスローする', () => {
    assert.throws(
      () => createLlmClient({ provider: 'anthropic', apiKey: 'test', model: 'claude' }),
      /anthropic provider/
    );
  });

  it('未知のプロバイダーはエラーをスローする', () => {
    assert.throws(
      () => createLlmClient({ provider: 'gemini', apiKey: 'test', model: 'gemini-pro' }),
      /未対応の provider/
    );
  });
});

// ---------------------------------------------------------------------------
// OpenAI クライアント - complete
// ---------------------------------------------------------------------------
describe('createLlmClient (openai) - complete', () => {
  it('テキストレスポンスを返す', async () => {
    const mockClient = makeMockOpenAiClient('Hello from GPT');
    const client = createLlmClient({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      _openaiClient: mockClient
    });

    const result = await client.complete({ system: 'You are helpful', user: 'Hello' });
    assert.equal(result, 'Hello from GPT');
  });

  it('temperature: 0 で呼び出される（再現性）', async () => {
    const mockClient = makeMockOpenAiClient('response');
    const client = createLlmClient({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      _openaiClient: mockClient
    });

    await client.complete({ system: 'system', user: 'user' });
    assert.equal(mockClient.getLastParams().temperature, 0);
  });

  it('jsonMode=true のとき response_format が json_object になる', async () => {
    const mockClient = makeMockOpenAiClient('{"result": true}');
    const client = createLlmClient({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      _openaiClient: mockClient
    });

    await client.complete({ system: 'system', user: 'user', jsonMode: true });
    assert.deepEqual(mockClient.getLastParams().response_format, { type: 'json_object' });
  });

  it('jsonMode が未指定のとき response_format は設定されない', async () => {
    const mockClient = makeMockOpenAiClient('text response');
    const client = createLlmClient({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      _openaiClient: mockClient
    });

    await client.complete({ system: 'system', user: 'user' });
    assert.equal(mockClient.getLastParams().response_format, undefined);
  });

  it('モデル名がリクエストに含まれる', async () => {
    const mockClient = makeMockOpenAiClient('response');
    const client = createLlmClient({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4o',
      _openaiClient: mockClient
    });

    await client.complete({ system: 'system', user: 'user' });
    assert.equal(mockClient.getLastParams().model, 'gpt-4o');
  });

  it('空レスポンスはエラーをスローする', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: async () => ({ choices: [{ message: { content: null } }] })
        }
      }
    };
    const client = createLlmClient({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      _openaiClient: mockClient
    });

    await assert.rejects(() => client.complete({ system: 'system', user: 'user' }), /empty response/);
  });

  it('system と user メッセージが正しく組み立てられる', async () => {
    const mockClient = makeMockOpenAiClient('ok');
    const client = createLlmClient({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      _openaiClient: mockClient
    });

    await client.complete({ system: 'You are an expert', user: 'Analyze this code' });
    const messages = mockClient.getLastParams().messages;
    assert.equal(messages[0].role, 'system');
    assert.equal(messages[0].content, 'You are an expert');
    assert.equal(messages[1].role, 'user');
    assert.equal(messages[1].content, 'Analyze this code');
  });
});
