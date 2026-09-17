const express = require('express');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Public endpoint — no auth required, mirrors the marketing site's leaderboard preview.
router.get('/top', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id AS user_id, u.name, u.country, u.avatar,
            b.symbol, b.strategy, b.total_pnl_percent, b.win_rate, b.max_drawdown
     FROM bots b
     JOIN users u ON u.id = b.user_id
     WHERE b.total_trades > 0
     ORDER BY b.total_pnl_percent DESC
     LIMIT 50`
  );

  // NOTE: roiWeekly/roiMonthly/roiAllTime are all set to the same all-time figure for now —
  // true period-based ROI needs time-windowed trade aggregation, which isn't built yet.
  // copiersCount/badges/countryCode are placeholders until those features exist.
  const leaderboard = rows.map((row, index) => ({
    id: `${row.user_id}-${index}`,
    rank: index + 1,
    username: row.name,
    avatar: row.avatar || '',
    countryCode: '',
    countryName: row.country,
    strategyType: row.strategy,
    primaryPair: row.symbol,
    roiWeekly: Number(row.total_pnl_percent),
    roiMonthly: Number(row.total_pnl_percent),
    roiAllTime: Number(row.total_pnl_percent),
    winRate: Number(row.win_rate),
    maxDrawdown: Number(row.max_drawdown),
    copiersCount: 0,
    verifiedBroker: 'MT4/MT5',
    badges: [],
  }));

  res.json(leaderboard);
}));

module.exports = router;
