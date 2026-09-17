const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { signToken } = require('../utils/jwt');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

function toPublicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatar: row.avatar,
    is2FAEnabled: row.is_2fa_enabled,
    country: row.country,
    plan: row.plan,
    createdAt: row.created_at,
    globalRank: row.global_rank,
    preferredLanguage: row.preferred_language,
    referralCode: row.referral_code,
  };
}

router.post('/signup', asyncHandler(async (req, res) => {
  const { email, name, password } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const referralCode = `BX${uuidv4().slice(0, 8).toUpperCase()}`;

  const { rows } = await db.query(
    `INSERT INTO users (name, email, password_hash, referral_code)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, email.toLowerCase().trim(), passwordHash, referralCode]
  );

  const user = rows[0];
  await db.query(
    `INSERT INTO referrals (user_id, referral_code) VALUES ($1, $2)`,
    [user.id, referralCode]
  );

  const token = signToken({ userId: user.id });
  res.status(201).json({ success: true, user: toPublicUser(user), token });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password, isDemo } = req.body;

  if (isDemo) {
    // Demo login: find or create a shared demo account so the frontend's
    // "Start Free Demo" flow works without requiring signup.
    const demoEmail = 'demo.trader@botxchange.io';
    let { rows } = await db.query('SELECT * FROM users WHERE email = $1', [demoEmail]);

    if (rows.length === 0) {
      const passwordHash = await bcrypt.hash(uuidv4(), 10);
      const referralCode = `BXDEMO${uuidv4().slice(0, 6).toUpperCase()}`;
      const inserted = await db.query(
        `INSERT INTO users (name, email, password_hash, plan, referral_code)
         VALUES ($1, $2, $3, 'Free Demo', $4) RETURNING *`,
        ['Demo Trader', demoEmail, passwordHash, referralCode]
      );
      rows = inserted.rows;
      await db.query(`INSERT INTO referrals (user_id, referral_code) VALUES ($1, $2)`, [rows[0].id, referralCode]);
    }

    const user = rows[0];
    const token = signToken({ userId: user.id });
    return res.json({ success: true, user: toPublicUser(user), token });
  }

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = signToken({ userId: user.id });
  res.json({ success: true, user: toPublicUser(user), token });
}));

router.post('/verify-otp', asyncHandler(async (req, res) => {
  const { otp } = req.body;
  // MVP stub: real deployment should verify against an OTP sent via email/SMS provider.
  if (!otp || otp.length !== 6) {
    return res.status(400).json({ verified: false, error: 'Enter the 6-digit code.' });
  }
  res.json({ verified: true });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.userId]);
  if (rows.length === 0) return res.status(404).json({ error: 'User not found.' });
  res.json(toPublicUser(rows[0]));
}));

router.post('/logout', requireAuth, (req, res) => {
  // Stateless JWT — logout is handled client-side by discarding the token.
  res.json({ success: true });
});

module.exports = router;
