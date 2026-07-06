const express = require('express');
const { verifyGithubSignature } = require('../middleware/auth');
const { enqueueWebhookJob } = require('../queue');

const router = express.Router();

/**
 * Public GitHub Webhook endpoint
 * Matches Phase 2 structure: Signature Check -> Fast Queue Dispatch -> 202 Response
 */
router.post('/github', verifyGithubSignature, async (req, res) => {
  const deliveryId = req.headers['x-github-delivery'];
  const eventType = req.headers['x-github-event'];

  if (!deliveryId || !eventType) {
    return res.status(400).json({ error: 'Missing mandatory x-github-delivery or x-github-event headers' });
  }

  // Gracefully acknowledge GitHub's ping test endpoint
  if (eventType === 'ping') {
    return res.status(200).json({ message: 'pong' });
  }

  try {
    const payload = req.body;
    const targetRepository = payload.repository?.full_name;

    if (!targetRepository) {
      return res.status(400).json({ error: 'Repository information missing in webhook payload' });
    }

    // Fast handover to BullMQ queue
    await enqueueWebhookJob(deliveryId, eventType, targetRepository, payload);

    // Prompt respond with 202 Accepted (<50ms processing budget)
    res.status(202).json({
      message: 'Event accepted and queued',
      delivery_id: deliveryId
    });
  } catch (err) {
    console.error('Failed to queue incoming webhook:', err.message);
    res.status(500).json({ error: 'Failed to accept webhook event' });
  }
});

module.exports = router;
