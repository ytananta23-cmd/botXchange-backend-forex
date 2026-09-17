const express = require('express');
const db = require('../config/db');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { encrypt } = require('../utils/crypto');
const metaApiService = require('../services/metaApiService');

const router = express.Router();
router.use(requireAuth);

function toPublicBroker(row) {
  return {
    id: row.id,
    platform: row.platform,
    brokerName: row.broker_name,
    serverName: row.server_name,
    accountNumber: row.account_number,
    accountType: row.account_type,
    status: row.status,
    balance: Number(row.balance),
    equity: Number(row.equity),
    currency: row.currency,
    leverage: row.leverage,
    pingMs: row.ping_ms,
    lastSync: row.last_sync,
    isReadOnly: row.is_read_only,
  };
}

// POST /broker/connect { platform, brokerName, loginId, password, server, accountType }
router.post('/connect', asyncHandler(async (req, res) => {
  const { platform, brokerName, loginId, password, server, accountType } = req.body;

  if (!platform || !loginId || !password || !server || !accountType) {
    return res.status(400).json({ error: 'Platform, login ID, password, server and account type are all required.' });
  }
  if (!['MT4', 'MT5', 'cTrader'].includes(platform)) {
    return res.status(400).json({ error: 'Unsupported platform.' });
  }

  let provisioned;
  try {
    provisioned = await metaApiService.provisionAccount({ platform, login: loginId, password, server, accountType });
  } catch (err) {
    return res.status(422).json({
      error: 'Could not connect to that broker account. Double-check the login ID, password and server name.',
    });
  }

  const isReadOnly = accountType === 'Demo' ? true : false;
  const encryptedPassword = encrypt(password);

  const { rows } = await db.query(
    `INSERT INTO broker_connections
      (user_id, platform, broker_name, server_name, account_number, password_encrypted, account_type,
       status, balance, equity, currency, leverage, ping_ms, is_read_only, metaapi_account_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      req.userId, platform, brokerName || `${platform} Broker`, server, loginId, encryptedPassword, accountType,
      provisioned.status, provisioned.balance, provisioned.equity, provisioned.currency,
      provisioned.leverage, provisioned.pingMs, isReadOnly, provisioned.metaApiAccountId,
    ]
  );

  res.status(201).json({ success: true, broker: toPublicBroker(rows[0]) });
}));

router.get('/list', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM broker_connections WHERE user_id = $1 ORDER BY created_at DESC', [req.userId]);
  res.json(rows.map(toPublicBroker));
}));

router.post('/:id/test-connection', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM broker_connections WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  const broker = rows[0];
  if (!broker) return res.status(404).json({ error: 'Broker connection not found.' });

  try {
    const result = await metaApiService.testConnection(broker.metaapi_account_id);
    await db.query(
      `UPDATE broker_connections SET status = 'CONNECTED', ping_ms = $1, last_sync = now() WHERE id = $2`,
      [result.pingMs, broker.id]
    );
    res.json({ success: true, pingMs: result.pingMs, message: result.message });
  } catch (err) {
    await db.query(`UPDATE broker_connections SET status = 'ERROR' WHERE id = $1`, [broker.id]);
    res.status(422).json({ success: false, error: 'Connection test failed. Credentials may have changed or the server is unreachable.' });
  }
}));

router.get('/:id/balance', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM broker_connections WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  const broker = rows[0];
  if (!broker) return res.status(404).json({ error: 'Broker connection not found.' });

  const info = await metaApiService.getAccountInfo(broker.metaapi_account_id, { balance: Number(broker.balance) });
  await db.query('UPDATE broker_connections SET balance = $1, equity = $2, last_sync = now() WHERE id = $3', [info.balance, info.equity, broker.id]);

  res.json({ balance: info.balance, equity: info.equity, currency: info.currency });
}));

router.get('/:id/positions', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM broker_connections WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  const broker = rows[0];
  if (!broker) return res.status(404).json({ error: 'Broker connection not found.' });

  const positions = await metaApiService.getOpenPositions(broker.metaapi_account_id);
  res.json(positions);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'DELETE FROM broker_connections WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Broker connection not found.' });
  res.json({ success: true });
}));

module.exports = router;
