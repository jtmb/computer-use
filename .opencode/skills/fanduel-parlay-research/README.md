# FanDuel Parlay Research Usage

This guide explains how to request `fanduel-parlay-research`. Agent operating
rules remain in [SKILL.md](./SKILL.md). OpenCode loads `SKILL.md` on demand;
this README and the reference are not loaded automatically.

Category: `browser`

Tags: `fanduel`, `sportsbook`, `parlay`, `odds`, `player-props`, `playwright`

## Purpose and when to use it

Use this skill when you want a researched FanDuel ticket rather than a random
parlay: NHL or NBA game lines, player props, same-game parlays (SGPs), or a
payout-versus-probability comparison. The skill collects the slate, checks
goalies, injuries, lineups, and usage, prices legs on FanDuel, verifies the
final betslip price, and reports the ticket with its risks.

It is a good fit for:

- "Build me a $25 FanDuel NHL parlay with the best payout while keeping a real
  chance of winning."
- "Compare these two player-prop legs and tell me which ticket is better."
- "Research tonight's slate and give me one conservative and one aggressive
  FanDuel ticket."
- "Check the FanDuel price on this same-game parlay before I place it."

It is not a fit for automated bet submission, account creation, or location
spoofing.

## Prerequisites and setup verification

Before the first run, the agent checks:

- the sport, date/slate, stake, jurisdiction, and probability floor;
- the current FanDuel event page and whether the games have started;
- the browser path: an existing visible, logged-in session for betslip
  verification, or isolated public-page browsing for research only;
- the ESPN scoreboard endpoint for the date, to confirm game status and start
  times;
- an independent research source for injuries, goalies, and lineups;
- that the user is old enough and physically in a jurisdiction where FanDuel
  operates. The agent does not verify identity or location itself.

FanDuel is JavaScript-heavy and may require a browser rather than plain HTTP.
Public event pages can often be read without login; the betslip and any account
action require the user's eligible session. If a human-verification challenge
appears, the agent stops.

## How to request it

- "Build a $25 FanDuel parlay for tonight's NHL slate. Balanced risk, not a
  lottery ticket."
- "I want the biggest payout you can justify, but tell me the hit-rate cost."
- "Use only confirmed goalies and players who are actually in the lineup."
- "Give me a 3-leg conservative version and a 4-leg aggressive version."
- "Verify the final SGP price in the betslip."
- "Here is my state and budget; check whether the games are still open."

Include the sport, slate, stake, risk preference, any players/teams to avoid,
and whether the betslip is available for verification. Never send a password,
one-time code, or payment detail in chat.

## Worked workflow and expected result

A representative run:

1. Ask for the probability floor and stake. If the user has no floor, present
   three tiers: conservative (~35–45% estimated hit rate), balanced (~25–35%),
   and aggressive (~15–25%), and recommend balanced.
2. Query the ESPN scoreboard for the date and remove games that have started
   or are too close to start to verify lineups.
3. For each remaining game, open the FanDuel event page and record the moneyline,
   puck line/spread, total, and the prop markets that fit the thesis.
4. Cross-check the goalie, injuries, line combinations, power-play role, recent
   shot/point rate, and opponent matchup. Record the sources and check time.
5. Build a candidate pool with American odds and implied probabilities. Reject
   legs without a confirmed role.
6. Select one anchor plus two to four supporting legs. Prefer a coherent game
   script; do not add a leg only to inflate the payout.
7. Add the legs to the FanDuel betslip and read the final SGP price. Compare it
   with the independent product and the user's target.
8. Report the ticket and stop. The user re-checks goalies, lineups, price, and
   jurisdiction, then places it themselves.

Expected result for a balanced $25 four-leg SGP:

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

Validity check: all four legs are from the same game; Carolina must win by 2+,
Aho needs 1 point, and Blake and Stankoven each need 2 shots on goal. The
players must be active.

The legs above are a historical illustration from a prior run, not current
odds. A straight multiplication of those legs is not the SGP price. Always use
the betslip number.

## Verification and known limitations

- FanDuel's final SGP price is authoritative. The independent product is only a
  sanity check and will usually differ because of correlation repricing.
- Public pages can lag or show a different price from the betslip. Re-read the
  betslip immediately before reporting.
- Confirmed goalies and lineups can change close to game time. A ticket built
  on a projected goalie is a weaker ticket; label it that way.
- Implied probability includes the book's margin. Removing vig is an estimate,
  not a known true probability.
- Injury reports can be incomplete or stale. Two sources are better than one,
  and a late scratch can invalidate a leg.
- The estimated hit rate is a model judgment. Report a range and the main
  uncertainty.
- Geolocation, age, identity, and payment checks belong to FanDuel and the
  user. The agent cannot complete them; let the user handle them.
- This workflow was documented from a real research run, but the example odds
  are not live and must not be reused as current prices.

## Troubleshooting

- **FanDuel shows a human or bot check.** Stop. Ask the user to complete it in
  their own browser. Do not retry with a different browser, VPN, proxy, or
  automation trick.
- **FanDuel shows a location error.** Stop and let the user resolve it in their
  own session.
- **Event page 404s or the event ID changes.** Return to the FanDuel NHL/NBA
  navigation page and collect the current event link; do not guess an ID.
- **Prop tab or accordion is missing.** The market may be unavailable for that
  game or player. Record it as unavailable rather than substituting a different
  book's price.
- **Betslip price is much worse than the product.** Correlation repricing is
  likely. Remove a correlated leg, choose a different combination, or pass.
- **A player is scratched after the ticket is built.** Rebuild the leg or pass.
  Do not report a ticket that depends on a player who is not playing.
- **Odds moved during research.** Re-read every leg. If the price no longer
  clears the floor, say so and rebuild.

## Safety, confirmation, and elevation

Use the user's existing session and confirm the stake and final price before any
placement action. Do not ask for passwords, MFA, payment details, or identity
documents. If FanDuel shows a verification challenge, stop and let the user
resolve it in their own session.

## Related skills and documents

- [`browser-assistant`](../browser-assistant/README.md) governs a visible,
  user-controlled browser session, including a native Ubuntu browser.
- [`browser-headless`](../browser-headless/README.md) covers explicitly
  requested isolated public-page research; it is not a location bypass.
- [`task-memory`](../task-memory/README.md) can store durable preferences such
  as stake, sport, and risk tier, but never credentials or account data.
- [references/fanduel-workflow.md](./references/fanduel-workflow.md) contains
  the exact FanDuel URL, tab, accordion, evidence, and math workflow.
- [.opencode/skills/fanduel-parlay-research/scripts/parlay_math.py](./.opencode/skills/fanduel-parlay-research/scripts/parlay_math.py) calculates independent
  parlay math and prints the SGP-price warning.
- The canonical catalog is `skills/README.md`; it is outside the deployed skill
  bundle and is therefore shown as a plain repository path.
