const fs = require("node:fs/promises");
const path = require("node:path");

const BASE_DIR = path.join(__dirname, "..", "data", "static-analysis");

async function saveStaticAnalysis(analysis) {
  const safeRepoName = (analysis.repositoryFullName || "unknown-repository").replace(/\//g, "__");
  const outputPath = path.join(BASE_DIR, safeRepoName, `pr-${analysis.prNumber}.json`);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(analysis, null, 2)}\n`, "utf8");
  return outputPath;
}

module.exports = { saveStaticAnalysis };
