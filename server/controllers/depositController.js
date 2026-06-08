const db = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const axios = require('axios');

// GET /api/deposits/addresses
const getAddresses = async (req, res) => {
  res.json({
    btc: process.env.BTC_WALLET,
    eth: process.env.ETH_WALLET,
    usdt_trc20: process.env.USDT_TRC20_WALLET,
    usdt_bep20: process.env.USDT_BEP20_WALLET,
    whish_phone: process.env.WHISH_PHONE,
    whish_merchant: process.env.WHISH_MERCHANT_CODE
  });
};

// POST /api/deposits/whish
const initiateWhishDeposit = async (req, res) => {
  const { amount, whish_phone } = req.body;
  if (!amount || amount < 5) throw new AppError('Minimum deposit is $5');
  if (!whish_phone) throw new AppError('Your Whish phone number is required');

  const { rows } = await db.query(
    `INSERT INTO deposits (user_id, method, currency, amount_usd, credits_added, status)
     VALUES ($1, 'whish', 'USD', $2, $3, 'pending') RETURNING id`,
    [req.user.id, amount, amount * 100]
  );

  res.json({
    message: 'Deposit initiated. Send payment via Whish Money.',
    depositId: rows[0].id,
    instructions: {
      step1: 'Open your Whish Money app',
      step2: `Go to Send Money → Merchant Code: ${process.env.WHISH_MERCHANT_CODE}`,
      step3: `Send exactly $${amount}`,
      step4: 'Your balance will update once admin confirms payment',
      merchant_phone: process.env.WHISH_PHONE,
      reference: rows[0].id
    },
    credits_to_receive: amount * 100
  });
};

// POST /api/deposits/crypto/initiate
const initiateCryptoDeposit = async (req, res) => {
  const { amount, currency, network } = req.body;
  if (!amount || amount < 10) throw new AppError('Minimum crypto deposit is $10');

  const addresses = {
    BTC: process.env.BTC_WALLET,
    ETH: process.env.ETH_WALLET,
    USDT_TRC20: process.env.USDT_TRC20_WALLET,
    USDT_BEP20: process.env.USDT_BEP20_WALLET
  };

  const key = network ? `${currency}_${network}` : currency;
  const address = addresses[key];
  if (!address) throw new AppError('Unsupported currency');

  const { rows } = await db.query(
    `INSERT INTO deposits (user_id, method, currency, amount_usd, wallet_address, credits_added, status)
     VALUES ($1, 'crypto', $2, $3, $4, $5, 'pending') RETURNING id`,
    [req.user.id, currency, amount, address, amount * 100]
  );

  res.json({
    depositId: rows[0].id,
    address,
    currency,
    network: network || 'mainnet',
    amount_usd: amount,
    credits_to_receive: amount * 100,
    confirmations_required: currency === 'BTC' ? 2 : 1,
    message: `Send exactly ${amount} USD worth of ${currency} to the address above.`
  });
};

// GET /api/deposits/history
const getDepositHistory = async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, method, currency, amount_usd, credits_added, status, tx_hash, created_at, confirmed_at
     FROM deposits WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.user.id]
  );
  res.json(rows);
};

// GET /api/deposits/:id/status
const getDepositStatus = async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, method, amount_usd, credits_added, status, created_at, confirmed_at FROM deposits WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!rows[0]) throw new AppError('Deposit not found', 404);
  res.json(rows[0]);
};

module.exports = { getAddresses, initiateWhishDeposit, initiateCryptoDeposit, getDepositHistory, getDepositStatus };
