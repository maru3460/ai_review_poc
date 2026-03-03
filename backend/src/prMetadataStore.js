const fs = require("node:fs/promises");
const path = require("node:path");

const BASE_DIR = path.join(__dirname, "..", "data", "pr-metadata");

async function savePullRequestMetadata(metadata) {
  const outputPath = buildOutputPath({
    repositoryFullName: metadata.repositoryFullName,
    prNumber: metadata.prNumber,
    type: "metadata"
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return outputPath;
}

async function savePullRequestMetadataFailure({ repositoryFullName, prNumber, deliveryId, error }) {
  const outputPath = buildOutputPath({
    repositoryFullName,
    prNumber,
    type: "failure"
  });
  const payload = {
    recordedAt: new Date().toISOString(),
    repositoryFullName,
    prNumber,
    deliveryId,
    errorMessage: error.message,
    errorName: error.name || "Error",
    status: error.status || null
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return outputPath;
}

function buildOutputPath({ repositoryFullName, prNumber, type }) {
  const safeRepositoryName = (repositoryFullName || "unknown-repository").replace(/\//g, "__");
  const fileName = type === "metadata" ? `pr-${prNumber}.json` : `pr-${prNumber}.failure.json`;
  return path.join(BASE_DIR, safeRepositoryName, fileName);
}

module.exports = {
  savePullRequestMetadata,
  savePullRequestMetadataFailure
};
