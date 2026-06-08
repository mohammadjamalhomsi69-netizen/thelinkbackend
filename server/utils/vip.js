const db = require('../config/database');

const GAMBLING_TIERS = [
  { name: 'diamond', min: 200000 },
  { name: 'platinum', min: 50000 },
  { name: 'gold', min: 10000 },
  { name: 'silver', min: 1000 },
  { name: 'bronze', min: 0 }
];

const TRADING_TIERS = [
  { name: 'diamond', min: 500 },
  { name: 'platinum', min: 250 },
  { name: 'gold', min: 100 },
  { name: 'silver', min: 25 },
  { name: 'bronze', min: 0 }
];

const GAMING_TIERS = [
  { name: 'diamond', min: 100000 },
  { name: 'platinum', min: 25000 },
  { name: 'gold', min: 5000 },
  { name: 'silver', min: 500 },
  { name: 'bronze', min: 0 }
];

function getTier(amount, tiers) {
  for (const t of tiers) {
    if (amount >= t.min) return t.name;
  }
  return 'bronze';
}

async function updateUserVIP(userId) {
  const { rows } = await db.query(
    'SELECT * FROM vip_levels WHERE user_id = $1', [userId]
  );
  if (!rows[0]) return;
  const v = rows[0];
  const gamblingTier = getTier(v.gambling_wagered, GAMBLING_TIERS);
  const tradingTier = getTier(v.trading_volume, TRADING_TIERS);
  const gamingTier = getTier(v.gaming_credits_earned, GAMING_TIERS);
  await db.query(
    `UPDATE vip_levels SET gambling_tier=$1, trading_tier=$2, gaming_tier=$3, updated_at=NOW()
     WHERE user_id=$4`,
    [gamblingTier, tradingTier, gamingTier, userId]
  );
  return { gamblingTier, tradingTier, gamingTier };
}

// Run every hour
async function runVIPUpdate() {
  try {
    const { rows } = await db.query('SELECT user_id FROM vip_levels');
    for (const r of rows) {
      await updateUserVIP(r.user_id);
    }
    console.log(`✅ VIP levels updated for ${rows.length} users`);
  } catch (err) {
    console.error('VIP update error:', err);
  }
}

module.exports = { updateUserVIP, runVIPUpdate, getTier };
