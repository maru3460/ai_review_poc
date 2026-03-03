const test = require("node:test");
const assert = require("node:assert/strict");
const { InMemoryJobQueue } = require("./jobQueue");

test("enqueue adds a new job", () => {
  const queue = new InMemoryJobQueue();
  const result = queue.enqueue({ deliveryId: "delivery-1", event: "pull_request" });

  assert.equal(result.enqueued, true);
  assert.equal(queue.size(), 1);
});

test("enqueue ignores duplicate delivery id", () => {
  const queue = new InMemoryJobQueue();

  const first = queue.enqueue({ deliveryId: "delivery-1", event: "pull_request" });
  const second = queue.enqueue({ deliveryId: "delivery-1", event: "issue_comment" });

  assert.equal(first.enqueued, true);
  assert.equal(second.enqueued, false);
  assert.equal(second.reason, "duplicate_delivery");
  assert.equal(queue.size(), 1);
});
