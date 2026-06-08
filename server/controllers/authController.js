const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const redis = require('../config/redis');
const { AppError } = require('../middleware/errorHandler');
const emailService = require('../utils/email');
const smsService = require('../utils/sms');

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();
const generateReferralCode = () => Math.random().toString(36).substring(2, 10).toUpperCase();

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
  });
  return { accessToken, refreshToken };
};

// POST /api/auth/register
const register = async (req, res) => {
  const { username, email, phone, password, fullName, category, referralCode } = req.body;

  if (!username) throw new AppError('Username is required');
  if (!email && !phone) throw new AppError('Email or phone is required');
  if (!password) throw new AppError('Password is required');
  if (password.length < 8) throw new AppError('Password must be at least 8 characters');

  const hashedPassword = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
  const myReferralCode = generateReferralCode();

  let referrerId = null;
  if (referralCode) {
    const { rows } = await db.query('SELECT id FROM users WHERE referral_code = $1', [referralCode]);
    if (rows[0]) referrerId = rows[0].id;
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO users (username, email, phone, password_hash, full_name, category, referral_code, referred_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, username, email, phone`,
      [username.toLowerCase(), email?.toLowerCase(), phone, hashedPassword, fullName, category || 'gambling', myReferralCode, referrerId]
    );

    const user = rows[0];

    await client.query(
      'INSERT INTO balances (user_id) VALUES ($1)',
      [user.id]
    );

    await client.query(
      'INSERT INTO vip_levels (user_id) VALUES ($1)',
      [user.id]
    );

    // If referred, give referrer bonus
    if (referrerId) {
      await client.query(
        'UPDATE balances SET credits = credits + 500 WHERE user_id = $1',
        [referrerId]
      );
    }

    await client.query('COMMIT');

    // Send OTP
    const otp = generateOTP();
    const identifier = email || phone;
    const otpKey = `otp:${identifier}`;
    await redis.setEx(otpKey, 600, { code: otp, userId: user.id, type: 'verify' });

    if (email) {
      await emailService.sendOTP(email, otp, username);
    } else if (phone) {
      await smsService.sendOTP(phone, otp);
    }

    res.status(201).json({
      message: 'Account created. Check your email/phone for verification code.',
      userId: user.id,
      identifier: email || phone
    });

  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') throw new AppError('Username or email already taken', 409);
    throw err;
  } finally {
    client.release();
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) throw new AppError('Email/phone and password required');

  const { rows } = await db.query(
    `SELECT id, username, email, phone, password_hash, is_verified, is_banned, is_admin, category
     FROM users WHERE email = $1 OR phone = $1 OR username = $1`,
    [identifier.toLowerCase()]
  );

  const user = rows[0];
  if (!user) throw new AppError('Invalid credentials', 401);
  if (user.is_banned) throw new AppError('Account suspended. Contact support.', 403);

  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) throw new AppError('Invalid credentials', 401);

  if (!user.is_verified) {
    const otp = generateOTP();
    const identifier2 = user.email || user.phone;
    await redis.setEx(`otp:${identifier2}`, 600, { code: otp, userId: user.id, type: 'verify' });
    if (user.email) await emailService.sendOTP(user.email, otp, user.username);
    else if (user.phone) await smsService.sendOTP(user.phone, otp);

    return res.status(403).json({
      error: 'Account not verified',
      needsVerification: true,
      identifier: user.email || user.phone
    });
  }

  await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  const { accessToken, refreshToken } = generateTokens(user.id);
  await redis.setEx(`refresh:${user.id}`, 30 * 24 * 60 * 60, refreshToken);

  const { rows: balRows } = await db.query(
    'SELECT usd_balance, credits, chips FROM balances WHERE user_id = $1',
    [user.id]
  );

  res.json({
    message: 'Login successful',
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      isAdmin: user.is_admin,
      category: user.category
    },
    balance: balRows[0] || { usd_balance: 0, credits: 0, chips: 0 }
  });
};

// POST /api/auth/verify-otp
const verifyOTP = async (req, res) => {
  const { identifier, code } = req.body;
  if (!identifier || !code) throw new AppError('Identifier and code required');

  const otpData = await redis.get(`otp:${identifier}`);
  if (!otpData) throw new AppError('OTP expired or not found. Request a new one.', 400);
  if (otpData.code !== code) throw new AppError('Invalid code', 400);

  await db.query('UPDATE users SET is_verified = true WHERE id = $1', [otpData.userId]);
  await redis.del(`otp:${identifier}`);

  const { rows } = await db.query(
    'SELECT id, username, email, phone, is_admin, category FROM users WHERE id = $1',
    [otpData.userId]
  );

  const { accessToken, refreshToken } = generateTokens(otpData.userId);
  await redis.setEx(`refresh:${otpData.userId}`, 30 * 24 * 60 * 60, refreshToken);

  const { rows: balRows } = await db.query(
    'SELECT usd_balance, credits, chips FROM balances WHERE user_id = $1',
    [otpData.userId]
  );

  res.json({
    message: 'Account verified successfully',
    accessToken,
    refreshToken,
    user: rows[0],
    balance: balRows[0] || { usd_balance: 0, credits: 0, chips: 0 }
  });
};

// POST /api/auth/resend-otp
const resendOTP = async (req, res) => {
  const { identifier } = req.body;
  if (!identifier) throw new AppError('Identifier required');

  const { rows } = await db.query(
    'SELECT id, username, email, phone FROM users WHERE email = $1 OR phone = $1',
    [identifier]
  );
  if (!rows[0]) throw new AppError('User not found', 404);

  const otp = generateOTP();
  await redis.setEx(`otp:${identifier}`, 600, { code: otp, userId: rows[0].id, type: 'verify' });

  if (rows[0].email === identifier) await emailService.sendOTP(identifier, otp, rows[0].username);
  else await smsService.sendOTP(identifier, otp);

  res.json({ message: 'New code sent' });
};

// POST /api/auth/refresh
const refreshToken = async (req, res) => {
  const { refreshToken: token } = req.body;
  if (!token) throw new AppError('Refresh token required');

  const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  const stored = await redis.get(`refresh:${decoded.userId}`);
  if (!stored || stored !== token) throw new AppError('Invalid refresh token', 401);

  const { accessToken, refreshToken: newRefresh } = generateTokens(decoded.userId);
  await redis.setEx(`refresh:${decoded.userId}`, 30 * 24 * 60 * 60, newRefresh);

  res.json({ accessToken, refreshToken: newRefresh });
};

// POST /api/auth/logout
const logout = async (req, res) => {
  await redis.del(`refresh:${req.user.id}`);
  await redis.setEx(`blacklist:${req.token}`, 7 * 24 * 60 * 60, true);
  res.json({ message: 'Logged out' });
};

// POST /api/auth/google
const googleAuth = async (req, res) => {
  const { googleId, email, name, picture } = req.body;
  if (!email) throw new AppError('Email required');

  let { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);

  if (!rows[0]) {
    const username = email.split('@')[0].toLowerCase() + Math.floor(Math.random() * 1000);
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const res2 = await client.query(
        `INSERT INTO users (username, email, full_name, avatar_url, is_verified, referral_code)
         VALUES ($1, $2, $3, $4, true, $5) RETURNING *`,
        [username, email.toLowerCase(), name, picture, generateReferralCode()]
      );
      rows = res2.rows;
      await client.query('INSERT INTO balances (user_id) VALUES ($1)', [rows[0].id]);
      await client.query('INSERT INTO vip_levels (user_id) VALUES ($1)', [rows[0].id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  const user = rows[0];
  if (user.is_banned) throw new AppError('Account suspended', 403);

  await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
  const { accessToken, refreshToken } = generateTokens(user.id);
  await redis.setEx(`refresh:${user.id}`, 30 * 24 * 60 * 60, refreshToken);

  const { rows: balRows } = await db.query('SELECT usd_balance, credits, chips FROM balances WHERE user_id = $1', [user.id]);

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, username: user.username, email: user.email, isAdmin: user.is_admin },
    balance: balRows[0]
  });
};

module.exports = { register, login, verifyOTP, resendOTP, refreshToken, logout, googleAuth };
