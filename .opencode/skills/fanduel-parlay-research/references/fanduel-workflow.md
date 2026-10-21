# FanDuel Workflow Reference

This reference records the concrete FanDuel research path that worked, plus the
parts that must be re-checked every run. It is not a live odds feed. Prices,
event IDs, market labels, and page layouts change.

## 1. Slate and start times

Use ESPN's public scoreboard endpoint first. It is fast, stable, and gives
status and start time without a browser.

```text
NHL: https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=YYYYMMDD
NBA: https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD
```

Read each event's `name`, `status.type.state`, `status.type.detail`, and
`date` (UTC). Convert to the user's time zone. Drop games that are already
`in` or `post`, and be cautious with a game starting in under about 60–90
minutes unless lineups and goalies are already confirmed.

On 2026-10-20 the NHL slate included, among others:

```text
CAR @ VAN  10:10 PM ET
DET @ SEA   9:40 PM ET
MIN @ EDM   9:00 PM ET
TB  @ VGK  10:30 PM ET
```

Those times are historical examples, not a schedule.

## 2. Find the FanDuel event page

FanDuel's hockey navigation pages:

```text
https://sportsbook.fanduel.com/navigation/nhl
https://sportsbook.fanduel.com/hockey/nhl
```

The event URL pattern observed in the working run was:

```text
https://sportsbook.fanduel.com/hockey/nhl/<away-slug>-@-<home-slug>-<eventId>
```

Example from that run:

```text
https://sportsbook.fanduel.com/hockey/nhl/carolina-hurricanes-@-vancouver-canucks-36214455
```

Do not guess an event ID. If a link 404s or redirects, return to the navigation
page and collect the current link. A robust browser-side collection is:

```js
[...document.querySelectorAll('a[href*="/hockey/nhl/"]')]
  .map((a) => ({ href: a.href, text: a.innerText.trim() }))
  .filter((item) => item.href.includes("@") && item.text)
```

For NBA, substitute the NBA path and check the team slugs. Prefer the actual
link over a hand-built slug.

## 3. Read the game line

The event header shows the main markets: moneyline, spread/puck line, and total.
Read the page text first; FanDuel's class names are generated and brittle.

```js
document.body.innerText
```

Use the accessibility snapshot when available, then click the specific market
or team price. Record:

- market (moneyline, puck line/spread, total)
- selection and line
- American odds
- the time read
- whether the game is still open

Do not record a price from a research site as the FanDuel price. Research sites
are for context and decimal-odds comparison only.

## 4. Read player props

FanDuel exposes prop groups through tabs and accordions. In the working run:

```text
?tab=shots              Shots on Goal
?tab=points-assists     Points and Assists
?tab=goals              Goals
?tab=assists            Assists
?tab=goalies            Goalie props
```

The exact tab labels and availability vary by event. Start at the event page
and add the query string, for example:

```text
https://sportsbook.fanduel.com/hockey/nhl/carolina-hurricanes-@-vancouver-canucks-36214455?tab=shots
```

Observed accordion labels:

```text
Player to Record 2+ Shots on Goal
Player to Record 3+ Shots on Goal
1+ Points
```

A reliable extraction pattern is to read visible text and slice around the
market heading:

```js
const text = document.body.innerText;
const marker = "Player to Record 2+ Shots on Goal";
const i = text.indexOf(marker);
i >= 0 ? text.slice(i, i + 5000) : "market not found";
```

If the accordion is collapsed, take a fresh accessibility snapshot and click
the accordion by role/name. Avoid clicking coordinates; the page reflows.
After the click, re-read the text and confirm the player/odds rows are visible.

Record for each prop:

```text
player | market | line | American odds | implied probability | role/usage note
```

If a prop or player is missing, record it as unavailable. Do not substitute a
different book's price or a different player without saying so.

## 5. Research context

Use at least two sources for a material claim. The goal is not a data dump; it
is to answer: who is playing, who is starting, what role do they have, and does
the matchup support the leg?

Useful sources:

- **Starting goalies and line combos:** Daily Faceoff,
  `https://www.dailyfaceoff.com/starting-goalies` and the team
  `line-combinations` pages. Check `Confirmed` versus `Likely` and the update
  timestamp.
