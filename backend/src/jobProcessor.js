const { GithubClient } = require("./githubClient");
const { collectPullRequestMetadata } = require("./prMetadataCollector");
const { savePullRequestMetadata, savePullRequestMetadataFailure } = require("./prMetadataStore");

function createJobProcessor(config) {
  const githubClient = new GithubClient({
    token: config.githubToken,
    apiBaseUrl: config.githubApiBaseUrl
  });

  return async function processJob(job) {
    if (!job.repositoryFullName || !job.prNumber) {
      const error = new Error("repositoryFullName and prNumber are required");
      await savePullRequestMetadataFailure({
        repositoryFullName: job.repositoryFullName,
        prNumber: job.prNumber,
        deliveryId: job.deliveryId,
        error
      });
      throw error;
    }

    try {
      const metadata = await collectPullRequestMetadata({
        githubClient,
        repositoryFullName: job.repositoryFullName,
        prNumber: job.prNumber
      });
      const outputPath = await savePullRequestMetadata(metadata);
      return { outputPath };
    } catch (error) {
      await savePullRequestMetadataFailure({
        repositoryFullName: job.repositoryFullName,
        prNumber: job.prNumber,
        deliveryId: job.deliveryId,
        error
      });
      throw error;
    }
  };
}

module.exports = {
  createJobProcessor
};
