const { PokerGame } = require('../utils/pokerEngine');
const db = require('../config/database');
const jwt = require('jsonwebtoken');

// Active poker games in memory: tableId -> PokerGame
const activeGames = new Map();

// Load all tables from DB and create game instances
async function loadTables() {
  const { rows } = await db.query('SELECT * FROM poker_tables WHERE is_active = true ORDER BY table_number');
  rows.forEach(t => {
    if (!activeGames.has(t.id)) {
      activeGames.set(t.id, new PokerGame(t.id, t));
    }
  });
  console.log(`✅ Loaded ${rows.length} poker tables`);
}

loadTables();

module.exports = (io) => {
  const pokerNS = io.of('/poker');

  pokerNS.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('No token'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const { rows } = await db.query(
        'SELECT id, username, is_banned FROM users WHERE id = $1',
        [decoded.userId]
      );
      if (!rows[0] || rows[0].is_banned) return next(new Error('Unauthorized'));
      socket.user = rows[0];
      next();
    } catch (err) {
      next(new Error('Auth failed'));
    }
  });

  pokerNS.on('connection', (socket) => {
    const userId = socket.user.id;
    const username = socket.user.username;
    console.log(`♠️ ${username} connected to poker`);

    // GET ALL TABLES
    socket.on('get_tables', async () => {
      const { rows } = await db.query('SELECT * FROM poker_tables WHERE is_active = true ORDER BY table_number');
      const tablesWithPlayers = rows.map(t => {
        const game = activeGames.get(t.id);
        return {
          ...t,
          seated_players: game ? game.seats.filter(Boolean).length : 0,
          phase: game ? game.phase : 'waiting',
          pot: game ? game.pot : 0
        };
      });
      socket.emit('tables_list', tablesWithPlayers);
    });

    // JOIN TABLE
    socket.on('join_table', async ({ tableId, seat, buyIn }) => {
      const game = activeGames.get(tableId);
      if (!game) return socket.emit('error', { message: 'Table not found' });

      // Check VIP requirement
      const { rows: tableRows } = await db.query('SELECT vip_required FROM poker_tables WHERE id = $1', [tableId]);
      if (tableRows[0]?.vip_required !== 'none') {
        const { rows: vipRows } = await db.query('SELECT gambling_tier FROM vip_levels WHERE user_id = $1', [userId]);
        const tier = vipRows[0]?.gambling_tier || 'bronze';
        const tierOrder = { bronze: 0, silver: 1, gold: 2, platinum: 3, diamond: 4 };
        if (tierOrder[tier] < tierOrder[tableRows[0].vip_required]) {
          return socket.emit('error', { message: `This table requires ${tableRows[0].vip_required} VIP tier` });
        }
      }

      // Check chips balance
      const { rows: balRows } = await db.query('SELECT chips FROM balances WHERE user_id = $1', [userId]);
      if (!balRows[0] || balRows[0].chips < buyIn) {
        return socket.emit('error', { message: 'Insufficient chips' });
      }

      // Deduct chips
      await db.query('UPDATE balances SET chips = chips - $1 WHERE user_id = $2', [buyIn, userId]);

      const result = game.addPlayer(userId, username, buyIn, seat);
      if (result.error) {
        await db.query('UPDATE balances SET chips = chips + $1 WHERE user_id = $2', [buyIn, userId]);
        return socket.emit('error', { message: result.error });
      }

      socket.join(`table:${tableId}`);
      socket.tableId = tableId;
      socket.buyIn = buyIn;

      await db.query(
        `INSERT INTO poker_sessions (table_id, user_id, seat_number, stack) VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [tableId, userId, seat, buyIn]
      );

      socket.emit('joined_table', { seat, stack: buyIn });
      pokerNS.to(`table:${tableId}`).emit('table_state', game.getState(userId));
      pokerNS.to(`table:${tableId}`).emit('chat', { user: 'Dealer 🤖', message: `${username} joined the table`, type: 'system' });
    });

    // PLAYER ACTION
    socket.on('action', ({ action, amount }) => {
      const { tableId } = socket;
      if (!tableId) return socket.emit('error', { message: 'Not at a table' });

      const game = activeGames.get(tableId);
      if (!game) return socket.emit('error', { message: 'Game not found' });

      const result = game.playerAction(userId, action, amount);
      if (result.error) return socket.emit('error', { message: result.error });

      pokerNS.to(`table:${tableId}`).emit('action_result', { ...result, tableState: game.getState() });

      if (result.winner) {
        handleHandEnd(tableId, result, pokerNS);
      }
    });

    // LEAVE TABLE
    socket.on('leave_table', async () => {
      const { tableId } = socket;
      if (!tableId) return;
      const game = activeGames.get(tableId);
      if (game) {
        const seat = game.seats.findIndex(s => s?.userId === userId);
        if (seat !== -1) {
          const stack = game.seats[seat]?.stack || 0;
          game.removePlayer(userId);
          // Return remaining chips
          if (stack > 0) {
            await db.query('UPDATE balances SET chips = chips + $1 WHERE user_id = $2', [stack, userId]);
          }
          await db.query(
            'UPDATE poker_sessions SET status = $1, left_at = NOW() WHERE table_id = $2 AND user_id = $3 AND status = $4',
            ['left', tableId, userId, 'active']
          );
        }
      }
      socket.leave(`table:${tableId}`);
      socket.tableId = null;
      pokerNS.to(`table:${tableId}`).emit('player_left', { username });
      pokerNS.to(`table:${tableId}`).emit('table_state', game?.getState() || {});
    });

    // CHAT
    socket.on('chat', ({ message }) => {
      const { tableId } = socket;
      if (!tableId || !message?.trim()) return;
      const msg = message.trim().substring(0, 150);
      pokerNS.to(`table:${tableId}`).emit('chat', { user: username, message: msg, type: 'player' });
    });

    // DISCONNECT
    socket.on('disconnect', async () => {
      const { tableId } = socket;
      if (tableId) {
        const game = activeGames.get(tableId);
        if (game) {
          const seat = game.seats.findIndex(s => s?.userId === userId);
          if (seat !== -1 && game.seats[seat]) {
            const stack = game.seats[seat].stack || 0;
            game.removePlayer(userId);
            if (stack > 0) {
              await db.query('UPDATE balances SET chips = chips + $1 WHERE user_id = $2', [stack, userId]);
            }
          }
        }
        pokerNS.to(`table:${tableId}`).emit('player_left', { username });
      }
      console.log(`♠️ ${username} disconnected from poker`);
    });
  });
};

async function handleHandEnd(tableId, result, pokerNS) {
  if (!result.winner) return;
  const { winner, rake, winnings, handResult } = result;

  // Credit rake to platform (tracked internally)
  await db.query(
    `INSERT INTO rake_history (table_id, pot_amount, rake_amount)
     VALUES ($1, $2, $3)`,
    [tableId, result.pot, rake]
  );

  // Add winnings to winner's chips
  await db.query(
    'UPDATE balances SET chips = chips + $1, total_won = total_won + $1 WHERE user_id = $2',
    [winnings, winner.userId]
  );

  // Log transaction
  await db.query(
    `INSERT INTO transactions (user_id, type, amount, currency, description)
     VALUES ($1, 'poker_win', $2, 'chips', $3)`,
    [winner.userId, winnings, `Won poker hand: ${handResult?.name || 'Best hand'}`]
  );

  // Update VIP wagering stats
  await db.query(
    `UPDATE vip_levels SET gambling_wagered = gambling_wagered + $1 WHERE user_id = $2`,
    [result.pot, winner.userId]
  );

  pokerNS.to(`table:${tableId}`).emit('hand_ended', {
    winner: { username: winner.username, seat: winner.seat },
    pot: result.pot,
    rake,
    winnings,
    handName: handResult?.name || 'Best Hand',
    playerCards: result.playerCards,
    communityCards: result.communityCards
  });
}
