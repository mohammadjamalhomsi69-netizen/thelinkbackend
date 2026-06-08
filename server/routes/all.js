const express = require('express');
const { authenticate, requireAdmin, requireVerified } = require('../middleware/auth');
const { depositLimiter } = require('../middleware/rateLimiter');

// ============ WALLET ============
const walletRouter = express.Router();
const { getBalance, getTransactions, convertToCredits, convertToChips, requestWithdrawal } = require('../controllers/walletController');
walletRouter.get('/balance', authenticate, requireVerified, getBalance);
walletRouter.get('/transactions', authenticate, requireVerified, getTransactions);
walletRouter.post('/convert-credits', authenticate, requireVerified, convertToCredits);
walletRouter.post('/convert-chips', authenticate, requireVerified, convertToChips);
walletRouter.post('/withdraw', authenticate, requireVerified, requestWithdrawal);
module.exports.walletRouter = walletRouter;

// ============ DEPOSITS ============
const depositRouter = express.Router();
const { getAddresses, initiateWhishDeposit, initiateCryptoDeposit, getDepositHistory, getDepositStatus } = require('../controllers/depositController');
depositRouter.get('/addresses', authenticate, getAddresses);
depositRouter.post('/whish', authenticate, requireVerified, depositLimiter, initiateWhishDeposit);
depositRouter.post('/crypto', authenticate, requireVerified, depositLimiter, initiateCryptoDeposit);
depositRouter.get('/history', authenticate, getDepositHistory);
depositRouter.get('/:id/status', authenticate, getDepositStatus);
module.exports.depositRouter = depositRouter;

// ============ POKER ============
const pokerRouter = express.Router();
const db = require('../config/database');
pokerRouter.get('/tables', authenticate, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM poker_tables WHERE is_active = true ORDER BY table_number');
  res.json(rows);
});
pokerRouter.get('/tables/:id', authenticate, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM poker_tables WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Table not found' });
  res.json(rows[0]);
});
pokerRouter.get('/history', authenticate, async (req, res) => {
  const { rows } = await db.query(
    `SELECT ph.*, pt.name as table_name FROM poker_hand_players php
     JOIN poker_hands ph ON php.hand_id = ph.id
     JOIN poker_tables pt ON ph.table_id = pt.id
     WHERE php.user_id = $1 ORDER BY ph.started_at DESC LIMIT 30`,
    [req.user.id]
  );
  res.json(rows);
});
module.exports.pokerRouter = pokerRouter;

