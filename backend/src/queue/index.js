const { Queue } = require('bullmq');
const { connection } = require('../config/redis');

// Declare and instantiate BullMQ ingestion queue
const webhookQueue = new Queue('webhook-events-queue', {
  connection
});

/**
 * Helper to dispatch verified webhook payload into Redis queue
 */
async function enqueueWebhookJob(deliveryId, eventType, targetRepository, payload) {
  const job = await webhookQueue.add(
    'github-webhook',
    {
      deliveryId,
      eventType,
      targetRepository,
      payload
    },
    {
      removeOnComplete: { count: 50 }, // Keep Redis clean
      removeOnFail: { count: 100 },
      attempts: 3, // Outbound dispatches can experience transient errors, retry with backoff
      backoff: {
        type: 'exponential',
        delay: 5000 // Start with 5 seconds backoff delay
      }
    }
  );
  return job;
}

module.exports = {
  webhookQueue,
  enqueueWebhookJob
};
