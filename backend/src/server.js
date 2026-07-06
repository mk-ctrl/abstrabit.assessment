const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const rulesRoutes = require('./routes/rules');
const webhookRoutes = require('./routes/webhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS must be registered BEFORE helmet so preflight OPTIONS requests 
// receive proper Access-Control headers before security headers block them.
const allowedOrigins = [];
if (process.env.FRONTEND_URL) {
  const normalized = process.env.FRONTEND_URL.replace(/\/$/, '');
  allowedOrigins.push(normalized);
}
// Local fallback urls commented out for production stability
// allowedOrigins.push('http://localhost:5173', 'http://localhost:3000');

console.log('Allowed CORS Origins:', allowedOrigins);

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

// Security headers (after CORS)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Capture raw body bytes in verification hook for HMAC checking
app.use(express.json({
  verify: (req, res, buf) => {
    // Store raw body buffer for github webhook verification
    if (req.originalUrl && req.originalUrl.includes('/webhooks/github')) {
      req.rawBody = buf;
    }
  }
}));
app.use(express.urlencoded({ extended: true }));

// Log requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes API Mounting
app.use('/api/auth', authRoutes);
app.use('/api/rules', rulesRoutes);
app.use('/api/webhooks', webhookRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Exception:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Bootstrap BullMQ background worker loop
require('./workers');

// Start Express Listener
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
