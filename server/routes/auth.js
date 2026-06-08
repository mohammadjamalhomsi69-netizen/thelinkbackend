// ============ AUTH ROUTES ============
const express = require('express');
const authRouter = express.Router();
const { register, login, verifyOTP, resendOTP, refreshToken, logout, googleAuth } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

authRouter.post('/register', authLimiter, register);
authRouter.post('/login', authLimiter, login);
authRouter.post('/verify-otp', authLimiter, verifyOTP);
authRouter.post('/resend-otp', authLimiter, resendOTP);
authRouter.post('/refresh', refreshToken);
authRouter.post('/logout', authenticate, logout);
authRouter.post('/google', authLimiter, googleAuth);

module.exports = authRouter;
