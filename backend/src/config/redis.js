require('dotenv').config();

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Parse redis URL to pass connection details to BullMQ
// For BullMQ connection option, passing url property or parsing is standard.
// We'll export connection options that can be direct passed to Queue or Worker.
const connection = {
  url: redisUrl
};

// Check if we need to parse credentials for SSL/TLS if hosted on Redis Cloud
if (redisUrl.startsWith('rediss://')) {
  // Cloud providers sometimes require strict TLS configs.
  connection.tls = {};
}

module.exports = {
  redisUrl,
  connection
};
