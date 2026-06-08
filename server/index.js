require('dotenv').config();
require('express-async-errors');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

const db = require('./config/database');
const redis = require('./config/redis');
const { errorHandler } = require('./middleware/errorHandler');
const { rateLimiter } = require('./middleware/rateLimiter');

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const walletRoutes = require('./routes/wallet');
const depositRoutes = require('./routes/deposits');
const pokerRoutes = require('./routes/poker');
const blackjackRoutes = require('./routes/blackjack');
const tradingRoutes = require('./routes/trading');
const gamingRoutes = require('./routes/gaming');
const adminRoutes = require('./routes/admin');
const webhookRoutes = require('./routes/webhooks');

// Socket handlers
const pokerSocket = require('./socket/poker');
const gameSocket = require('./socket/games');

const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// ============ MIDDLEWARE ============
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true
}));

app.use(compression());
app.use(morgan('combined'));

// Raw body for webhooks (must be before express.json)
app.use('/api/webhooks', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use('/api/', rateLimiter);

// Serve static frontend
app.use(express.static(path.join(__dirname, '../client')));

// ============ ROUTES ============
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/poker', pokerRoutes);
app.use('/api/blackjack', blackjackRoutes);
app.use('/api/trading', tradingRoutes);
app.use('/api/gaming', gamingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/webhooks', webhookRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    platform: 'The Link',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// ============ SOCKET.IO ============
pokerSocket(io);
gameSocket(io);

// ============ ERROR HANDLER ============
app.use(errorHandler);

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await db.connect();
    console.log('✅ Database connected');

    await redis.connect();
    console.log('✅ Redis connected');

    server.listen(PORT, () => {
      console.log(`\n🚀 The Link server running on port ${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
      console.log(`💳 Whish Money: ${process.env.WHISH_PHONE}`);
      console.log(`🎰 Poker rake: ${process.env.POKER_RAKE_PERCENT}%\n`);
    });
  } catch (err) {
    console.error('❌ Server startup failed:', err);
    process.exit(1);
  }
}

startServer();

module.exports = { app, io };
