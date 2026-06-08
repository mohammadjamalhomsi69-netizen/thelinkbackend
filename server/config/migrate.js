const db = require('./database');

const migrate = async () => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    console.log('Running migrations...');

    // USERS
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(20) UNIQUE,
        password_hash VARCHAR(255),
        full_name VARCHAR(100),
        avatar_url VARCHAR(500),
        category VARCHAR(20) DEFAULT 'gambling',
        is_verified BOOLEAN DEFAULT false,
        is_banned BOOLEAN DEFAULT false,
        is_admin BOOLEAN DEFAULT false,
        kyc_status VARCHAR(20) DEFAULT 'none',
        referral_code VARCHAR(20) UNIQUE,
        referred_by UUID REFERENCES users(id),
        last_login TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // BALANCES
    await client.query(`
      CREATE TABLE IF NOT EXISTS balances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        usd_balance DECIMAL(15,2) DEFAULT 0.00,
        credits DECIMAL(15,2) DEFAULT 0.00,
        chips DECIMAL(15,2) DEFAULT 0.00,
        locked_amount DECIMAL(15,2) DEFAULT 0.00,
        total_deposited DECIMAL(15,2) DEFAULT 0.00,
        total_withdrawn DECIMAL(15,2) DEFAULT 0.00,
        total_won DECIMAL(15,2) DEFAULT 0.00,
        total_lost DECIMAL(15,2) DEFAULT 0.00,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // OTP CODES
    await client.query(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        identifier VARCHAR(255) NOT NULL,
        code VARCHAR(6) NOT NULL,
        type VARCHAR(20) NOT NULL,
        used BOOLEAN DEFAULT false,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // DEPOSITS
    await client.query(`
      CREATE TABLE IF NOT EXISTS deposits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        method VARCHAR(30) NOT NULL,
        currency VARCHAR(10) NOT NULL,
        amount_usd DECIMAL(15,2) NOT NULL,
        amount_crypto DECIMAL(20,8),
        credits_added DECIMAL(15,2),
        tx_hash VARCHAR(255),
        wallet_address VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending',
        admin_note TEXT,
        confirmed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // WITHDRAWALS
    await client.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        method VARCHAR(30) NOT NULL,
        currency VARCHAR(10) NOT NULL,
        amount_usd DECIMAL(15,2) NOT NULL,
        destination VARCHAR(255) NOT NULL,
        tx_hash VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending',
        admin_note TEXT,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // TRANSACTIONS LOG
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(30) NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        currency VARCHAR(20) NOT NULL,
        balance_before DECIMAL(15,2),
        balance_after DECIMAL(15,2),
        reference_id UUID,
        reference_type VARCHAR(30),
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // VIP LEVELS
    await client.query(`
      CREATE TABLE IF NOT EXISTS vip_levels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        gambling_tier VARCHAR(20) DEFAULT 'bronze',
        gambling_wagered DECIMAL(15,2) DEFAULT 0,
        trading_tier VARCHAR(20) DEFAULT 'bronze',
        trading_volume DECIMAL(15,2) DEFAULT 0,
        gaming_tier VARCHAR(20) DEFAULT 'bronze',
        gaming_credits_earned DECIMAL(15,2) DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // POKER TABLES
    await client.query(`
      CREATE TABLE IF NOT EXISTS poker_tables (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        table_number INT UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        game_type VARCHAR(30) DEFAULT 'texas_holdem',
        small_blind DECIMAL(10,2) NOT NULL,
        big_blind DECIMAL(10,2) NOT NULL,
        min_buyin DECIMAL(10,2) NOT NULL,
        max_buyin DECIMAL(10,2) NOT NULL,
        max_players INT DEFAULT 9,
        rake_percent DECIMAL(5,2) DEFAULT 1.00,
        vip_required VARCHAR(20) DEFAULT 'none',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // POKER SESSIONS
    await client.query(`
      CREATE TABLE IF NOT EXISTS poker_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        table_id UUID REFERENCES poker_tables(id),
        user_id UUID REFERENCES users(id),
        seat_number INT NOT NULL,
        stack DECIMAL(12,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        left_at TIMESTAMPTZ
      )
    `);

    // POKER HANDS
    await client.query(`
      CREATE TABLE IF NOT EXISTS poker_hands (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        table_id UUID REFERENCES poker_tables(id),
        hand_number BIGINT NOT NULL,
        pot_total DECIMAL(12,2) DEFAULT 0,
        rake_taken DECIMAL(12,2) DEFAULT 0,
        winner_id UUID REFERENCES users(id),
        winning_hand VARCHAR(50),
        community_cards TEXT,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        ended_at TIMESTAMPTZ
      )
    `);

    // POKER HAND PLAYERS
    await client.query(`
      CREATE TABLE IF NOT EXISTS poker_hand_players (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hand_id UUID REFERENCES poker_hands(id),
        user_id UUID REFERENCES users(id),
        seat INT NOT NULL,
        hole_cards TEXT,
        starting_stack DECIMAL(12,2),
        ending_stack DECIMAL(12,2),
        amount_won DECIMAL(12,2) DEFAULT 0,
        action_log TEXT
      )
    `);

    // BLACKJACK ROUNDS
    await client.query(`
      CREATE TABLE IF NOT EXISTS blackjack_rounds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        bet_amount DECIMAL(12,2) NOT NULL,
        player_cards TEXT,
        dealer_cards TEXT,
        player_score INT,
        dealer_score INT,
        result VARCHAR(20),
        payout DECIMAL(12,2) DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // TRADING (BBCORP)
    await client.query(`
      CREATE TABLE IF NOT EXISTS trading_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        bbcorp_account_id VARCHAR(100),
        api_key_hash VARCHAR(255),
        balance DECIMAL(15,2) DEFAULT 0,
        volume_lots DECIMAL(15,4) DEFAULT 0,
        pnl DECIMAL(15,2) DEFAULT 0,
        total_trades INT DEFAULT 0,
        last_sync TIMESTAMPTZ,
        connected_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // TRADING LEADERBOARD
    await client.query(`
      CREATE TABLE IF NOT EXISTS trading_leaderboard (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        period VARCHAR(20) NOT NULL,
        volume_lots DECIMAL(15,4) DEFAULT 0,
        pnl DECIMAL(15,2) DEFAULT 0,
        total_trades INT DEFAULT 0,
        score DECIMAL(15,2) DEFAULT 0,
        rank INT,
        prize_usd DECIMAL(12,2) DEFAULT 0,
        prize_credits DECIMAL(12,2) DEFAULT 0,
        paid_out BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // GAMING ACCOUNTS
    await client.query(`
      CREATE TABLE IF NOT EXISTS gaming_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        game VARCHAR(50) NOT NULL,
        username VARCHAR(100) NOT NULL,
        platform VARCHAR(50),
        rank VARCHAR(50),
        kda DECIMAL(6,2),
        win_rate DECIMAL(5,2),
        connection_code VARCHAR(100),
        verified BOOLEAN DEFAULT false,
        last_sync TIMESTAMPTZ,
        connected_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // GAMING CHALLENGES
    await client.query(`
      CREATE TABLE IF NOT EXISTS challenges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(200) NOT NULL,
        game VARCHAR(50) NOT NULL,
        type VARCHAR(20) DEFAULT '1v1',
        entry_credits DECIMAL(12,2) NOT NULL,
        prize_pool DECIMAL(12,2) NOT NULL,
        max_participants INT NOT NULL,
        current_participants INT DEFAULT 0,
        status VARCHAR(20) DEFAULT 'open',
        starts_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // CHALLENGE ENTRIES
    await client.query(`
      CREATE TABLE IF NOT EXISTS challenge_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        challenge_id UUID REFERENCES challenges(id),
        user_id UUID REFERENCES users(id),
        rank INT,
        prize_won DECIMAL(12,2) DEFAULT 0,
        joined_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // CREDIT MINING TASKS
    await client.query(`
      CREATE TABLE IF NOT EXISTS mining_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        task_type VARCHAR(50) NOT NULL,
        credits_earned DECIMAL(12,2) NOT NULL,
        completed_at TIMESTAMPTZ DEFAULT NOW(),
        period DATE NOT NULL
      )
    `);

    // RAKE TRACKING
    await client.query(`
      CREATE TABLE IF NOT EXISTS rake_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        table_id UUID REFERENCES poker_tables(id),
        hand_id UUID REFERENCES poker_hands(id),
        pot_amount DECIMAL(12,2) NOT NULL,
        rake_amount DECIMAL(12,2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ADMIN ACTIONS LOG
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id UUID REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        target_id UUID,
        target_type VARCHAR(50),
        details JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // SEED DEFAULT POKER TABLES
    await client.query(`
      INSERT INTO poker_tables (table_number, name, game_type, small_blind, big_blind, min_buyin, max_buyin, max_players, vip_required)
      VALUES
        (1, 'The Ace Room', 'texas_holdem', 0.10, 0.20, 5.00, 20.00, 9, 'none'),
        (2, 'The King Room', 'texas_holdem', 0.10, 0.20, 5.00, 20.00, 9, 'none'),
        (3, 'The Queen Room', 'texas_holdem', 0.10, 0.20, 5.00, 20.00, 9, 'none'),
        (4, 'The Jack Room', 'texas_holdem', 0.10, 0.20, 5.00, 20.00, 9, 'none'),
        (5, 'The Diamond Room', 'texas_holdem', 0.10, 0.20, 5.00, 20.00, 9, 'none'),
        (6, 'The Spade Room', 'texas_holdem', 0.10, 0.20, 5.00, 20.00, 9, 'none'),
        (7, 'The Heart Room', 'texas_holdem', 0.10, 0.20, 5.00, 20.00, 9, 'none'),
        (8, 'VIP Platinum', 'short_deck', 0.10, 0.20, 20.00, 100.00, 6, 'gold'),
        (9, 'VIP Diamond', 'omaha', 0.10, 0.20, 50.00, 200.00, 6, 'platinum'),
        (10, 'High Roller', 'texas_holdem', 0.10, 0.20, 200.00, 1000.00, 6, 'diamond')
      ON CONFLICT (table_number) DO NOTHING
    `);

    // INDEXES
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_poker_sessions_table ON poker_sessions(table_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_poker_hands_table ON poker_hands(table_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status)`);

    await client.query('COMMIT');
    console.log('✅ All migrations complete');
    console.log('✅ Poker tables seeded');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
    process.exit(0);
  }
};

db.connect().then(migrate).catch(console.error);
