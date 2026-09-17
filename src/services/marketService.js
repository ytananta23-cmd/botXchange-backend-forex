/**
 * Forex/CFD market is open 24/5, not 24/7: it opens Sunday ~22:00 UTC (Sydney open)
 * and closes Friday ~22:00 UTC (New York close). This is an approximation that
 * ignores broker-specific holiday calendars, which can be layered on later.
 */
function getMarketStatus() {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const hour = now.getUTCHours();

  const isFridayAfterClose = day === 5 && hour >= 22;
  const isSaturday = day === 6;
  const isSundayBeforeOpen = day === 0 && hour < 22;

  if (isFridayAfterClose || isSaturday || isSundayBeforeOpen) {
    return {
      status: 'CLOSED_WEEKEND',
      message: 'Forex & CFD markets are closed for the weekend. Bots will resume checks automatically when trading opens.',
    };
  }

  return {
    status: 'OPEN',
    message: 'Forex & CFD Markets Active (24/5 Low Latency)',
  };
}

module.exports = { getMarketStatus };
