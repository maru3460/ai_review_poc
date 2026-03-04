// PORT: Railwayは自動でPORTを注入する。ローカル開発ではBACKEND_PORTを使用する。
const REQUIRED_ENV_VARS = [
  "GITHUB_APP_ID",
  "GITHUB_TOKEN",
  "GITHUB_WEBHOOK_SECRET",
  "GITHUB_BOT_LOGIN"
];

function validateEnv(env = process.env) {
  const missing = REQUIRED_ENV_VARS.filter((name) => !env[name] || env[name].trim() === "");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. See backend/.env.example.`
    );
  }

  const port = Number(env.PORT || env.BACKEND_PORT);
  if (!port) {
    throw new Error(
      "Missing port configuration: set PORT (Railway) or BACKEND_PORT (local). See backend/.env.example."
    );
  }

  return {
    githubAppId: env.GITHUB_APP_ID,
    githubToken: env.GITHUB_TOKEN,
    githubWebhookSecret: env.GITHUB_WEBHOOK_SECRET,
    githubBotLogin: env.GITHUB_BOT_LOGIN,
    githubApiBaseUrl: env.GITHUB_API_BASE_URL || "https://api.github.com",
    port,
    redisUrl: env.REDIS_URL || null,
    // OPENAI_API_KEY は省略可能。未設定時は静的解析・モード生成をスキップする。
    openaiApiKey: env.OPENAI_API_KEY || null,
    llmProvider: env.LLM_PROVIDER || "openai",
    llmModel: env.LLM_MODEL || "gpt-4o-mini",
    // FRONTEND_URL は省略可能。未設定時はPRコメント投稿をスキップする。
    frontendUrl: env.FRONTEND_URL || null
  };
}

module.exports = {
  validateEnv
};