// ============ BLACKJACK ============
const bjRouter = express.Router();
bjRouter.post('/play', authenticate, requireVerified, async (req, res) => {
  const { action, bet, gameId } = req.body;
  // Blackjack is handled client-side for speed; server validates and records results
  if (action === 'start') {
    if (!bet || bet < 1) return res.status(400).json({ error: 'Invalid bet' });
    const { rows } = await db.query('SELECT chips FROM balances WHERE user_id = $1', [req.user.id]);
    if (!rows[0] || rows[0].chips < bet) return res.status(400).json({ error: 'Insufficient chips' });
    await db.query('UPDATE balances SET chips = chips - $1 WHERE user_id = $2', [bet, req.user.id]);
    const roundId = require('uuid').v4();
    res.json({ roundId, message: 'Round started', bet });
  } else if (action === 'result') {
    const { roundId, result, playerScore, dealerScore, payout, playerCards, dealerCards } = req.body;
    if (payout > 0) {
      await db.query('UPDATE balances SET chips = chips + $1, total_won = total_won + $2 WHERE user_id = $3',
        [payout, payout - bet, req.user.id]);
    }
    await db.query(
      `INSERT INTO blackjack_rounds (user_id, bet_amount, player_cards, dealer_cards, player_score, dealer_score, result, payout)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.user.id, bet, JSON.stringify(playerCards), JSON.stringify(dealerCards), playerScore, dealerScore, result, payout]
    );
    await db.query(
      `UPDATE vip_levels SET gambling_wagered = gambling_wagered + $1 WHERE user_id = $2`,
      [bet, req.user.id]
    );
    res.json({ message: 'Round recorded', payout });
  } else {
    res.status(400).json({ error: 'Invalid action' });
  }
});
bjRouter.get('/history', authenticate, async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM blackjack_rounds WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30',
    [req.user.id]
  );
  res.json(rows);
});
module.exports.bjRouter = bjRouter;

// ============ TRADING ============
const tradingRouter = express.Router();
tradingRouter.post('/connect', authenticate, requireVerified, async (req, res) => {
  const { accountId, apiKey } = req.body;
  if (!accountId || !apiKey) return res.status(400).json({ error: 'Account ID and API key required' });
  const bcrypt = require('bcryptjs');
  const keyHash = await bcrypt.hash(apiKey, 10);
  await db.query(
    `INSERT INTO trading_accounts (user_id, bbcorp_account_id, api_key_hash)
     VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET bbcorp_account_id=$2, api_key_hash=$3, connected_at=NOW()`,
    [req.user.id, accountId, keyHash]
  );
  res.json({ message: 'BBCorp account connected. Stats will sync within 6 hours.' });
});
tradingRouter.get('/stats', authenticate, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM trading_accounts WHERE user_id = $1', [req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'No trading account connected' });
  res.json(rows[0]);
});
tradingRouter.get('/leaderboard', authenticate, async (req, res) => {
  const period = new Date().toISOString().slice(0, 7);
  const { rows } = await db.query(
    `SELECT tl.*, u.username FROM trading_leaderboard tl
     JOIN users u ON tl.user_id = u.id
     WHERE tl.period = $1 ORDER BY tl.score DESC LIMIT 50`,
    [period]
  );
  res.json(rows);
});
module.exports.tradingRouter = tradingRouter;

// ============ GAMING ============
const gamingRouter = express.Router();
gamingRouter.post('/link-game', authenticate, requireVerified, async (req, res) => {
  const { game, username, platform, connectionCode } = req.body;
  if (!game || !username) return res.status(400).json({ error: 'Game and username required' });
  const { rows } = await db.query(
    `INSERT INTO gaming_accounts (user_id, game, username, platform, connection_code)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [req.user.id, game, username, platform, connectionCode]
  );
  res.json({ message: `${game} account linked. Stats will sync shortly.`, id: rows[0].id });
});
gamingRouter.get('/accounts', authenticate, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM gaming_accounts WHERE user_id = $1', [req.user.id]);
  res.json(rows);
});
gamingRouter.get('/challenges', authenticate, async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.*, COUNT(ce.id) as entries FROM challenges c
     LEFT JOIN challenge_entries ce ON c.id = ce.challenge_id
     WHERE c.status = 'open' GROUP BY c.id ORDER BY c.created_at DESC`
  );
  res.json(rows);
});
gamingRouter.post('/challenges/:id/join', authenticate, requireVerified, async (req, res) => {
  const { rows: ch } = await db.query('SELECT * FROM challenges WHERE id = $1', [req.params.id]);
  if (!ch[0]) return res.status(404).json({ error: 'Challenge not found' });
  const challenge = ch[0];
  if (challenge.status !== 'open') return res.status(400).json({ error: 'Challenge not open' });
  if (challenge.current_participants >= challenge.max_participants) return res.status(400).json({ error: 'Challenge full' });
  const { rows: bal } = await db.query('SELECT credits FROM balances WHERE user_id = $1', [req.user.id]);
  if (!bal[0] || bal[0].credits < challenge.entry_credits) return res.status(400).json({ error: 'Insufficient credits' });
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE balances SET credits = credits - $1 WHERE user_id = $2', [challenge.entry_credits, req.user.id]);
    await client.query('INSERT INTO challenge_entries (challenge_id, user_id) VALUES ($1,$2)', [challenge.id, req.user.id]);
    await client.query('UPDATE challenges SET current_participants = current_participants + 1 WHERE id = $1', [challenge.id]);
    await client.query('COMMIT');
    res.json({ message: 'Joined challenge successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});
gamingRouter.post('/mine', authenticate, requireVerified, async (req, res) => {
  const { taskType } = req.body;
  const tasks = { daily_login: 50, play_game: 150, win_challenge: 300, invite_friend: 500, enter_tournament: 200 };
  const credits = tasks[taskType];
  if (!credits) return res.status(400).json({ error: 'Invalid task' });
  const today = new Date().toISOString().slice(0, 10);
  const { rows: existing } = await db.query(
    'SELECT id FROM mining_tasks WHERE user_id = $1 AND task_type = $2 AND period = $3',
    [req.user.id, taskType, today]
  );
  if (existing[0]) return res.status(400).json({ error: 'Task already completed today' });
  await db.query('INSERT INTO mining_tasks (user_id, task_type, credits_earned, period) VALUES ($1,$2,$3,$4)',
    [req.user.id, taskType, credits, today]);
  await db.query('UPDATE balances SET credits = credits + $1 WHERE user_id = $2', [credits, req.user.id]);
  res.json({ message: `Earned ⚡${credits} credits for ${taskType}`, credits_earned: credits });
});
gamingRouter.get('/leaderboard', authenticate, async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.username, v.gaming_tier, v.gaming_credits_earned, b.credits
     FROM vip_levels v JOIN users u ON v.user_id = u.id JOIN balances b ON b.user_id = u.id
     ORDER BY v.gaming_credits_earned DESC LIMIT 50`
  );
  res.json(rows);
});
module.exports.gamingRouter = gamingRouter;

