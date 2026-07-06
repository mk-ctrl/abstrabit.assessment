const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const rulesRoutes = require('./routes/rules');
const webhookRoutes = require('./routes/webhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// Security and middleware headers
app.use(helmet());

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like server-to-server, curl, mobile apps)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
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
