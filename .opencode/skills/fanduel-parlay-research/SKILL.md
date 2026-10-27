---
name: fanduel-parlay-research
description: Research FanDuel NHL and NBA game lines and player props, compare them with injuries, goalies, and team stats, and build a payout-versus-probability parlay with prices verified in the betslip. Use when the user asks for a FanDuel parlay, sportsbook odds research, player-prop comparison, or a same-game parlay ticket.
license: MIT
compatibility: Ubuntu and OpenCode; FanDuel is JavaScript-heavy and needs a browser session. FanDuel's geolocation check fails on Linux desktop browsers, so public pages are used for research and the betslip is verified on another device.
metadata:
  schema-version: "1"
  category: "browser"
  tags: "fanduel,sportsbook,parlay,odds,player-props,playwright"
---

# FanDuel Parlay Research

Build a researched FanDuel ticket. Price every leg at FanDuel, check the
goalies, injuries, and lineups, and state the payout-versus-probability
trade-off. Read [references/fanduel-workflow.md](./references/fanduel-workflow.md)
in full before the first run in a session.

## Linux note

FanDuel's geolocation check fails on Linux desktop browsers. Use the public
event pages for lines and props. The betslip and placement need a device that
passes FanDuel's location check, usually the user's phone. A VPN or alternate
browser will not fix it.

## Workflow

1. **Fix the constraint.** Confirm sport, slate/date, stake, and a probability
   floor. If the user has no floor, offer the three tiers in the reference and
   recommend balanced.
2. **Filter the slate.** Pull game status and start times from the ESPN
   scoreboard API. Remove games that have started or start too soon to verify
   lineups.
3. **Research the matchup.** Check injuries, confirmed/projected goalies, line
   combinations, power play, pace, rest, and travel. Use at least two sources
   for a material claim and record the check time. For every leg, record the
   FanDuel price, implied probability, raw hit rate, role, and matchup reason.
   See the stat-driven example in the reference.
4. **Price at FanDuel.** Open each event page and read the game line and prop
   markets directly. FanDuel is the price source of truth.
5. **Build a leg pool.** Record market, selection, American odds, implied
   probability, role, and the reason it clears the floor. Reject legs that need
   an unverified lineup or goalie.
6. **Choose the ticket.** Use one high-probability anchor and two to four
   supporting legs. Prefer a coherent game script over unrelated coin flips.
7. **Verify the ticket.** Add the legs to the FanDuel betslip and read the
   final price. An SGP is repriced for correlation; the straight product is not
   the final price. On Linux, ask the user to read the betslip price from their
   phone; if that is unavailable, mark the price unverified.
8. **Report the ticket.** Give the exact legs, stake, verified price, payout,
   breakeven, estimated hit-rate range, correlation caveats, and the checks to
   repeat before placement.

## Selection rules

- **Probability floor first.** Compare the estimated hit rate with the
  breakeven probability implied by the price. A bigger payout is not better if
  the extra leg halves the hit rate.
- **Anchor with information.** A confirmed goalie, top-line role, or matchup
  edge is an anchor. A famous name is not.
- **Props need role and usage.** For shots, check line, power-play unit, and
  recent shot rate. For points, check line, PP1 role, and teammate health. For
  goalie saves, confirm the starter and expected shot volume.
- **Respect correlation.** Team puck line plus a top-line point prop can be
  positively correlated, but FanDuel will reprice the SGP. Never quote the
  independent product as the SGP price.
- **Avoid stale lines.** Re-read the price after lineup news and immediately
  before reporting.

## Math

Use [.opencode/skills/fanduel-parlay-research/scripts/parlay_math.py](./.opencode/skills/fanduel-parlay-research/scripts/parlay_math.py) for the arithmetic.

- Decimal odds: positive American `1 + A/100`; negative `1 + 100/|A|`.
- Straight payout: `stake × product of decimal odds`.
- Breakeven probability: `1 / decimal odds`.
- Estimated hit rate: product of leg probabilities, adjusted for correlation;
  report a range.
- EV at the verified price: `p × profit − (1 − p) × stake`.

The final price comes from the FanDuel betslip. If the betslip is unavailable,
report the straight product as an estimate and mark it **unverified**.

## Visual ticket output

Render the ticket as a FanDuel-style betslip card, not a plain list. Replace the
example values with the researched ticket:

```text
┌──────────────────────────────────────────────────────────────┐
│  FanDuel Sportsbook                          SAME GAME PARLAY │
│  Carolina Hurricanes @ Vancouver Canucks          4 Legs      │
│  Today · 10:10 PM ET                                         │
├──────────────────────────────────────────────────────────────┤
│  ✓  Carolina Hurricanes -1.5                       -118       │
│     Puck Line                                                │
│                                                              │
│  ✓  Sebastian Aho 1+ Point                         -265       │
│     Player Props                                             │
│                                                              │
│  ✓  Jackson Blake 2+ Shots on Goal                 -355       │
│     Player Props                                             │
│                                                              │
│  ✓  Logan Stankoven 2+ Shots on Goal               -260       │
│     Player Props                                             │
├──────────────────────────────────────────────────────────────┤
│  Wager                                          $25.00       │
│  Total Odds                                     +352*        │
│  To Win                                         $87.90       │
│  Total Payout                                   $112.90      │
├──────────────────────────────────────────────────────────────┤
│                      [  PLACE BET  ]                         │
└──────────────────────────────────────────────────────────────┘
```

`*` Straight product. FanDuel’s SGP price may be shorter after correlation
repricing.

After the card, add a short validity check:

- all legs must be from the same game for an SGP;
- state the winning conditions in one line;
- confirm the players are active;
- use the verified betslip price, or mark it unverified.

If a leg is changed, keep the same visual structure and update the rows, odds,
leg count, stake, odds, and payout.

## Related skills

- `browser-assistant` for a visible, user-controlled browser session.
- `browser-headless` for explicitly requested isolated public-page research.
- `task-memory` for durable preferences such as stake, sport, and risk tier.
