class InMemoryJobQueue {
  constructor() {
    this.jobs = [];
    this.processedDeliveryIds = new Set();
  }

  enqueue(job) {
    if (!job.deliveryId) {
      throw new Error("deliveryId is required");
    }

    if (this.processedDeliveryIds.has(job.deliveryId)) {
      return { enqueued: false, reason: "duplicate_delivery" };
    }

    this.jobs.push({
      ...job,
      enqueuedAt: new Date().toISOString()
    });
    this.processedDeliveryIds.add(job.deliveryId);

    return { enqueued: true };
  }

  list() {
    return [...this.jobs];
  }

  size() {
    return this.jobs.length;
  }
}

module.exports = {
  InMemoryJobQueue
};
