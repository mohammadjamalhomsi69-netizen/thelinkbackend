const db = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

// GET /api/wallet/balance
const getBalance = async (req, res) => {
  const { rows } = await db.query(
    `SELECT b.usd_balance, b.credits, b.chips, b.total_deposited, b.total_withdrawn, b.total_won, b.total_lost,
            v.gambling_tier, v.trading_tier, v.gaming_tier
     FROM balances b
     LEFT JOIN vip_levels v ON v.user_id = b.user_id
     WHERE b.user_id = $1`,
    [req.user.id]
  );
  if (!rows[0]) throw new AppError('Balance not found', 404);
  res.json(rows[0]);
};

// GET /api/wallet/transactions
const getTransactions = async (req, res) => {
  const { page = 1, limit = 20, type } = req.query;
  const offset = (page - 1) * limit;
  let query = 'SELECT * FROM transactions WHERE user_id = $1';
  const params = [req.user.id];
  if (type) { query += ` AND type = $2`; params.push(type); }
  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(parseInt(limit), offset);
  const { rows } = await db.query(query, params);
  res.json(rows);
};

// POST /api/wallet/convert-to-credits
const convertToCredits = async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) throw new AppError('Invalid amount');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT usd_balance FROM balances WHERE user_id = $1 FOR UPDATE',
      [req.user.id]
    );
    if (!rows[0] || rows[0].usd_balance < amount) throw new AppError('Insufficient balance');

    const credits = amount * 100; // 1 USD = 100 credits
    await client.query(
      'UPDATE balances SET usd_balance = usd_balance - $1, credits = credits + $2 WHERE user_id = $3',
      [amount, credits, req.user.id]
    );
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, currency, description)
       VALUES ($1, 'convert_credits', $2, 'USD', $3)`,
      [req.user.id, amount, `Converted $${amount} to ${credits} credits`]
    );
    await client.query('COMMIT');
    res.json({ message: `Converted $${amount} to ${credits} credits`, credits_added: credits });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// POST /api/wallet/convert-to-chips
const convertToChips = async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) throw new AppError('Invalid amount');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT usd_balance FROM balances WHERE user_id = $1 FOR UPDATE',
      [req.user.id]
    );
    if (!rows[0] || rows[0].usd_balance < amount) throw new AppError('Insufficient balance');

    const chips = amount * 100;
    await client.query(
      'UPDATE balances SET usd_balance = usd_balance - $1, chips = chips + $2 WHERE user_id = $3',
      [amount, chips, req.user.id]
    );
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, currency, description)
       VALUES ($1, 'convert_chips', $2, 'USD', $3)`,
      [req.user.id, amount, `Converted $${amount} to ${chips} poker chips`]
    );
    await client.query('COMMIT');
    res.json({ message: `Converted $${amount} to ${chips} chips`, chips_added: chips });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// POST /api/wallet/withdraw
const requestWithdrawal = async (req, res) => {
  const { amount, method, destination } = req.body;
  if (!amount || amount < 10) throw new AppError('Minimum withdrawal is $10');
  if (!method) throw new AppError('Withdrawal method required');
  if (!destination) throw new AppError('Destination required');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT usd_balance FROM balances WHERE user_id = $1 FOR UPDATE',
      [req.user.id]
    );
    if (!rows[0] || rows[0].usd_balance < amount) throw new AppError('Insufficient balance');

    await client.query(
      'UPDATE balances SET usd_balance = usd_balance - $1 WHERE user_id = $2',
      [amount, req.user.id]
    );
    const { rows: wRows } = await client.query(
      `INSERT INTO withdrawals (user_id, method, currency, amount_usd, destination)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.user.id, method, method === 'crypto' ? 'USDT' : 'USD', amount, destination]
    );
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, currency, reference_id, reference_type, description)
       VALUES ($1, 'withdrawal', $2, 'USD', $3, 'withdrawal', $4)`,
      [req.user.id, amount, wRows[0].id, `Withdrawal request via ${method}`]
    );
    await client.query('COMMIT');
    res.json({ message: 'Withdrawal request submitted. Processing within 24-48h.', id: wRows[0].id });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { getBalance, getTransactions, convertToCredits, convertToChips, requestWithdrawal };
