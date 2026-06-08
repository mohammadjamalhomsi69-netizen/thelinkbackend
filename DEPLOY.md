# THE LINK — Complete Deployment Guide
## From zero to live website in 8 steps

---

## WHAT WE BUILT

```
thelink/
├── server/
│   ├── index.js              ← Main server entry point
│   ├── config/
│   │   ├── database.js       ← PostgreSQL connection
│   │   ├── redis.js          ← Redis session/cache
│   │   └── migrate.js        ← Database setup (run once)
│   ├── middleware/
│   │   ├── auth.js           ← JWT authentication
│   │   ├── rateLimiter.js    ← API protection
│   │   └── errorHandler.js   ← Error handling
│   ├── controllers/
│   │   ├── authController.js ← Signup, login, OTP, Google
│   │   ├── walletController.js ← Balance, convert, withdraw
│   │   └── depositController.js ← Whish + Crypto deposits
│   ├── routes/
│   │   ├── auth.js           ← POST /api/auth/*
│   │   ├── wallet.js         ← GET/POST /api/wallet/*
│   │   ├── deposits.js       ← POST /api/deposits/*
│   │   ├── poker.js          ← GET /api/poker/*
│   │   ├── blackjack.js      ← POST /api/blackjack/*
│   │   ├── trading.js        ← /api/trading/*
│   │   ├── gaming.js         ← /api/gaming/*
│   │   ├── admin.js          ← /api/admin/* (admin only)
│   │   └── webhooks.js       ← /api/webhooks/* (crypto)
│   ├── socket/
│   │   ├── poker.js          ← Real-time poker engine
│   │   └── games.js          ← Real-time chat
│   └── utils/
│       ├── pokerEngine.js    ← Full poker card logic
│       ├── email.js          ← Email notifications
│       ├── sms.js            ← SMS via Twilio
│       └── vip.js            ← VIP tier management
└── client/
    └── index.html            ← Your frontend (thelink.html)
```

---

## STEP 1 — Get Your Accounts Ready (Free)

### A. Supabase (Database + Auth)
1. Go to **supabase.com** → Create account → New project
2. Name it `thelink`, choose a region close to Lebanon (Europe West)
3. Copy your **Database URL** (Settings → Database → Connection string)
4. Copy your **Project URL** and **anon key**

### B. Upstash Redis (Cache + Sessions)
1. Go to **upstash.com** → Create account → Create database
2. Choose region: Europe (Frankfurt)
3. Copy your **REDIS_URL** (starts with `redis://`)

### C. Vercel (Hosting — Free)
1. Go to **vercel.com** → Create account with GitHub
2. Install Vercel CLI: `npm install -g vercel`

### D. Twilio (SMS — Optional but recommended)
1. Go to **twilio.com** → Create account
2. Get a phone number (~$1/month)
3. Copy Account SID and Auth Token

---

## STEP 2 — Buy Your Domain

**Recommended options:**
- `thelink.gg` — gaming/gambling focused (~$20/year)
- `thelink.io` — tech professional (~$30/year)
- `thelink.bet` — gambling focused (~$15/year)

**Buy at:** namecheap.com or cloudflare.com/registrar

---

## STEP 3 — Set Up The Project Locally

```bash
# Clone/create the project
mkdir thelink && cd thelink

# Copy all the server files into this folder
# (all files from this package)

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your real values
nano .env
```

**Fill in your .env:**
```
DATABASE_URL=postgresql://postgres:PASSWORD@db.YOURPROJECT.supabase.co:5432/postgres
REDIS_URL=redis://default:PASSWORD@YOURHOST.upstash.io:6379
JWT_SECRET=make_this_32_chars_minimum_random
WHISH_PHONE=+96170871419
WHISH_MERCHANT_CODE=THELINK-2024
BTC_WALLET=bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh
USDT_TRC20_WALLET=TCDsjoiJjyxuybEq17BW4w9bNg4o8GkJPc
USDT_BEP20_WALLET=0x3dd67882bdaf0beacb46cdecc764eb5ad5e17ef5
```

---

## STEP 4 — Set Up The Database

```bash
# Run migrations (creates all tables + seeds poker tables)
npm run migrate

# You should see:
# ✅ Database connected
# ✅ All migrations complete
# ✅ Poker tables seeded
```

**Tables created:**
- users, balances, vip_levels
- deposits, withdrawals, transactions
- poker_tables, poker_sessions, poker_hands
- blackjack_rounds, rake_history
- trading_accounts, trading_leaderboard
- gaming_accounts, challenges, mining_tasks
- admin_logs, otp_codes

---

## STEP 5 — Set Up The Frontend

```bash
# Move your frontend file
mkdir client
cp thelink.html client/index.html

# Update the API calls in index.html:
# Find: fetch('/api/auth/login'
# These are already set up to hit your server
```

**Update these in index.html to connect to real API:**

```javascript
// Add this to the top of your <script> in index.html
const API = ''; // Empty = same domain in production

async function apiCall(endpoint, method = 'GET', body = null) {
  const token = localStorage.getItem('tl_token');
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + endpoint, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Replace auth functions:
async function doRegister(username, email, password) {
  return await apiCall('/api/auth/register', 'POST', { username, email, password });
}
async function doLogin(identifier, password) {
  const data = await apiCall('/api/auth/login', 'POST', { identifier, password });
  localStorage.setItem('tl_token', data.accessToken);
  localStorage.setItem('tl_user', JSON.stringify(data.user));
  return data;
}
async function doVerifyOTP(identifier, code) {
  const data = await apiCall('/api/auth/verify-otp', 'POST', { identifier, code });
  localStorage.setItem('tl_token', data.accessToken);
  return data;
}
```

