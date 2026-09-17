// Protects /cron/run-bots from being triggered by random public requests.
// cron-job.org must be configured to call this endpoint with ?secret=YOUR_CRON_SECRET
// (or an X-Cron-Secret header) matching CRON_SECRET in the environment.
function requireCronSecret(req, res, next) {
  const provided = req.query.secret || req.headers['x-cron-secret'];
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    console.warn('[cron] WARNING: CRON_SECRET is not set. Refusing all cron requests until it is configured.');
    return res.status(500).json({ error: 'Server misconfiguration: CRON_SECRET is not set.' });
  }

  if (!provided || provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized cron request.' });
  }

  next();
}

module.exports = requireCronSecret;
