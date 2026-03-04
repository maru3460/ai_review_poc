'use strict';

/**
 * モデル抽象化インターフェース。
 * provider に応じた LLM クライアントを生成して返す。
 *
 * 対応プロバイダー:
 *   - "openai"     : OpenAI API（gpt-4o-mini 等）
 *   - "anthropic"  : 現状未実装（将来対応予定）
 *
 * @param {{ provider: string, apiKey: string, model: string, _openaiClient?: object }} opts
 * @returns {{ complete: function }}
 */
function createLlmClient({ provider, apiKey, model, _openaiClient }) {
  switch (provider) {
    case 'openai':
      return createOpenAiClient({ apiKey, model, _openaiClient });
    case 'anthropic':
      throw new Error(
        'anthropic provider は mode generation では現状未対応なのだ。' +
        'provider を "openai" に設定してください。' +
        '（静的解析グラフ抽出は staticAnalyzer.js が ANTHROPIC_API_KEY で別途行うのだ。）'
      );
    default:
      throw new Error(`未対応の provider: "${provider}". "openai" を指定してください。`);
  }
}

/**
 * OpenAI クライアントを生成する。
 * temperature=0 に固定して再現性を確保する。
 *
 * @param {{ apiKey: string, model: string, _openaiClient?: object }} opts
 * @returns {{ complete: function }}
 */
function createOpenAiClient({ apiKey, model, _openaiClient }) {
  // テスト用モック注入をサポートする
  let openai = _openaiClient;
  if (!openai) {
    const { OpenAI } = require('openai');
    openai = new OpenAI({ apiKey });
  }

  /**
   * LLM にメッセージを送り、テキストレスポンスを返す。
   *
   * @param {{ system: string, user: string, jsonMode?: boolean }} params
   * @returns {Promise<string>}
   */
  async function complete({ system, user, jsonMode = false }) {
    const requestParams = {
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    };

    if (jsonMode) {
      requestParams.response_format = { type: 'json_object' };
    }

    const response = await openai.chat.completions.create(requestParams);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI API returned empty response');
    }
    return content;
  }

  return { complete };
}

module.exports = { createLlmClient };