// ============ ADMIN ============
const adminRouter = express.Router();
adminRouter.use(authenticate, requireAdmin);
adminRouter.get('/stats', async (req, res) => {
  const [users, deposits, revenue, online, rake] = await Promise.all([
    db.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL \'7 days\') as new_week FROM users'),
    db.query('SELECT COALESCE(SUM(amount_usd),0) as total FROM deposits WHERE status=\'confirmed\''),
    db.query('SELECT COALESCE(SUM(amount_usd),0) as total FROM deposits WHERE status=\'confirmed\''),
    db.query('SELECT COUNT(*) as count FROM users WHERE last_login > NOW() - INTERVAL \'1 hour\''),
    db.query('SELECT COALESCE(SUM(rake_amount),0) as total FROM rake_history')
  ]);
  res.json({
    total_users: parseInt(users.rows[0].total),
    new_users_week: parseInt(users.rows[0].new_week),
    total_deposits: parseFloat(deposits.rows[0].total),
    total_revenue: parseFloat(revenue.rows[0].total),
    active_users: parseInt(online.rows[0].count),
    total_rake: parseFloat(rake.rows[0].total)
  });
});
adminRouter.get('/deposits', async (req, res) => {
  const { status } = req.query;
  let q = `SELECT d.*, u.username, u.email FROM deposits d JOIN users u ON d.user_id = u.id`;
  const params = [];
  if (status) { q += ' WHERE d.status = $1'; params.push(status); }
  q += ' ORDER BY d.created_at DESC LIMIT 100';
  const { rows } = await db.query(q, params);
  res.json(rows);
});
adminRouter.post('/deposits/:id/approve', async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows: dep } = await client.query('SELECT * FROM deposits WHERE id = $1 AND status = \'pending\'', [req.params.id]);
    if (!dep[0]) return res.status(404).json({ error: 'Deposit not found or already processed' });
    const d = dep[0];
    await client.query('UPDATE deposits SET status = \'confirmed\', confirmed_at = NOW() WHERE id = $1', [d.id]);
    await client.query('UPDATE balances SET usd_balance = usd_balance + $1, credits = credits + $2, total_deposited = total_deposited + $1 WHERE user_id = $3',
      [d.amount_usd, d.credits_added, d.user_id]);
    await client.query(`INSERT INTO transactions (user_id, type, amount, currency, reference_id, reference_type, description)
      VALUES ($1,'deposit',$2,'USD',$3,'deposit',$4)`,
      [d.user_id, d.amount_usd, d.id, `Deposit confirmed: ${d.method} $${d.amount_usd}`]);
    await client.query(`INSERT INTO admin_logs (admin_id, action, target_id, target_type, details) VALUES ($1,'approve_deposit',$2,'deposit',$3)`,
      [req.user.id, d.id, JSON.stringify({ amount: d.amount_usd, method: d.method })]);
    await client.query('COMMIT');
    res.json({ message: 'Deposit approved and balance credited' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});
