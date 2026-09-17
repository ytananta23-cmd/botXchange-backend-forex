const express = require('express');
const requireCronSecret = require('../middleware/cronAuth');
const asyncHandler = require('../utils/asyncHandler');
const { runAllActiveBots } = require('../services/botEngine');

const router = express.Router();

// GET so cron-job.org (and browsers, for a quick manual check) can call it directly.
router.get('/run-bots', requireCronSecret, asyncHandler(async (req, res) => {
  const result = await runAllActiveBots();
  res.json({ ok: true, ...result, timestamp: new Date().toISOString() });
}));

module.exports = router;
