const { GithubClient } = require("./githubClient");
const { collectPullRequestMetadata } = require("./prMetadataCollector");
const { savePullRequestMetadata, savePullRequestMetadataFailure } = require("./prMetadataStore");
const { analyzeStaticGraph } = require("./staticAnalyzer");
const { saveStaticAnalysis } = require("./staticAnalysisStore");
const { buildGraph } = require("./graphBuilder");
const { generateAllModes } = require("./modeGenerator");
const { saveModeResults } = require("./modeResultStore");
const { createLlmClient } = require("./llmClient");
const { postVisualizationComment } = require("./prCommentPoster");

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

      // メタ情報収集完了後にコメント投稿（LLM解析スキップ時も投稿する）
      const commentResult = await postVisualizationComment({
        githubClient,
        repositoryFullName: metadata.repositoryFullName,
        prNumber: metadata.prNumber,
        frontendBaseUrl: config.frontendUrl,
        prTitle: metadata.prTitle
      });
      if (!commentResult.posted) {
        console.warn(`[jobProcessor] コメント投稿スキップ/失敗: ${commentResult.reason}`);
      }

      if (config.openaiApiKey) {
        const analysis = await analyzeStaticGraph({
          metadata,
          openaiApiKey: config.openaiApiKey
        });
        await saveStaticAnalysis(analysis);

        const graph = buildGraph({ nodes: analysis.nodes, edges: analysis.edges });
        const llmClient = createLlmClient({
          provider: config.llmProvider,
          apiKey: config.openaiApiKey,
          model: config.llmModel
        });
        const modes = await generateAllModes({ graph, metadata, llmClient });
        await saveModeResults({
          repositoryFullName: metadata.repositoryFullName,
          prNumber: metadata.prNumber,
          modes
        });
      }

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