- **Per-game previews, props, and stats:** SportsGambler per-game pages follow
  this pattern:
  `https://www.sportsgambler.com/betting-tips/ice-hockey/<away>-vs-<home>-prediction-odds-YYYY-MM-DD/`.
  The NHL index is
  `https://www.sportsgambler.com/betting-tips/ice-hockey/nhl-predictions/`.
- **Injuries and news:** the team's official site, NHL.com, ESPN, or a
  beat-writer report. A generic injury page can be stale.
- **Team and player stats:** NHL.com, Natural Stat Trick, Hockey Reference, or
  the league's official game reports. Prefer per-game rates and recent usage
  over a single hot streak.
- **NBA equivalents:** ESPN injuries and game previews, NBA.com, and
  Basketball Reference. Confirm starting lineups close to tip-off.

For each leg, write one sentence of evidence and the check time. Example:
"Blake: 2+ SOG in 8 of 10 games; top-six and PP2; FanDuel -355 at 9:05 PM ET."

## 6. Probability tiers

"Do the biggest payout and the highest probability" is not a single
optimization. Offer tiers and let the user choose:

| Tier | Target estimated hit rate | Typical shape | Use when |
|---|---|---|---|
| Conservative | 35–45% | 2–3 legs, one strong anchor | User wants to cash more often |
| Balanced | 25–35% | 3–4 legs, anchor plus role props | Default if no preference |
| Aggressive | 15–25% | 4–5 legs or a correlated SGP | User explicitly wants a bigger payout |

The ranges are planning targets, not promises. A ticket whose estimated hit
rate is below its breakeven probability is a bad ticket even if the payout is
large.

## 7. Correlations and SGP repricing

FanDuel reprices same-game parlays for correlation. The straight product of
the leg odds is only a reference.

Common positive correlations:

- team puck line/ML plus a top-line point prop from the same team;
- team total over plus a top-six point prop;
- goalie saves plus the opposing team's shot-volume props (often negatively
  correlated with a shutout, so check the direction);
- a player's points prop plus a teammate's assists prop on the same power play.

FanDuel may shorten the SGP price when legs are positively correlated, and may
reject or limit combinations. That is expected. If the SGP price is much worse
than the independent product, the market is telling you the legs are not
independent. Decide whether the ticket still clears the floor.

The final price must be read from the betslip after all legs are added. If the
betslip is blocked by a human check, report the straight product as an
estimate and mark it unverified.

## 8. Math

Convert American odds to decimal:

```text
positive: decimal = 1 + american / 100
negative: decimal = 1 + 100 / abs(american)
```

Then:

```text
straight product     = product(decimal_i)
payout               = stake * decimal
profit               = payout - stake
breakeven            = 1 / decimal
independent hit rate = product(p_i)
EV                   = p * profit - (1 - p) * stake
```

Use the helper:

```bash
python3 scripts/parlay_math.py \
  --stake 25 \
  --leg "Carolina -1.5|-118|0.55" \
  --leg "Aho 1+ point|-265|0.73" \
  --leg "Blake 2+ SOG|-355|0.80" \
  --leg "Stankoven 2+ SOG|-260|0.75"
```

The helper prints the independent product and a warning. Add
`--final-american +300` to compare a verified betslip price with the product.
The probabilities in the example are placeholders; replace them with your own
evidence-based estimates.

## 9. Worked example from the 2026-10-20 run

This is historical evidence of the workflow, not a current recommendation.

```text
Carolina -1.5 (-118)
Sebastian Aho 1+ point (-265)
Jackson Blake 2+ SOG (-355)
Logan Stankoven 2+ SOG (-260)
```

### Stat-driven rationale

For each leg, record the FanDuel price, implied probability, raw hit rate, role,
and matchup. The 2026-10-20 CAR @ VAN example:

| Leg | FanDuel | Implied | Raw hit rate | Evidence |
|---|---:|---:|---:|---|
| Carolina -1.5 | -118 | 54.1% | 6/10 road, 3/5 L5 | CAR 3.6 GF, 33.1 SF, 21.3% PP; VAN 4.5 GA, 32.7 SA, 64.9% PK |
| Aho 1+ point | -265 | 72.6% | 8/10 (80%) | 14 points in 10 GP (6G, 8A), 19.96 min, team points leader |
| Blake 2+ SOG | -355 | 78.0% | 9/10 (90%) | 2.7 SOG/GP, 18.28 min; 5 shots vs VAN on 10/08 |
| Stankoven 2+ SOG | -260 | 72.2% | 7/10 (70%) | 2.7 SOG/GP, 17.50 min; 5 shots vs VAN on 10/08 |

