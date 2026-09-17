const express = require('express');
const db = require('../config/db');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(requireAuth);

router.get('/overview', asyncHandler(async (req, res) => {
  const bots = await db.query('SELECT * FROM bots WHERE user_id = $1', [req.userId]);
  const brokers = await db.query('SELECT balance, equity FROM broker_connections WHERE user_id = $1', [req.userId]);

  const totalBalance = brokers.rows.reduce((sum, b) => sum + Number(b.balance), 0);
  const totalEquity = brokers.rows.reduce((sum, b) => sum + Number(b.equity), 0);
  const totalPnl = bots.rows.reduce((sum, b) => sum + Number(b.total_pnl), 0);
  const activeBots = bots.rows.filter((b) => b.status === 'RUNNING').length;

  const strategyBreakdown = {};
  for (const bot of bots.rows) {
    strategyBreakdown[bot.strategy] = (strategyBreakdown[bot.strategy] || 0) + Number(bot.total_pnl);
  }

  const tradesResult = await db.query(
    `SELECT t.* FROM trades t
     JOIN bots b ON b.id = t.bot_id
     WHERE b.user_id = $1
     ORDER BY t.open_time DESC LIMIT 20`,
    [req.userId]
  );

  res.json({
    totalBalance,
    totalEquity,
    totalPnl,
    activeBots,
    totalBots: bots.rows.length,
    strategyBreakdown,
    recentTrades: tradesResult.rows,
  });
}));

router.get('/bot/:id', asyncHandler(async (req, res) => {
  const bot = await db.query('SELECT * FROM bots WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (bot.rows.length === 0) return res.status(404).json({ error: 'Bot not found.' });

  const trades = await db.query('SELECT * FROM trades WHERE bot_id = $1 ORDER BY open_time ASC', [req.params.id]);

  // Build a simple cumulative equity curve from closed trades.
  let cumulative = 0;
  const equityCurve = trades.rows
    .filter((t) => t.status === 'CLOSED')
    .map((t) => {
      cumulative += Number(t.pnl);
      return { time: t.close_time, value: cumulative };
    });

  res.json({ bot: bot.rows[0], trades: trades.rows, equityCurve });
}));

module.exports = router;
