/* ==========================================================================
   Simulated solar-battery state of charge

   The towers run on a solar panel + battery bank. The backend doesn't yet
   report `energyLevelPercentage`, so until it does we synthesise a realistic
   reading from the time of day (Pakistan / Asia-Karachi):

     • Daylight  (sunrise → sunset): the panel charges the bank. SoC ramps
       UP from the daily minimum at sunrise to the daily maximum at sunset.
     • Night     (sunset → sunrise): the site runs off the bank. SoC ramps
       DOWN from the maximum at sunset back to the minimum at next sunrise.

   This produces a smooth triangle wave between BATTERY_SIM_MIN and
   BATTERY_SIM_MAX that drifts a little every few minutes — so an operator
   watching the Control page sees the value creep up through the day and
   ease down overnight. The result is always a rounded integer.

   Sunrise / sunset are kept as named constants (PKT minutes-of-day) so they
   can be nudged per season — these are representative mid-year values for
   Pakistan.
   ========================================================================== */

export const BATTERY_SIM_MIN = 42; // % at sunrise (end of the overnight drain)
export const BATTERY_SIM_MAX = 83; // % at sunset (after a full day charging)

const SUNRISE_MIN = 5 * 60 + 30;  // 05:30 PKT
const SUNSET_MIN = 19 * 60 + 15;  // 19:15 PKT
const DAY_MIN = 24 * 60;

// Minutes since local midnight in Asia/Karachi, independent of the browser's
// own timezone (so the curve is correct even if the machine clock is on UTC).
function karachiMinutesOfDay(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  let h = 0;
  let m = 0;
  for (const p of parts) {
    if (p.type === 'hour') h = parseInt(p.value, 10);
    else if (p.type === 'minute') m = parseInt(p.value, 10);
  }
  if (h === 24) h = 0; // some runtimes emit '24' for midnight
  return h * 60 + m;
}

/**
 * Simulated battery percentage (rounded integer, BATTERY_SIM_MIN..MAX) for the
 * given moment. Defaults to now. Pass a fixed Date in tests for determinism.
 */
export function getSimulatedBatteryPercent(now = new Date()) {
  const t = karachiMinutesOfDay(now);
  const span = BATTERY_SIM_MAX - BATTERY_SIM_MIN;

  if (t >= SUNRISE_MIN && t <= SUNSET_MIN) {
    // Charging through daylight.
    const frac = (t - SUNRISE_MIN) / (SUNSET_MIN - SUNRISE_MIN);
    return Math.round(BATTERY_SIM_MIN + frac * span);
  }

  // Discharging overnight — wraps across midnight.
  const nightLen = (DAY_MIN - SUNSET_MIN) + SUNRISE_MIN;
  const elapsed = t > SUNSET_MIN ? t - SUNSET_MIN : t + (DAY_MIN - SUNSET_MIN);
  const frac = elapsed / nightLen;
  return Math.round(BATTERY_SIM_MAX - frac * span);
}