Team and goalie context:

- Carolina last 10: 7-2-1, 3.6 goals for, 33.1 shots for, 21.3% power play,
  2.4 goals against, 22.9 shots against, 93.2% penalty kill.
- Vancouver last 10: 2-7-1, 3.0 goals for, 21.1 shots for, 16.2% power play,
  4.5 goals against, 32.7 shots against, 64.9% penalty kill.
- H2H: Carolina 7 wins in the last 10, five straight, last meeting 7-2.
- Goalies: Pyotr Kochetkov confirmed, 5-0-0, 1.80 GAA, .912 SV%; Leevi
  Merilainen confirmed, 1-1-1, 2.50 GAA, .925 SV%.
- Carolina covered -1.5 in 6 of 10 road games and 3 of the last 5. Vancouver
  failed to cover +1.5 in 6 of 10 home games and 3 of the last 5.

Why the ticket holds together:

- All three skaters are Carolina players, so the legs are positively correlated
  with a Carolina puck-line win. A 4-1 or 5-2 game hits the puck line and gives
  the top-six forwards the game state for points and shots.
- Aho is the team's points leader and plays 19.96 minutes; Vancouver's 4.5 GA
  and 64.9% PK are the softest parts of the matchup.
- Blake's 2+ SOG rate is the strongest leg (9/10) and his 18.28 minutes keep
  the volume repeatable.
- The straight product was about +352. The 24–27% estimate is a conservative
  range after puck-line variance and Stankoven's zero-shot games, not the raw
  product of the hit rates.

Weakest leg: Stankoven at 7/10 raw (70%) versus 72.2% implied. The case is
volume and matchup, not a large statistical edge. Removing him lowers the
payout but also removes the least-supported leg.

The FanDuel betslip price was not verified because a human/bot check blocked
the session. The ticket was delivered as an estimate with that caveat.

Lessons for next time:

- Verify the betslip price before quoting a payout. Do not present the straight
  product as the final SGP price.
- Check the goalie and lineup news again immediately before reporting.
- If FanDuel blocks the browser, stop; do not try another browser, VPN, or
  automation route.
- A same-game ticket can be coherent without being high-probability. Say which
  leg is the weakest and what removing it does to the price.

## 10. Report template

Render the ticket as a FanDuel-style betslip card:

```text
┌──────────────────────────────────────────────────────────────┐
│  FanDuel Sportsbook                          SAME GAME PARLAY │
│  <Away Team> @ <Home Team>                        4 Legs      │
│  <Date> · <Time>                                             │
├──────────────────────────────────────────────────────────────┤
│  ✓  <Selection 1>                                  <odds>     │
│     <Market>                                                 │
│                                                              │
│  ✓  <Selection 2>                                  <odds>     │
│     <Market>                                                 │
│                                                              │
│  ✓  <Selection 3>                                  <odds>     │
│     <Market>                                                 │
│                                                              │
│  ✓  <Selection 4>                                  <odds>     │
│     <Market>                                                 │
├──────────────────────────────────────────────────────────────┤
│  Wager                                          $<stake>     │
│  Total Odds                                     <odds>*      │
│  To Win                                         $<profit>    │
│  Total Payout                                   $<payout>    │
├──────────────────────────────────────────────────────────────┤
│                      [  PLACE BET  ]                         │
└──────────────────────────────────────────────────────────────┘
```

`*` Straight product. FanDuel’s SGP price may be shorter after correlation
repricing.

After the card, add the validity check: same game, winning conditions, active
players, and whether the price is verified.

## 11. Hard stops

Stop immediately and report the blocker when:

- FanDuel asks for geolocation, login, or a human/bot check;
- the page shows an unavailable market;
- a confirmed goalie or starting lineup cannot be established;
- the betslip price is missing or materially different from the product;
- the user asks you to evade a geolocation or verification check.

Never use a VPN, proxy, remote desktop, emulator, or alternate browser profile
to defeat FanDuel's location or human checks. Never handle passwords, MFA,
payment details, or identity documents.
