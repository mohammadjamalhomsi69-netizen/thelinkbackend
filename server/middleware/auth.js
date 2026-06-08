const jwt = require('jsonwebtoken');
const db = require('../config/database');
const redis = require('../config/redis');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    // Check if token is blacklisted
    const blacklisted = await redis.get(`blacklist:${token}`);
    if (blacklisted) {
      return res.status(401).json({ error: 'Token revoked' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { rows } = await db.query(
      'SELECT id, username, email, phone, is_admin, is_banned, is_verified, category FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (!rows[0]) return res.status(401).json({ error: 'User not found' });
    if (rows[0].is_banned) return res.status(403).json({ error: 'Account banned' });

    req.user = rows[0];
    req.token = token;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired' });
    if (err.name === 'JsonWebTokenError') return res.status(401).json({ error: 'Invalid token' });
    next(err);
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
};

const requireVerified = (req, res, next) => {
  if (!req.user?.is_verified) return res.status(403).json({ error: 'Please verify your account' });
  next();
};

module.exports = { authenticate, requireAdmin, requireVerified };
