const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { getMarketStatus } = require('../services/marketService');

const router = express.Router();

router.get('/status', asyncHandler(async (req, res) => {
  res.json(getMarketStatus());
}));

// Note: the frontend renders live/candlestick charts directly via the TradingView
// widget (no backend round-trip needed for that). These endpoints exist only as a
// fallback/for server-side strategy checks in the bot engine, not for chart rendering.
router.get('/price/:pair', asyncHandler(async (req, res) => {
  res.status(501).json({
    error: 'Live price lookups are served client-side via the TradingView widget. This endpoint is reserved for internal bot-engine use.',
  });
}));

router.get('/chart/:pair', asyncHandler(async (req, res) => {
  res.status(501).json({
    error: 'Chart data is served client-side via the TradingView widget, not this API.',
  });
}));

module.exports = router;
