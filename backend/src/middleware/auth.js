const crypto = require('crypto');
const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * Middleware to verify GitHub Webhook Signatures using HMAC-SHA256.
 * Expects the raw request body to be stored on req.rawBody.
 */
function verifyGithubSignature(req, res, next) {
  const signatureHeader = req.headers['x-hub-signature-256'];
  if (!signatureHeader) {
    return res.status(401).json({ error: 'Missing X-Hub-Signature-256 header' });
  }

  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('Error: GITHUB_WEBHOOK_SECRET is not configured.');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    return res.status(401).json({ error: 'Invalid signature format' });
  }

  const expectedSignature = parts[1];
  if (!req.rawBody) {
    return res.status(400).json({ error: 'Raw body payload is missing. Unable to verify signature.' });
  }

  const hmac = crypto.createHmac('sha256', webhookSecret);
  hmac.update(req.rawBody);
  const calculatedSignature = hmac.digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const calculatedBuf = Buffer.from(calculatedSignature, 'utf8');

  // Verify signature in constant time
  if (expectedBuf.length !== calculatedBuf.length || !crypto.timingSafeEqual(expectedBuf, calculatedBuf)) {
    return res.status(401).json({ error: 'Signature verification failed' });
  }

  next();
}

/**
 * Middleware to authenticate frontend dashboard requests via JWT.
 */
function authenticateUser(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access token is required' });
  }

  const token = authHeader.split(' ')[1];
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    return res.status(500).json({ error: 'JWT secret is not configured' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired session token' });
  }
}

module.exports = {
  verifyGithubSignature,
  authenticateUser
};
