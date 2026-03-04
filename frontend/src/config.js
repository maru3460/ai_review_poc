// PORT: Railwayは自動でPORTを注入する。ローカル開発ではFRONTEND_PORTを使用する。
// VITE_BACKEND_BASE_URL はビルド時にViteが埋め込むため、ここではチェックしない。
function validateEnv(env = process.env) {
  const port = Number(env.PORT || env.FRONTEND_PORT);
  if (!port) {
    throw new Error(
      "Missing port configuration: set PORT (Railway) or FRONTEND_PORT (local). See frontend/.env.example."
    );
  }

  return { port };
}

module.exports = {
  validateEnv
};
