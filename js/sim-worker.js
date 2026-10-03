// Runs the week simulation (js/sim.js) off the page's main thread. With the league's cards loaded it
// takes a few seconds on a phone, and on the main thread that froze taps while it ran.
import { simulateWeek } from './sim.js';

self.onmessage = e => {
  const { id, week, live, research, ents, n, field } = e.data;
  try {
    const sim = simulateWeek(week, new Map(live), research, ents, n, field);
    self.postMessage({ id, sim });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
