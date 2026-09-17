const express = require('express');
const db = require('../config/db');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(requireAuth);

router.post('/generate-link', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM referrals WHERE user_id = $1', [req.userId]);
  if (rows.length === 0) return res.status(404).json({ error: 'Referral record not found for this account.' });

  const referral = rows[0];
  const link = `https://botxchange.io/join?ref=${referral.referral_code}`;
  res.json({ link, code: referral.referral_code });
}));

router.get('/stats', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM referrals WHERE user_id = $1', [req.userId]);
  if (rows.length === 0) return res.status(404).json({ error: 'Referral record not found for this account.' });

  const r = rows[0];
  res.json({
    referralCode: r.referral_code,
    referralLink: `https://botxchange.io/join?ref=${r.referral_code}`,
    invitesSent: r.invites_sent,
    activeReferrals: r.active_referrals,
    totalEarnings: Number(r.total_earnings),
    pendingPayout: Number(r.pending_payout),
    tier: r.tier,
    commissionRate: Number(r.commission_rate),
  });
}));

module.exports = router;
