// GTA VI Twitch forecast (Node 22, standard library only): for each case file
// <id>.in in the input directory, forecast the concurrent Twitch viewers of
// the GTA VI category in hours 2..24 of release day, as five quantiles each,
// and write <id>.out to the output directory.
//
// The model: every case carries `comparables`, the full release-day hourly
// curves of past big game launches. A launch whose hour 1 was still before
// its own midnight unlock has a near-zero hour 1, so its ratio to hour 1
// explodes and says nothing about the day's shape; those are left out (hour 1
// below 5% of the day's peak). For the launches that remain, the day's shape
// is the median, hour by hour, of log(viewers(h) / viewers(1)), and the
// spread is the interquartile range of those log ratios. The forecast is
// hour 1's print scaled by that shape, with quantiles from the spread:
//
//   q_tau(h) = p1 * exp(median_h + z_tau * sigma_h)
//
// where p1 is hour 1's print, z_tau the standard normal quantile at each
// scored level (0.05, 0.25, 0.5, 0.75, 0.95), and sigma_h the spread above,
// floored at 0.30 log units. The shape is computed from the case file itself
// at run time, so the same program works for the practice cases and the
// final case, and two runs write the same bytes: no randomness, no network.
//
// Outside the grader's container, MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR
// stand in for /input and /output:
//   mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The quantile levels the contest scores, in the order each row lists them. */
const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
/** The standard normal's quantile at each level. */
const Z = [-1.645, -0.674, 0, 0.674, 1.645];
/** A launch counts as unlocked in hour 1 when hour 1 reaches this share of its day peak. */
const UNLOCKED_SHARE = 0.05;
/** The smallest spread allowed, in natural-log units, so no hour is overconfident. */
const SIGMA_FLOOR = 0.3;

type HourlyPoint = { from: string; viewers: number };
type Comparable = { day_start: string; hourly: HourlyPoint[]; unlock?: string };
type CaseFile = {
  levels: number[];
  known: Array<{ hour: number; viewers: number }>;
  forecast: Array<{ hour: number }>;
  comparables: Comparable[];
};

/** x rounded to 2 decimals (half up). */
const round2 = (x: number): number => Math.round(x * 100) / 100;

/** The median of numbers, the middle value or the mean of the middle two. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The release-day hourly viewers of one comparable, hours 1..24, or null when incomplete. */
function releaseDay(c: Comparable): number[] | null {
  const base = Date.parse(c.day_start);
  if (Number.isNaN(base)) return null;
  const hours: number[] = new Array(24).fill(-1);
  for (const point of c.hourly || []) {
    const t = Date.parse(point.from);
    if (Number.isNaN(t)) continue;
    const h = Math.floor((t - base) / 3600000) + 1;
    if (h >= 1 && h <= 24 && hours[h - 1] < 0) hours[h - 1] = Math.max(0, point.viewers);
  }
  if (hours.some((v) => v < 0)) return null;
  return hours;
}

/** Per hour, the median log ratio to hour 1 and the spread, over unlocked comparables. */
function shapeOf(comparables: Comparable[]): { shape: number[]; sigma: number[] } {
  const logRatios: number[][] = Array.from({ length: 24 }, () => []);
  for (const c of comparables || []) {
    // The case grades each comparable's research note with a tier. GTA VI has
    // no early access, so only Tier: comparable launches are true analogues:
    // early-access launches peaked days before release day, and weak ones are
    // free-to-play or live-service launches with a different shape. When the
    // tier is not named, the launch is kept and the hour-1 filter below still applies.
    if (c.unlock && !c.unlock.includes('Tier: comparable')) continue;
    const day = releaseDay(c);
    if (!day || day[0] <= 0) continue;
    const peak = Math.max(...day);
    if (day[0] < UNLOCKED_SHARE * peak) continue;
    for (let h = 0; h < 24; h++) {
      logRatios[h].push(Math.log(Math.max(1, day[h]) / day[0]));
    }
  }
  const shape: number[] = [];
  const sigma: number[] = [];
  for (let h = 0; h < 24; h++) {
    const vals = logRatios[h];
    if (vals.length === 0) { shape.push(0); sigma.push(SIGMA_FLOOR); continue; }
    const sorted = [...vals].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length / 4)];
    const q3 = sorted[Math.floor((3 * sorted.length) / 4)];
    shape.push(median(vals));
    sigma.push(Math.max(SIGMA_FLOOR, (q3 - q1) / 1.349));
  }
  return { shape, sigma };
}

mkdirSync(OUTPUT_DIR, { recursive: true });
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as CaseFile;
  if (c.levels.length !== LEVELS.length || c.levels.some((t, j) => t !== LEVELS[j])) {
    throw new Error(`${file} asks for levels ${JSON.stringify(c.levels)}, not ${JSON.stringify(LEVELS)}`);
  }
  const first = c.known.find((k) => k.hour === 1);
  if (first === undefined) throw new Error(`${file} has no hour-1 print`);
  const p1 = Math.max(1, first.viewers);
  const { shape, sigma } = shapeOf(c.comparables);
  const hours = c.forecast.map(({ hour }) => ({
    hour,
    q: Z.map((z, j) => {
      void j;
      const value = p1 * Math.exp(shape[hour - 1] + z * sigma[hour - 1]);
      return round2(Math.min(1e9, Math.max(0.01, value)));
    }),
  }));
  // Quantiles must be non-decreasing; the normal quantiles already are, but keep it explicit.
  for (const row of hours) {
    for (let j = 1; j < row.q.length; j++) row.q[j] = Math.max(row.q[j], row.q[j - 1]);
  }
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ hours })}\n`);
}
