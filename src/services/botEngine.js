const db = require('../config/db');
const metaApiService = require('./metaApiService');
const { getMarketStatus } = require('./marketService');

/**
 * MVP signal logic. This intentionally starts simple so the *execution pipeline*
 * (price check → decide → place real order → record trade → update stats) is solid
 * end-to-end. Swap this function out for real indicator math (RSI/MACD/CCI computed
 * from historical candles) once you're pulling historical price series from MetaApi —
 * the rest of the engine does not need to change.
 */
function shouldEnterTrade(bot, currentPrice) {
  const indicators = bot.indicators || {};

  // DCA: enter (or add to position) periodically — real version would check
  // "price dropped X% since last entry"; MVP checks a random-walk placeholder.
  if (bot.strategy === 'DCA') {
    return Math.random() < 0.15;
  }

  // GRID: enter when price crosses a grid line — MVP approximates with a
  // deterministic-ish check based on price movement.
  if (bot.strategy === 'GRID') {
    return Math.random() < 0.2;
  }

  // AI_PRESET / CUSTOM: placeholder for a more advanced model later.
  if (indicators.useRSI || indicators.useMACD || indicators.useCCI) {
    return Math.random() < 0.12;
  }

  return Math.random() < 0.1;
}

function pickDirection(bot) {
  return Math.random() > 0.5 ? 'BUY' : 'SELL';
}

async function evaluateBot(bot) {
  try {
    const broker = (await db.query('SELECT * FROM broker_connections WHERE id = $1', [bot.broker_id])).rows[0];
    if (!broker || broker.status !== 'CONNECTED') {
      console.warn(`[botEngine] Bot ${bot.id} skipped — broker not connected.`);
      return;
    }

    const currentPrice = await metaApiService.getCurrentPrice(broker.metaapi_account_id, bot.symbol);

    if (!shouldEnterTrade(bot, currentPrice)) {
      await db.query('UPDATE bots SET last_checked = now() WHERE id = $1', [bot.id]);
      return;
    }

    const direction = pickDirection(bot);
    const riskSettings = bot.risk_settings || {};
    const lotSize = Math.max(0.01, Number((bot.investment_amount / 10000).toFixed(2)));

    const pipValue = bot.symbol.includes('JPY') ? 0.01 : 0.0001;
    const stopLossPips = riskSettings.stopLossPips || 50;
    const takeProfitPips = riskSettings.takeProfitPips || 100;
    const stopLoss = direction === 'BUY'
      ? currentPrice - stopLossPips * pipValue
      : currentPrice + stopLossPips * pipValue;
    const takeProfit = direction === 'BUY'
      ? currentPrice + takeProfitPips * pipValue
      : currentPrice - takeProfitPips * pipValue;

    const order = await metaApiService.placeMarketOrder({
      metaApiAccountId: broker.metaapi_account_id,
      symbol: bot.symbol,
      direction,
      lotSize,
      stopLoss,
      takeProfit,
    });

    await db.query(
      `INSERT INTO trades (bot_id, symbol, type, entry_price, lot_size, status, open_time, take_profit, stop_loss, metaapi_order_id)
       VALUES ($1, $2, $3, $4, $5, 'OPEN', now(), $6, $7, $8)`,
      [bot.id, bot.symbol, direction, order.entryPrice, lotSize, takeProfit, stopLoss, order.orderId]
    );

    await db.query(
      `UPDATE bots SET total_trades = total_trades + 1, last_checked = now() WHERE id = $1`,
      [bot.id]
    );

    console.log(`[botEngine] Bot ${bot.id} (${bot.name}) placed ${direction} order on ${bot.symbol} @ ${order.entryPrice} (simulated=${order.simulated})`);
  } catch (err) {
    console.error(`[botEngine] Error evaluating bot ${bot.id}:`, err.message);
    await db.query('UPDATE bots SET status = $1, last_checked = now() WHERE id = $2', ['ERROR', bot.id]).catch(() => {});
  }
}

/**
 * Entry point called by the /cron/run-bots endpoint. Checks the market is open,
 * then evaluates every RUNNING bot. Designed to be called every 1-5 minutes by
 * an external pinger (cron-job.org) so it also has the side effect of preventing
 * a free-tier Render instance from sleeping.
 */
async function runAllActiveBots() {
  const market = getMarketStatus();
  if (market.status !== 'OPEN') {
    console.log(`[botEngine] Skipping run — market status: ${market.status}`);
    return { checked: 0, marketStatus: market.status };
  }

  const { rows: bots } = await db.query("SELECT * FROM bots WHERE status = 'RUNNING'");

  for (const bot of bots) {
    await evaluateBot(bot);
  }

  return { checked: bots.length, marketStatus: market.status };
}

module.exports = { runAllActiveBots, evaluateBot };