---

## STEP 6 — Make Your First Admin Account

```bash
# After running migrations, open your Supabase dashboard
# Go to: Table Editor → users
# Find your user → set is_admin = true

# OR run this SQL in Supabase SQL editor:
UPDATE users SET is_admin = true WHERE email = 'your@email.com';
```

---

## STEP 7 — Deploy to Vercel

```bash
# Login to Vercel
vercel login

# Deploy
vercel

# Set environment variables
vercel env add DATABASE_URL
vercel env add REDIS_URL
vercel env add JWT_SECRET
vercel env add WHISH_PHONE
# ... (add all from your .env)

# Deploy to production
vercel --prod
```

**Add your domain:**
```bash
vercel domains add thelink.gg
```

Then in Namecheap/your registrar:
- Add CNAME record: `@` → `cname.vercel-dns.com`

---

## STEP 8 — Connect Whish Money Business

1. Call or visit **Whish Money** in Lebanon
2. Ask for a **Merchant/Business account**
3. Tell them you need to **receive payments** via merchant code
4. They'll give you:
   - Merchant ID
   - API credentials (if available)
5. Update your `.env`:
   ```
   WHISH_MERCHANT_CODE=THELINK-2024
   WHISH_API_KEY=your_key_from_whish
   ```

**In the meantime:** Whish deposits work manually — users send to your number, you approve in the admin dashboard.

---

## API REFERENCE

### Auth
```
POST /api/auth/register     → Create account
POST /api/auth/login        → Login
POST /api/auth/verify-otp   → Verify OTP code
POST /api/auth/resend-otp   → Resend OTP
POST /api/auth/logout       → Logout
POST /api/auth/google       → Google OAuth
```

### Wallet
```
GET  /api/wallet/balance          → Get balance
GET  /api/wallet/transactions     → Transaction history
POST /api/wallet/convert-credits  → USD → Credits
POST /api/wallet/convert-chips    → USD → Chips
POST /api/wallet/withdraw         → Request withdrawal
```

### Deposits
```
GET  /api/deposits/addresses      → Get crypto addresses
POST /api/deposits/whish          → Initiate Whish deposit
POST /api/deposits/crypto         → Initiate crypto deposit
GET  /api/deposits/history        → Deposit history
GET  /api/deposits/:id/status     → Check status
```

### Poker
```
GET /api/poker/tables             → All tables
GET /api/poker/tables/:id         → Single table
GET /api/poker/history            → Hand history
WS  /poker (Socket.io)            → Real-time game
```

### Admin (Admin only)
```
GET  /api/admin/stats             → Platform stats
GET  /api/admin/deposits          → All deposits
POST /api/admin/deposits/:id/approve → Approve deposit
POST /api/admin/deposits/:id/reject  → Reject deposit
GET  /api/admin/users             → All users
POST /api/admin/users/:id/ban     → Ban/unban user
POST /api/admin/users/:id/add-credits → Add credits
GET  /api/admin/withdrawals       → All withdrawals
POST /api/admin/withdrawals/:id/process → Mark processed
GET  /api/admin/rake              → Rake breakdown
```

---

## MONTHLY RUNNING COSTS

| Service | Cost |
|---------|------|
| Domain | $1-2/month |
| Vercel (Pro) | $20/month |
| Supabase (Pro) | $25/month |
| Upstash Redis | $10/month |
| Twilio SMS | ~$5/month |
| **Total** | **~$60/month** |

---

## SECURITY CHECKLIST BEFORE LAUNCH

- [ ] Change JWT_SECRET to a random 64-char string
- [ ] Enable Supabase Row Level Security (RLS)
- [ ] Set up Cloudflare in front of your domain (free DDoS protection)
- [ ] Enable 2FA on all your service accounts
- [ ] Test all deposit flows end-to-end
- [ ] Create at least 2 admin accounts
- [ ] Back up your .env file securely
- [ ] Set up monitoring (Vercel Analytics is free)

---

## DEVELOPMENT TIMELINE

| Phase | Task | Time |
|-------|------|------|
| Week 1 | Set up all accounts, deploy, test auth | 3-5 days |
| Week 2 | Test deposits, connect Whish, test admin | 3-5 days |
| Week 3 | Test poker tables, blackjack, all features | 3-5 days |
| Week 4 | Bug fixes, soft launch to small group | 3-5 days |
| Month 2 | Public launch, marketing | Ongoing |

---

## SUPPORT & NEXT STEPS

If you need a developer to help deploy:
- **Upwork** — search "Node.js Express developer Lebanon/MENA"
- Budget: $200-500 for full setup and deployment
- Show them this guide — they'll know exactly what to do

**What's already done:**
✅ Complete frontend (thelink.html)
✅ Backend server (Node.js + Express)
✅ Real-time poker engine (Socket.io)
✅ Database schema (PostgreSQL)
✅ Auth system (JWT + OTP)
✅ Wallet system (balance, credits, chips)
✅ Deposit handling (Whish + Crypto)
✅ Admin dashboard API
✅ VIP tier system
✅ Email + SMS notifications
✅ Security middleware
✅ This deployment guide

**What you need to do:**
1. Create accounts (Supabase, Vercel, Upstash)
2. Buy domain
3. Fill in .env file
4. Run npm run migrate
5. Deploy with vercel --prod
6. Set yourself as admin
7. Contact Whish for merchant account
