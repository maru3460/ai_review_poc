// PORT: Railwayは自動でPORTを注入する。ローカル開発ではFRONTEND_PORTを使用する。
const REQUIRED_ENV_VARS = ["BACKEND_BASE_URL"];

function validateEnv(env = process.env) {
  const missing = REQUIRED_ENV_VARS.filter((name) => !env[name] || env[name].trim() === "");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. See frontend/.env.example.`
    );
  }

  const port = Number(env.PORT || env.FRONTEND_PORT);
  if (!port) {
    throw new Error(
      "Missing port configuration: set PORT (Railway) or FRONTEND_PORT (local). See frontend/.env.example."
    );
  }

  return {
    port,
    backendBaseUrl: env.BACKEND_BASE_URL
  };
}

module.exports = {
  validateEnv
};
