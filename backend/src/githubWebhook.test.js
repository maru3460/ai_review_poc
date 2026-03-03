const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { verifySignature, isTargetEvent, buildJobFromPayload } = require("./githubWebhook");

test("verifySignature returns true for valid signature", () => {
  const secret = "secret";
  const rawBody = Buffer.from('{"hello":"world"}', "utf8");
  const signature = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;

  assert.equal(verifySignature(rawBody, signature, secret), true);
});

test("verifySignature returns false for invalid signature", () => {
  const secret = "secret";
  const rawBody = Buffer.from('{"hello":"world"}', "utf8");

  assert.equal(verifySignature(rawBody, "sha256=invalid", secret), false);
});

test("isTargetEvent accepts pull_request opened", () => {
  const payload = { action: "opened" };

  assert.equal(isTargetEvent("pull_request", payload, "ai-review-bot"), true);
});

test("isTargetEvent rejects pull_request closed", () => {
  const payload = { action: "closed" };

  assert.equal(isTargetEvent("pull_request", payload, "ai-review-bot"), false);
});

test("isTargetEvent accepts issue_comment created with bot mention", () => {
  const payload = {
    action: "created",
    issue: { pull_request: { url: "https://api.github.com/repos/org/repo/pulls/1" } },
    comment: { body: "please check @ai-review-bot" }
  };

  assert.equal(isTargetEvent("issue_comment", payload, "ai-review-bot"), true);
});

test("isTargetEvent rejects issue_comment without bot mention", () => {
  const payload = {
    action: "created",
    issue: { pull_request: { url: "https://api.github.com/repos/org/repo/pulls/1" } },
    comment: { body: "please check" }
  };

  assert.equal(isTargetEvent("issue_comment", payload, "ai-review-bot"), false);
});

test("buildJobFromPayload extracts minimal fields", () => {
  const payload = {
    action: "opened",
    repository: { full_name: "org/repo" },
    pull_request: { number: 42 },
    sender: { login: "alice" }
  };

  const job = buildJobFromPayload({
    deliveryId: "delivery-1",
    event: "pull_request",
    payload
  });

  assert.deepEqual(job, {
    deliveryId: "delivery-1",
    event: "pull_request",
    action: "opened",
    repositoryFullName: "org/repo",
    prNumber: 42,
    requestedBy: "alice"
  });
});
