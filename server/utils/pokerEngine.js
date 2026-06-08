// ============ POKER ENGINE ============
// Full Texas Hold'em logic: deck, dealing, hand evaluation, pot management

const SUITS = ['s', 'h', 'd', 'c']; // spades hearts diamonds clubs
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_VALUES = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };

const HAND_RANKS = {
  ROYAL_FLUSH: 9, STRAIGHT_FLUSH: 8, FOUR_OF_A_KIND: 7, FULL_HOUSE: 6,
  FLUSH: 5, STRAIGHT: 4, THREE_OF_A_KIND: 3, TWO_PAIR: 2, PAIR: 1, HIGH_CARD: 0
};

// Create and shuffle deck
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, value: RANK_VALUES[rank] });
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Card display string
function cardStr(card) {
  const suitSymbols = { s: '♠', h: '♥', d: '♦', c: '♣' };
  return `${card.rank}${suitSymbols[card.suit]}`;
}

// Evaluate 5-card hand
function evaluateHand(cards) {
  if (cards.length < 5) return { rank: -1, name: 'Invalid' };

  const values = cards.map(c => c.value).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const rankCounts = {};
  values.forEach(v => { rankCounts[v] = (rankCounts[v] || 0) + 1; });
  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  const uniqueValues = [...new Set(values)].sort((a, b) => b - a);

  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = uniqueValues.length === 5 &&
    uniqueValues[0] - uniqueValues[4] === 4;
  const isLowStraight = JSON.stringify(uniqueValues) === JSON.stringify([14, 5, 4, 3, 2]);

  if (isFlush && (isStraight || isLowStraight)) {
    if (uniqueValues[0] === 14 && uniqueValues[1] === 13) return { rank: HAND_RANKS.ROYAL_FLUSH, name: 'Royal Flush', values };
    return { rank: HAND_RANKS.STRAIGHT_FLUSH, name: 'Straight Flush', values };
  }
  if (counts[0] === 4) return { rank: HAND_RANKS.FOUR_OF_A_KIND, name: 'Four of a Kind', values };
  if (counts[0] === 3 && counts[1] === 2) return { rank: HAND_RANKS.FULL_HOUSE, name: 'Full House', values };
  if (isFlush) return { rank: HAND_RANKS.FLUSH, name: 'Flush', values };
  if (isStraight || isLowStraight) return { rank: HAND_RANKS.STRAIGHT, name: 'Straight', values };
  if (counts[0] === 3) return { rank: HAND_RANKS.THREE_OF_A_KIND, name: 'Three of a Kind', values };
  if (counts[0] === 2 && counts[1] === 2) return { rank: HAND_RANKS.TWO_PAIR, name: 'Two Pair', values };
  if (counts[0] === 2) return { rank: HAND_RANKS.PAIR, name: 'Pair', values };
  return { rank: HAND_RANKS.HIGH_CARD, name: 'High Card', values };
}

// Get best 5-card hand from 7 cards
function getBestHand(cards) {
  if (cards.length < 5) return null;
  let best = null;
  for (let i = 0; i < cards.length - 1; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const five = cards.filter((_, idx) => idx !== i && idx !== j);
      const result = evaluateHand(five);
      if (!best || result.rank > best.rank ||
         (result.rank === best.rank && compareValues(result.values, best.values) > 0)) {
        best = result;
      }
    }
  }
  return best || evaluateHand(cards.slice(0, 5));
}

