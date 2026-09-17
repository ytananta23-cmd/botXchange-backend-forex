require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/authRoutes');
const brokerRoutes = require('./routes/brokerRoutes');
const botRoutes = require('./routes/botRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const marketRoutes = require('./routes/marketRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const referralRoutes = require('./routes/referralRoutes');
const cronRoutes = require('./routes/cronRoutes');
const errorHandler = require('./middleware/errorHandler');

const REQUIRED_ENV_VARS = ['DATABASE_URL', 'JWT_SECRET', 'ENCRYPTION_KEY', 'CRON_SECRET'];
const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.warn(`[server] WARNING: missing required environment variables: ${missing.join(', ')}. ` +
    'The server will start but related features will fail until these are set.');
}

const app = express();

app.use(helmet());
app.use(express.json());

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
const allowAllOrigins = allowedOrigins.length === 0 || allowedOrigins.includes('*');
app.use(cors({
  // NOTE: passing the literal string '*' inside an array to the cors package does NOT
  // work as a wildcard — it only matches an Origin header that is literally "*", which
  // never happens in practice. Passing `origin: true` is what actually allows all origins.
  origin: allowAllOrigins ? true : allowedOrigins,
  credentials: true,
}));

// Simple request log — helpful when tailing Render logs.
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.get('/', (req, res) => {
  res.json({ name: 'botXchange API', status: 'running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.use('/auth', authRoutes);
app.use('/broker', brokerRoutes);
app.use('/bots', botRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/market', marketRoutes);
app.use('/leaderboard', leaderboardRoutes);
app.use('/referral', referralRoutes);
app.use('/cron', cronRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`[server] botXchange API listening on port ${PORT}`);
});