adminRouter.post('/deposits/:id/reject', async (req, res) => {
  const { note } = req.body;
  await db.query('UPDATE deposits SET status = \'rejected\', admin_note = $1 WHERE id = $2', [note, req.params.id]);
  await db.query('INSERT INTO admin_logs (admin_id, action, target_id, target_type) VALUES ($1,\'reject_deposit\',$2,\'deposit\')', [req.user.id, req.params.id]);
  res.json({ message: 'Deposit rejected' });
});
adminRouter.get('/users', async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.username, u.email, u.phone, u.is_banned, u.is_verified, u.created_at, u.last_login,
            b.usd_balance, b.credits, b.chips, b.total_deposited, v.gambling_tier, v.trading_tier, v.gaming_tier
     FROM users u LEFT JOIN balances b ON b.user_id = u.id LEFT JOIN vip_levels v ON v.user_id = u.id
     ORDER BY u.created_at DESC LIMIT 100`
  );
  res.json(rows);
});
adminRouter.post('/users/:id/ban', async (req, res) => {
  await db.query('UPDATE users SET is_banned = NOT is_banned WHERE id = $1', [req.params.id]);
  await db.query('INSERT INTO admin_logs (admin_id, action, target_id, target_type) VALUES ($1,\'toggle_ban\',$2,\'user\')', [req.user.id, req.params.id]);
  res.json({ message: 'User ban toggled' });
});
adminRouter.post('/users/:id/add-credits', async (req, res) => {
  const { credits, note } = req.body;
  await db.query('UPDATE balances SET credits = credits + $1 WHERE user_id = $2', [credits, req.params.id]);
  await db.query(`INSERT INTO transactions (user_id, type, amount, currency, description) VALUES ($1,'admin_credit',$2,'credits',$3)`,
    [req.params.id, credits, note || 'Admin credit adjustment']);
  res.json({ message: `Added ${credits} credits` });
});
adminRouter.get('/withdrawals', async (req, res) => {
  const { rows } = await db.query(
    `SELECT w.*, u.username FROM withdrawals w JOIN users u ON w.user_id = u.id ORDER BY w.created_at DESC LIMIT 100`
  );
  res.json(rows);
});
adminRouter.post('/withdrawals/:id/process', async (req, res) => {
  const { txHash } = req.body;
  await db.query('UPDATE withdrawals SET status = \'processed\', tx_hash = $1, processed_at = NOW() WHERE id = $2', [txHash, req.params.id]);
  res.json({ message: 'Withdrawal marked as processed' });
});
adminRouter.get('/rake', async (req, res) => {
  const { rows } = await db.query(
    `SELECT pt.name, pt.table_number, SUM(rh.rake_amount) as total_rake, COUNT(rh.id) as hands_played
     FROM rake_history rh JOIN poker_tables pt ON rh.table_id = pt.id
     GROUP BY pt.id, pt.name, pt.table_number ORDER BY total_rake DESC`
  );
  res.json(rows);
});
module.exports.adminRouter = adminRouter;

// ============ USERS ============
const userRouter = express.Router();
userRouter.get('/me', authenticate, async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.username, u.email, u.phone, u.full_name, u.avatar_url, u.category, u.referral_code, u.created_at,
            b.usd_balance, b.credits, b.chips, b.total_deposited, b.total_won,
            v.gambling_tier, v.trading_tier, v.gaming_tier, v.gambling_wagered
     FROM users u LEFT JOIN balances b ON b.user_id = u.id LEFT JOIN vip_levels v ON v.user_id = u.id
     WHERE u.id = $1`,
    [req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});
userRouter.patch('/me', authenticate, async (req, res) => {
  const { fullName, category } = req.body;
  await db.query('UPDATE users SET full_name = COALESCE($1, full_name), category = COALESCE($2, category), updated_at = NOW() WHERE id = $3',
    [fullName, category, req.user.id]);
  res.json({ message: 'Profile updated' });
});
module.exports.userRouter = userRouter;

// ============ WEBHOOKS ============
const webhookRouter = express.Router();
const crypto = require('crypto');
webhookRouter.post('/crypto', async (req, res) => {
  const sig = req.headers['x-nowpayments-sig'];
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  const hmac = crypto.createHmac('sha512', secret).update(req.body).digest('hex');
  if (hmac !== sig) return res.status(401).json({ error: 'Invalid signature' });
  const data = JSON.parse(req.body);
  if (data.payment_status === 'confirmed' || data.payment_status === 'finished') {
    const { rows } = await db.query('SELECT * FROM deposits WHERE id = $1', [data.order_id]);
    if (rows[0] && rows[0].status === 'pending') {
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE deposits SET status = \'confirmed\', tx_hash = $1, confirmed_at = NOW() WHERE id = $2',
          [data.payment_id, rows[0].id]);
        await client.query('UPDATE balances SET usd_balance = usd_balance + $1, credits = credits + $2, total_deposited = total_deposited + $1 WHERE user_id = $3',
          [rows[0].amount_usd, rows[0].credits_added, rows[0].user_id]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    }
  }
  res.json({ status: 'ok' });
});
module.exports.webhookRouter = webhookRouter;
