const crypto = require("node:crypto");

const TARGET_PULL_REQUEST_ACTIONS = new Set(["opened", "synchronize"]);

function verifySignature(rawBody, signatureHeader, webhookSecret) {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex")}`;

  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signatureHeader, "utf8");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function isPullRequestEvent(event, payload) {
  return event === "pull_request" && TARGET_PULL_REQUEST_ACTIONS.has(payload.action);
}

function isIssueCommentMentionEvent(event, payload, botLogin) {
  if (event !== "issue_comment" || payload.action !== "created") {
    return false;
  }

  if (!payload.issue || !payload.issue.pull_request) {
    return false;
  }

  const body = payload.comment?.body || "";
  if (!botLogin) {
    return /@\w+/.test(body);
  }

  const mentionPattern = new RegExp(`(^|\\s)@${escapeRegExp(botLogin)}(\\b|\\s|$)`, "i");
  return mentionPattern.test(body);
}

function isTargetEvent(event, payload, botLogin) {
  return isPullRequestEvent(event, payload) || isIssueCommentMentionEvent(event, payload, botLogin);
}

function buildJobFromPayload({ deliveryId, event, payload }) {
  const repositoryFullName = payload.repository?.full_name || null;
  const prNumber = payload.pull_request?.number || payload.issue?.number || null;

  return {
    deliveryId,
    event,
    action: payload.action || null,
    repositoryFullName,
    prNumber,
    requestedBy: payload.sender?.login || null
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  verifySignature,
  isTargetEvent,
  buildJobFromPayload
};
