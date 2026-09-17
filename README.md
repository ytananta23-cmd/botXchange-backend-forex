# botXchange Backend

Backend API for botXchange — matches the frontend's API contract exactly (`/auth`, `/broker`, `/bots`, `/analytics`, `/market`, `/leaderboard`, `/referral`, `/cron`).

## What This Does

- Real user auth (JWT + bcrypt password hashing)
- Connects MT4/MT5 accounts via **MetaApi.cloud** and places **real orders on the user's MT5 demo account**
- A cron-driven bot engine (`/cron/run-bots`) that checks all running bots and trades when a strategy condition is met
- Postgres-backed storage for users, broker connections, bots, trades, and referrals
- Runs in **SIMULATED mode automatically** if `METAAPI_TOKEN` isn't set yet — so you can deploy and test the whole flow (signup → connect "broker" → create bot → cron runs → trades appear) before you have a MetaApi.cloud account.

## 1. Local Setup

```bash
npm install
cp .env.example .env
# fill in .env — see "Environment Variables" below
```

Create the database tables (run once against your Postgres instance):
```bash
psql "$DATABASE_URL" -f schema.sql
```

Start the server:
```bash
npm run dev
```

## 2. Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string — Supabase or Neon free tier both work |
| `JWT_SECRET` | Yes | Any long random string |
| `ENCRYPTION_KEY` | Yes | **Exactly 32 characters** — used to encrypt broker passwords at rest |
| `CRON_SECRET` | Yes | Long random string — cron-job.org must send this back or requests are rejected |
| `METAAPI_TOKEN` | No (for now) | Leave blank to run in SIMULATED broker mode. Get a token from https://metaapi.cloud once ready for real MT5 demo trading |
| `ALLOWED_ORIGINS` | Recommended | Comma-separated list of frontend URLs allowed to call this API |
| `PORT` | No | Defaults to 4000 |

## 3. Deploying to Render (Free Tier)

1. Push this backend to its own GitHub repo
2. On Render: New → Web Service → connect the repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add all the environment variables from the table above in Render's dashboard
6. After first deploy, run `schema.sql` against your Supabase/Neon database (via their SQL editor, or `psql` from your machine)

## 4. Wiring Up cron-job.org

Once deployed, your cron endpoint is:
```
https://<your-render-app>.onrender.com/cron/run-bots?secret=<your CRON_SECRET>
```

On cron-job.org:
- Create a new cron job
- URL: the one above
- Schedule: every 1-5 minutes
- Method: GET

This single ping both keeps the free Render instance awake and runs the bot-checking loop. Optionally add a second job on UptimeRobot hitting the same URL every 5 minutes as a redundancy backup, as discussed earlier.

## 5. Switching On Real MT5 Demo Trading

1. Create a free account at https://metaapi.cloud
2. Generate an API token
3. Set `METAAPI_TOKEN` in your environment (Render dashboard → Environment)
4. Redeploy — the backend automatically switches from SIMULATED mode to REAL mode; no code changes needed
5. Test by connecting a real MT5 **demo** account (login, investor password, server name) from the botXchange UI and using "Test Connection"

## 6. Important Notes

- **Market hours**: Forex/CFD is open 24/5, not 24/7. The bot engine automatically skips trade checks when the market is closed (weekends) — see `src/services/marketService.js`.
- **Strategy logic is an MVP placeholder** (`src/services/botEngine.js` → `shouldEnterTrade`): it proves out the full pipeline (price check → decide → place a real order → record the trade → update stats), but the actual entry conditions are simplified. Replace `shouldEnterTrade` with real RSI/MACD/CCI calculations once you're pulling historical candle data from MetaApi — nothing else in the engine needs to change.
- **Security**: broker passwords are encrypted with AES-256 before being stored (`src/utils/crypto.js`). Never log or return the encrypted value to the frontend.
- **cTrader**: the `platform` field accepts `cTrader`, but only the MT4/MT5 path via MetaApi is implemented in `metaApiService.js` right now. cTrader's OAuth2 flow can be added as a sibling function with the same signatures when needed.