function compareValues(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

// ============ POKER GAME STATE ============
class PokerGame {
  constructor(tableId, tableConfig) {
    this.tableId = tableId;
    this.tableNumber = tableConfig.table_number;
    this.name = tableConfig.name;
    this.smallBlind = parseFloat(tableConfig.small_blind);
    this.bigBlind = parseFloat(tableConfig.big_blind);
    this.minBuyin = parseFloat(tableConfig.min_buyin);
    this.maxBuyin = parseFloat(tableConfig.max_buyin);
    this.maxPlayers = tableConfig.max_players;
    this.rakePercent = parseFloat(tableConfig.rake_percent) / 100;

    this.seats = new Array(tableConfig.max_players).fill(null);
    this.deck = [];
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.currentBet = 0;
    this.dealerSeat = -1;
    this.currentSeat = -1;
    this.handNumber = 0;
    this.phase = 'waiting'; // waiting, preflop, flop, turn, river, showdown
    this.actionTimeout = null;
    this.handId = null;
    this.rakeCollected = 0;
  }

  addPlayer(userId, username, stack, seat) {
    if (seat < 0 || seat >= this.maxPlayers) return { error: 'Invalid seat' };
    if (this.seats[seat]) return { error: 'Seat taken' };
    if (stack < this.minBuyin || stack > this.maxBuyin) return { error: `Buy-in must be $${this.minBuyin}–$${this.maxBuyin}` };
    const seatedCount = this.seats.filter(Boolean).length;
    if (seatedCount >= this.maxPlayers) return { error: 'Table full' };

    this.seats[seat] = {
      userId, username, stack, seat,
      cards: [], bet: 0, totalBet: 0,
      status: 'active', isAllIn: false,
      timeouts: 0
    };

    const activePlayers = this.seats.filter(Boolean).length;
    if (activePlayers >= 2 && this.phase === 'waiting') {
      setTimeout(() => this.startHand(), 3000);
    }

    return { success: true, seat };
  }

  removePlayer(userId) {
    const seat = this.seats.findIndex(s => s?.userId === userId);
    if (seat === -1) return false;
    if (this.phase !== 'waiting') {
      this.seats[seat].status = 'sitting_out';
    } else {
      this.seats[seat] = null;
    }
    return true;
  }

  getActivePlayers() {
    return this.seats.filter(s => s && s.status === 'active');
  }

  startHand() {
    const active = this.getActivePlayers();
    if (active.length < 2) { this.phase = 'waiting'; return; }

    this.deck = createDeck();
    this.communityCards = [];
    this.pot = 0;
    this.currentBet = this.bigBlind;
    this.handNumber++;
    this.rakeCollected = 0;
    this.phase = 'preflop';

    this.seats.forEach(s => {
      if (s) { s.cards = []; s.bet = 0; s.totalBet = 0; s.isAllIn = false; if (s.status === 'sitting_out' && !this.seats[s.seat]) this.seats[s.seat] = null; }
    });

    // Advance dealer
    this.dealerSeat = this.nextActiveSeat(this.dealerSeat);
    const sbSeat = this.nextActiveSeat(this.dealerSeat);
    const bbSeat = this.nextActiveSeat(sbSeat);

    // Post blinds
    this.postBlind(sbSeat, this.smallBlind);
    this.postBlind(bbSeat, this.bigBlind);

    // Deal 2 cards to each player
    active.forEach(p => { p.cards = [this.deck.pop(), this.deck.pop()]; });

    this.currentSeat = this.nextActiveSeat(bbSeat);

    return {
      phase: 'preflop',
      dealer: this.dealerSeat,
      smallBlind: { seat: sbSeat, amount: this.smallBlind },
      bigBlind: { seat: bbSeat, amount: this.bigBlind },
      currentSeat: this.currentSeat,
      handNumber: this.handNumber
    };
  }

  postBlind(seat, amount) {
    const player = this.seats[seat];
    if (!player) return;
    const actual = Math.min(amount, player.stack);
    player.stack -= actual;
    player.bet = actual;
    player.totalBet = actual;
    this.pot += actual;
    if (player.stack === 0) player.isAllIn = true;
  }

  nextActiveSeat(from) {
    let next = (from + 1) % this.maxPlayers;
    let tries = 0;
    while ((!this.seats[next] || this.seats[next].status !== 'active') && tries < this.maxPlayers) {
      next = (next + 1) % this.maxPlayers;
      tries++;
    }
    return next;
  }

  playerAction(userId, action, amount = 0) {
    const seatIdx = this.seats.findIndex(s => s?.userId === userId);
    if (seatIdx === -1) return { error: 'Not at table' };
    if (seatIdx !== this.currentSeat) return { error: 'Not your turn' };

    const player = this.seats[seatIdx];
    let result = { action, seat: seatIdx, player: player.username };

    switch (action) {
      case 'fold':
        player.status = 'folded';
        break;

      case 'check':
        if (player.bet < this.currentBet) return { error: 'Cannot check, must call or raise' };
        break;

      case 'call': {
        const toCall = Math.min(this.currentBet - player.bet, player.stack);
        player.stack -= toCall;
        player.bet += toCall;
        player.totalBet += toCall;
        this.pot += toCall;
        if (player.stack === 0) player.isAllIn = true;
        result.amount = toCall;
        break;
      }

      case 'raise': {
        if (amount < this.currentBet * 2) return { error: `Minimum raise is $${(this.currentBet * 2).toFixed(2)}` };
        const raiseAmount = Math.min(amount - player.bet, player.stack);
        player.stack -= raiseAmount;
        player.bet += raiseAmount;
        player.totalBet += raiseAmount;
        this.pot += raiseAmount;
        this.currentBet = player.bet;
        if (player.stack === 0) player.isAllIn = true;
        result.amount = amount;
        break;
      }

      case 'allin': {
        const allInAmount = player.stack;
        player.bet += allInAmount;
        player.totalBet += allInAmount;
        this.pot += allInAmount;
        player.stack = 0;
        player.isAllIn = true;
        if (player.bet > this.currentBet) this.currentBet = player.bet;
        result.amount = allInAmount;
        break;
      }

      default:
        return { error: 'Invalid action' };
    }

    result.pot = this.pot;
    const next = this.advanceAction();
    result.nextSeat = next;
    result.phase = this.phase;

    return result;
  }

  advanceAction() {
    const active = this.seats.filter(s => s && s.status === 'active' && !s.isAllIn);
    const notFolded = this.seats.filter(s => s && s.status !== 'folded');

    if (notFolded.length === 1) {
      this.endHand();
      return null;
    }

    const allCalled = active.every(s => s.bet >= this.currentBet);

    if (allCalled || active.length === 0) {
      return this.advancePhase();
    }

    this.currentSeat = this.nextActiveSeat(this.currentSeat);
    return this.currentSeat;
  }

  advancePhase() {
    this.seats.filter(Boolean).forEach(s => { s.bet = 0; });
    this.currentBet = 0;

    const phases = { preflop: 'flop', flop: 'turn', turn: 'river', river: 'showdown' };
    this.phase = phases[this.phase] || 'showdown';

    if (this.phase === 'flop') {
      this.deck.pop(); // burn
      this.communityCards = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
    } else if (this.phase === 'turn' || this.phase === 'river') {
      this.deck.pop(); // burn
      this.communityCards.push(this.deck.pop());
    } else if (this.phase === 'showdown') {
      return this.endHand();
    }

    this.currentSeat = this.nextActiveSeat(this.dealerSeat);
    return this.currentSeat;
  }

  endHand() {
    this.phase = 'showdown';
    const notFolded = this.seats.filter(s => s && s.status !== 'folded');

    let winner = null;
    let bestHandResult = null;

    if (notFolded.length === 1) {
      winner = notFolded[0];
    } else {
      notFolded.forEach(p => {
        const allCards = [...p.cards, ...this.communityCards];
        const handResult = getBestHand(allCards);
        if (!bestHandResult || handResult.rank > bestHandResult.rank ||
           (handResult.rank === bestHandResult.rank && compareValues(handResult.values, bestHandResult.values) > 0)) {
          bestHandResult = handResult;
          winner = p;
        }
      });
    }

    // Calculate rake
    const rake = Math.round(this.pot * this.rakePercent * 100) / 100;
    const winnings = this.pot - rake;
    this.rakeCollected = rake;

    if (winner) {
      winner.stack += winnings;
    }

    const result = {
      winner: winner ? { userId: winner.userId, username: winner.username, seat: winner.seat } : null,
      pot: this.pot,
      rake,
      winnings,
      handResult: bestHandResult,
      communityCards: this.communityCards.map(cardStr),
      playerCards: notFolded.reduce((acc, p) => {
        acc[p.userId] = p.cards.map(cardStr);
        return acc;
      }, {})
    };

    // Reset for next hand
    setTimeout(() => {
      this.seats.forEach(s => {
        if (s) {
          s.status = s.stack > 0 ? 'active' : 'busted';
          s.cards = [];
          s.bet = 0;
          s.totalBet = 0;
        }
      });
      this.phase = 'waiting';
      const stillActive = this.seats.filter(s => s && s.stack > 0).length;
      if (stillActive >= 2) setTimeout(() => this.startHand(), 5000);
    }, 8000);

    return result;
  }

  getState(userId = null) {
    return {
      tableId: this.tableId,
      tableNumber: this.tableNumber,
      name: this.name,
      phase: this.phase,
      pot: this.pot,
      currentBet: this.currentBet,
      communityCards: this.communityCards.map(cardStr),
      currentSeat: this.currentSeat,
      dealerSeat: this.dealerSeat,
      seats: this.seats.map((s, i) => {
        if (!s) return null;
        return {
          seat: i,
          userId: s.userId,
          username: s.username,
          stack: s.stack,
          bet: s.bet,
          status: s.status,
          isAllIn: s.isAllIn,
          cardCount: s.cards.length,
          // Only show your own cards
          cards: userId && s.userId === userId ? s.cards.map(cardStr) : null
        };
      }),
      blinds: { small: this.smallBlind, big: this.bigBlind },
      buyinRange: { min: this.minBuyin, max: this.maxBuyin },
      rake: `${this.rakePercent * 100}%`
    };
  }
}

module.exports = { PokerGame, createDeck, evaluateHand, getBestHand, cardStr };
