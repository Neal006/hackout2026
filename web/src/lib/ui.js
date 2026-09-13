export const hhmm = (iso) => (iso ? new Date(iso).toTimeString().slice(0, 5) : '—');

// 'flash' (index.css) for things created / changed in the last few seconds, so a demo button's effect stands out
export const flash = (wallMs) => (wallMs && Date.now() - wallMs < 6000 ? 'flash' : '');

// What each fail-safe rung means, in the facilities manager's words (noonshift/api.py pick_mode)
export const MODE_COPY = {
  live: 'Live marginal-carbon signal; planning on carbon, tariff and deadlines.',
  cached: 'Live carbon signal lost; planning on the cached forecast (good for 6 h).',
  tariff: 'No carbon signal; planning on the tariff and deadlines only.',
  deadline: 'No signal and no tariff; deadlines only — every car still leaves charged.',
  full: 'Nothing to plan with; every charger holds its static share, which is what it does when we are offline.',
};
