/**
 * PRコメント投稿モジュール
 * 可視化ページのURLをPRコメントとして投稿する。
 */

function buildVisualizationUrl({ frontendBaseUrl, owner, repo, prNumber }) {
  return `${frontendBaseUrl.replace(/\/$/, "")}/prs/${owner}/${repo}/${prNumber}`;
}

function buildCommentBody({ visualizationUrl, prTitle }) {
  const titleLine = prTitle ? `\n> **PR**: ${prTitle}` : "";
  return `## PR可視化レビューが完了しました\n\n[可視化レビューを開く](${visualizationUrl})${titleLine}`;
}

/**
 * PRにコメントを投稿する。
 * 投稿失敗時はエラーをthrowせずコンソールにログ記録する。
 *
 * @param {object} params
 * @param {import('./githubClient').GithubClient} params.githubClient
 * @param {string} params.repositoryFullName - "owner/repo" 形式
 * @param {number|string} params.prNumber
 * @param {string} params.frontendBaseUrl
 * @param {string} [params.prTitle]
 * @returns {Promise<{posted: boolean, commentUrl?: string, reason?: string}>}
 */
async function postVisualizationComment({
  githubClient,
  repositoryFullName,
  prNumber,
  frontendBaseUrl,
  prTitle = ""
}) {
  if (!frontendBaseUrl) {
    console.log("[prCommentPoster] FRONTEND_URL未設定のためコメント投稿をスキップする");
    return { posted: false, reason: "FRONTEND_URL not configured" };
  }

  const parts = (repositoryFullName || "").split("/");
  const [owner, repo] = parts;
  if (!owner || !repo) {
    console.error(`[prCommentPoster] repositoryFullNameが不正な形式なのだ: "${repositoryFullName}"`);
    return { posted: false, reason: "invalid repositoryFullName" };
  }

  const visualizationUrl = buildVisualizationUrl({ frontendBaseUrl, owner, repo, prNumber });
  const body = buildCommentBody({ visualizationUrl, prTitle });

  try {
    const result = await githubClient.post(
      `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
      { body }
    );
    const commentUrl = result.data?.html_url || "";
    console.log(`[prCommentPoster] コメント投稿完了: ${commentUrl}`);
    return { posted: true, commentUrl };
  } catch (error) {
    console.error(`[prCommentPoster] コメント投稿失敗: ${error.message}`);
    return { posted: false, reason: error.message };
  }
}

module.exports = {
  postVisualizationComment,
  buildVisualizationUrl,
  buildCommentBody
};
