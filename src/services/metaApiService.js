/**
 * MetaApi Service — the Unified Broker Interface for botXchange.
 *
 * Two modes:
 *  - REAL MODE: used automatically when METAAPI_TOKEN is set in the environment.
 *    Talks to MetaApi.cloud (https://metaapi.cloud), which bridges to the user's
 *    actual MT4/MT5 account (demo or live) using their login/password/server.
 *    Orders placed here are REAL orders on that MT5 demo server — not fake data.
 *
 *  - SIMULATED MODE: used automatically when METAAPI_TOKEN is NOT set, so the rest
 *    of the platform (auth, bots, dashboard, cron loop) can be built, deployed and
 *    tested end-to-end before a MetaApi.cloud account is created. It mimics the same
 *    function signatures with randomized-but-plausible data.
 *
 * Every other part of the codebase should only ever call the functions exported here —
 * never talk to MetaApi's SDK directly — so swapping in cTrader later only means adding
 * a sibling service with the same function signatures.
 */

const REAL_MODE = Boolean(process.env.METAAPI_TOKEN);

let MetaApi = null;
let metaApiClient = null;
if (REAL_MODE) {
  // Lazy require so the package is only touched when actually configured.
  MetaApi = require('metaapi.cloud-sdk').default;
  metaApiClient = new MetaApi(process.env.METAAPI_TOKEN);
} else {
  console.warn('[metaApiService] METAAPI_TOKEN not set — running broker integration in SIMULATED mode. ' +
    'No real MT5 orders will be placed. Set METAAPI_TOKEN in .env to switch to real MT4/MT5 demo trading.');
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Provisions (or re-uses) a MetaApi account for the given MT4/MT5 credentials and
 * returns basic account info. Called when the user connects a broker in botXchange.
 */
async function provisionAccount({ platform, login, password, server, accountType }) {
  if (!REAL_MODE) {
    return {
      metaApiAccountId: `sim-${Date.now()}`,
      status: 'CONNECTED',
      balance: accountType === 'Demo' ? 50000 : 12500,
      equity: accountType === 'Demo' ? 50000 : 12500,
      currency: 'USD',
      leverage: '1:500',
      pingMs: Math.floor(randomBetween(14, 34)),
    };
  }

  const account = await metaApiClient.metatraderAccountApi.createAccount({
    name: `botXchange-${login}`,
    type: 'cloud',
    login,
    password,
    server,
    platform: platform === 'MT4' ? 'mt4' : 'mt5',
    magic: 123456,
  });

  await account.deploy();
  await account.waitConnected();

  const connection = account.getRPCConnection();
  await connection.connect();
  await connection.waitSynchronized();

  const info = await connection.getAccountInformation();
  await connection.close();

  return {
    metaApiAccountId: account.id,
    status: 'CONNECTED',
    balance: info.balance,
    equity: info.equity,
    currency: info.currency,
    leverage: `1:${info.leverage}`,
    pingMs: Math.floor(randomBetween(15, 45)),
  };
}

/**
 * Pings the broker connection to confirm credentials are still valid.
 */
async function testConnection(metaApiAccountId) {
  if (!REAL_MODE) {
    return { success: true, pingMs: Math.floor(randomBetween(12, 30)), message: 'Simulated connection healthy.' };
  }

  const account = await metaApiClient.metatraderAccountApi.getAccount(metaApiAccountId);
  const connection = account.getRPCConnection();
  const start = Date.now();
  await connection.connect();
  await connection.waitSynchronized();
  const pingMs = Date.now() - start;
  await connection.close();

  return { success: true, pingMs, message: `Bridge handshake verified in ${pingMs}ms.` };
}

/**
 * Fetches live balance/equity for a connected broker account.
 */
async function getAccountInfo(metaApiAccountId, fallback = {}) {
  if (!REAL_MODE) {
    const drift = randomBetween(-50, 80);
    const balance = (fallback.balance || 50000) + drift;
    return { balance, equity: balance + randomBetween(-20, 20), currency: 'USD' };
  }

  const account = await metaApiClient.metatraderAccountApi.getAccount(metaApiAccountId);
  const connection = account.getRPCConnection();
  await connection.connect();
  await connection.waitSynchronized();
  const info = await connection.getAccountInformation();
  await connection.close();

  return { balance: info.balance, equity: info.equity, currency: info.currency };
}

/**
 * Returns current open positions for a broker account.
 */
async function getOpenPositions(metaApiAccountId) {
  if (!REAL_MODE) {
    return [];
  }

  const account = await metaApiClient.metatraderAccountApi.getAccount(metaApiAccountId);
  const connection = account.getRPCConnection();
  await connection.connect();
  await connection.waitSynchronized();
  const positions = await connection.getPositions();
  await connection.close();
  return positions;
}

/**
 * Returns a current market price for a symbol. In real mode this comes from the
 * user's own broker feed via MetaApi; in simulated mode it's a randomized walk,
 * which is fine because the frontend's live charts come from TradingView directly —
 * this price is only used by the bot engine to decide whether to trade.
 */
async function getCurrentPrice(metaApiAccountId, symbol) {
  if (!REAL_MODE) {
    const basePrices = { EURUSD: 1.085, GBPUSD: 1.27, XAUUSD: 2350, GBPJPY: 191.5, USDJPY: 149.5 };
    const base = basePrices[symbol.replace(/[^A-Z]/g, '')] || 1.1;
    return base * (1 + randomBetween(-0.002, 0.002));
  }

  const account = await metaApiClient.metatraderAccountApi.getAccount(metaApiAccountId);
  const connection = account.getRPCConnection();
  await connection.connect();
  await connection.waitSynchronized();
  const price = await connection.getSymbolPrice(symbol);
  await connection.close();
  return price.bid;
}

/**
 * Places a real market order on the connected MT4/MT5 account (demo or live,
 * whichever the user connected). This is the function the bot engine calls when
 * a strategy condition is met.
 */
async function placeMarketOrder({ metaApiAccountId, symbol, direction, lotSize, stopLoss, takeProfit }) {
  if (!REAL_MODE) {
    const basePrices = { EURUSD: 1.085, GBPUSD: 1.27, XAUUSD: 2350, GBPJPY: 191.5, USDJPY: 149.5 };
    const base = basePrices[symbol.replace(/[^A-Z]/g, '')] || 1.1;
    return {
      orderId: `sim-order-${Date.now()}`,
      entryPrice: base * (1 + randomBetween(-0.001, 0.001)),
      simulated: true,
    };
  }

  const account = await metaApiClient.metatraderAccountApi.getAccount(metaApiAccountId);
  const connection = account.getRPCConnection();
  await connection.connect();
  await connection.waitSynchronized();

  const result = direction === 'BUY'
    ? await connection.createMarketBuyOrder(symbol, lotSize, stopLoss, takeProfit)
    : await connection.createMarketSellOrder(symbol, lotSize, stopLoss, takeProfit);

  await connection.close();

  return {
    orderId: result.orderId,
    entryPrice: result.price,
    simulated: false,
  };
}

/**
 * Closes an open position by its MetaApi position id.
 */
async function closePosition(metaApiAccountId, positionId) {
  if (!REAL_MODE) {
    return { success: true, simulated: true };
  }

  const account = await metaApiClient.metatraderAccountApi.getAccount(metaApiAccountId);
  const connection = account.getRPCConnection();
  await connection.connect();
  await connection.waitSynchronized();
  await connection.closePosition(positionId);
  await connection.close();

  return { success: true, simulated: false };
}

module.exports = {
  REAL_MODE,
  provisionAccount,
  testConnection,
  getAccountInfo,
  getOpenPositions,
  getCurrentPrice,
  placeMarketOrder,
  closePosition,
};
