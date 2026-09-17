-- botXchange database schema
-- Run this once against your Postgres database (Supabase / Neon free tier both work)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar TEXT DEFAULT '',
  country VARCHAR(80) DEFAULT 'Unknown',
  plan VARCHAR(40) DEFAULT 'Free Demo',
  is_2fa_enabled BOOLEAN DEFAULT FALSE,
  global_rank INTEGER DEFAULT 0,
  preferred_language VARCHAR(10) DEFAULT 'en',
  referral_code VARCHAR(20) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS broker_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(10) NOT NULL,             -- MT4 | MT5 | cTrader
  broker_name VARCHAR(120) NOT NULL,
  server_name VARCHAR(120) NOT NULL,
  account_number VARCHAR(60) NOT NULL,
  password_encrypted TEXT,                    -- AES-256 encrypted investor/password
  account_type VARCHAR(10) NOT NULL,          -- Demo | Live
  status VARCHAR(20) DEFAULT 'CONNECTING',    -- CONNECTED | DISCONNECTED | ERROR | CONNECTING
  balance NUMERIC(18,2) DEFAULT 0,
  equity NUMERIC(18,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',
  leverage VARCHAR(20) DEFAULT '1:500',
  ping_ms INTEGER DEFAULT 0,
  last_sync TIMESTAMPTZ DEFAULT now(),
  is_read_only BOOLEAN DEFAULT TRUE,
  metaapi_account_id TEXT,                    -- MetaApi.cloud provisioned account id
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  broker_id UUID NOT NULL REFERENCES broker_connections(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  strategy VARCHAR(20) NOT NULL,               -- DCA | GRID | AI_PRESET | CUSTOM
  status VARCHAR(20) DEFAULT 'RUNNING',        -- RUNNING | PAUSED | STOPPED | ERROR
  investment_amount NUMERIC(18,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',
  total_pnl NUMERIC(18,2) DEFAULT 0,
  total_pnl_percent NUMERIC(8,2) DEFAULT 0,
  win_rate NUMERIC(5,2) DEFAULT 0,
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  losing_trades INTEGER DEFAULT 0,
  max_drawdown NUMERIC(8,2) DEFAULT 0,
  avg_profit NUMERIC(18,2) DEFAULT 0,
  profit_factor NUMERIC(8,2) DEFAULT 0,
  indicators JSONB DEFAULT '{}',
  risk_settings JSONB DEFAULT '{}',
  grid_levels INTEGER,
  dca_multiplier NUMERIC(6,2),
  ai_preset_description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_checked TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  type VARCHAR(4) NOT NULL,                    -- BUY | SELL
  entry_price NUMERIC(18,5) NOT NULL,
  exit_price NUMERIC(18,5),
  current_price NUMERIC(18,5),
  lot_size NUMERIC(10,2) NOT NULL,
  pnl NUMERIC(18,2) DEFAULT 0,
  pnl_percent NUMERIC(8,2) DEFAULT 0,
  status VARCHAR(10) DEFAULT 'OPEN',           -- OPEN | CLOSED
  open_time TIMESTAMPTZ DEFAULT now(),
  close_time TIMESTAMPTZ,
  take_profit NUMERIC(18,5),
  stop_loss NUMERIC(18,5),
  metaapi_order_id TEXT
);

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referral_code VARCHAR(20) UNIQUE NOT NULL,
  invites_sent INTEGER DEFAULT 0,
  active_referrals INTEGER DEFAULT 0,
  total_earnings NUMERIC(18,2) DEFAULT 0,
  pending_payout NUMERIC(18,2) DEFAULT 0,
  tier VARCHAR(20) DEFAULT 'Silver',
  commission_rate NUMERIC(5,2) DEFAULT 20
);

CREATE INDEX IF NOT EXISTS idx_bots_status ON bots(status);
CREATE INDEX IF NOT EXISTS idx_bots_user ON bots(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_bot ON trades(bot_id);
CREATE INDEX IF NOT EXISTS idx_broker_user ON broker_connections(user_id);
