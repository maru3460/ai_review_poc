const fs = require("node:fs/promises");
const path = require("node:path");

const BASE_DIR = path.join(__dirname, "..", "data", "static-analysis");

async function saveStaticAnalysis(analysis) {
  const safeRepoName = (analysis.repositoryFullName || "unknown-repository").replace(/\//g, "__");
  const safePrNumber = String(parseInt(analysis.prNumber, 10));
  const outputPath = path.join(BASE_DIR, safeRepoName, `pr-${safePrNumber}.json`);
  if (!outputPath.startsWith(BASE_DIR + path.sep)) {
    throw new Error(`invalid output path: ${outputPath}`);
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(analysis, null, 2)}\n`, "utf8");
  return outputPath;
}

module.exports = { saveStaticAnalysis };
