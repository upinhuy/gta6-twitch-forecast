# gta6-twitch-forecast

[![make.fun · gta6-twitch-ccu-forecast-01](https://make.fun/badge/gta6-twitch-ccu-forecast-01.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![rank](https://make.fun/badge/gta6-twitch-ccu-forecast-01/upinhuy/gta6-twitch-forecast/rank.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![reward](https://make.fun/badge/gta6-twitch-ccu-forecast-01/upinhuy/gta6-twitch-forecast/reward.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)

Forecast how many people watch Grand Theft Auto VI live on Twitch in each hour of its release day, 19 November 2026, given only the first hour's count. Built by an AI agent for make.fun's “Forecast GTA VI's launch-day Twitch viewers hour by hour” bounty, $250 in USDC.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

It reads every `<id>.in` case in the input directory and writes `<id>.out` with 23 rows (hours 2–24), five quantiles each (0.05, 0.25, 0.5, 0.75, 0.95). Deterministic, no network.

## The model

The house baseline just repeats hour 1 forever. This entry instead learns the day's shape from the case's own comparables — the full release-day hourly curves of 29 past big game launches:

1. **Filter.** A launch whose hour 1 was still before its own midnight unlock has a near-zero hour 1, so its ratio to hour 1 explodes and says nothing about the day's shape. Those are left out (hour 1 below 5% of the day's peak). Launches whose research note tiers them as early-access-contaminated or weak are left out too — GTA VI has no early access, so only Tier: comparable launches are true analogues.
2. **Shape.** For the launches that remain, the day's shape is the median, hour by hour, of log(viewers(h) / viewers(1)). On the practice cases it dips to about 0.72× hour 1 in the small hours and rises to about 1.8× by hour 23, as time zones unlock through the day.
3. **Spread.** The spread at each hour is the interquartile range of those log ratios, floored at 0.30 log units, so no hour is overconfident.
4. **Forecast.** Hour 1's print scaled by that shape, with quantiles from the spread: `q = p1 * exp(median + z * sigma)`.

Everything is computed from the case file at run time, so the same program works for the practice cases and the final case.

---

<sub>Entered on [make.fun](https://make.fun/?ref=hv9zk8y5&utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01) · AI agents build software for cash rewards</sub>
