const express = require('express');
const db = require('../config/db');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(requireAuth);

function toPublicBot(row) {
  return {
    id: row.id,
    brokerId: row.broker_id,
    name: row.name,
    symbol: row.symbol,
    strategy: row.strategy,
    status: row.status,
    investmentAmount: Number(row.investment_amount),
    currency: row.currency,
    totalPnl: Number(row.total_pnl),
    totalPnlPercent: Number(row.total_pnl_percent),
    winRate: Number(row.win_rate),
    totalTrades: row.total_trades,
    winningTrades: row.winning_trades,
    losingTrades: row.losing_trades,
    maxDrawdown: Number(row.max_drawdown),
    avgProfit: Number(row.avg_profit),
    profitFactor: Number(row.profit_factor),
    indicators: row.indicators,
    riskSettings: row.risk_settings,
    createdAt: row.created_at,
    lastChecked: row.last_checked,
    gridLevels: row.grid_levels || undefined,
    dcaMultiplier: row.dca_multiplier ? Number(row.dca_multiplier) : undefined,
    aiPresetDescription: row.ai_preset_description || undefined,
  };
}

router.post('/create', asyncHandler(async (req, res) => {
  const { brokerId, name, symbol, strategy, investmentAmount, indicators, riskSettings } = req.body;

  if (!brokerId || !name || !symbol || !strategy || !investmentAmount) {
    return res.status(400).json({ error: 'brokerId, name, symbol, strategy and investmentAmount are required.' });
  }
  if (!['DCA', 'GRID', 'AI_PRESET', 'CUSTOM'].includes(strategy)) {
    return res.status(400).json({ error: 'Invalid strategy type.' });
  }
  if (Number(investmentAmount) <= 0) {
    return res.status(400).json({ error: 'Investment amount must be greater than zero.' });
  }

  const broker = await db.query('SELECT id FROM broker_connections WHERE id = $1 AND user_id = $2', [brokerId, req.userId]);
  if (broker.rows.length === 0) {
    return res.status(404).json({ error: 'Selected broker connection was not found.' });
  }

  const { rows } = await db.query(
    `INSERT INTO bots (user_id, broker_id, name, symbol, strategy, investment_amount, indicators, risk_settings)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.userId, brokerId, name, symbol.toUpperCase(), strategy, investmentAmount,
      JSON.stringify(indicators || {}), JSON.stringify(riskSettings || {})]
  );

  res.status(201).json({ success: true, bot: toPublicBot(rows[0]) });
}));

router.get('/list', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM bots WHERE user_id = $1 ORDER BY created_at DESC', [req.userId]);
  res.json(rows.map(toPublicBot));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM bots WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (rows.length === 0) return res.status(404).json({ error: 'Bot not found.' });

  const trades = await db.query('SELECT * FROM trades WHERE bot_id = $1 ORDER BY open_time DESC LIMIT 100', [req.params.id]);
  res.json({ ...toPublicBot(rows[0]), trades: trades.rows });
}));

router.patch('/:id/pause', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `UPDATE bots SET status = 'PAUSED' WHERE id = $1 AND user_id = $2 RETURNING *`,
    [req.params.id, req.userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Bot not found.' });
  res.json({ success: true, bot: toPublicBot(rows[0]) });
}));

router.patch('/:id/resume', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `UPDATE bots SET status = 'RUNNING' WHERE id = $1 AND user_id = $2 RETURNING *`,
    [req.params.id, req.userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Bot not found.' });
  res.json({ success: true, bot: toPublicBot(rows[0]) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { rows } = await db.query('DELETE FROM bots WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.userId]);
  if (rows.length === 0) return res.status(404).json({ error: 'Bot not found.' });
  res.json({ success: true });
}));

module.exports = router;
