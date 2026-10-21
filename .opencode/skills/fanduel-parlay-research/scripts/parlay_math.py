#!/usr/bin/env python3
"""Independent parlay math for FanDuel research.

This is a sanity-check calculator, not a price source. A same-game parlay is
repriced by the book for correlation; always read the final price from the
FanDuel betslip.

Usage:
    python3 parlay_math.py --stake 25 \
        --leg "Carolina -1.5|-118|0.55" \
        --leg "Aho 1+ point|-265|0.73" \
        --leg "Blake 2+ SOG|-355|0.80" \
        --leg "Stankoven 2+ SOG|-260|0.75" \
        --final-american +300

Each --leg is LABEL|AMERICAN_ODDS|PROBABILITY. Probability is optional and
must be between 0 and 1. Labels may not contain a pipe.
"""

from __future__ import annotations

import argparse
import math
import sys
from dataclasses import dataclass


@dataclass
class Leg:
    label: str
    american: int
    probability: float | None

    @property
    def decimal(self) -> float:
        if self.american > 0:
            return 1.0 + self.american / 100.0
        return 1.0 + 100.0 / abs(self.american)


def american_to_decimal(american: int) -> float:
    if american == 0 or abs(american) < 100:
        raise ValueError(f"American odds must be <= -100 or >= +100: {american}")
    return 1.0 + american / 100.0 if american > 0 else 1.0 + 100.0 / abs(american)


def decimal_to_american(decimal: float) -> str:
    if decimal <= 1.0:
        return "invalid"
    if decimal >= 2.0:
        return f"+{round((decimal - 1.0) * 100)}"
    return f"-{round(100.0 / (decimal - 1.0))}"


def parse_leg(raw: str) -> Leg:
    parts = raw.split("|")
    if len(parts) not in (2, 3):
        raise ValueError(
            f"leg must be LABEL|AMERICAN_ODDS or LABEL|AMERICAN_ODDS|PROBABILITY: {raw!r}"
        )
    label = parts[0].strip()
    if not label:
        raise ValueError(f"leg label is empty: {raw!r}")
    try:
        american = int(parts[1].strip().replace("+", ""))
    except ValueError as exc:
        raise ValueError(f"invalid American odds in {raw!r}") from exc
    if american == 0 or abs(american) < 100:
        raise ValueError(f"American odds must be <= -100 or >= +100: {raw!r}")
    probability = None
    if len(parts) == 3 and parts[2].strip():
        try:
            probability = float(parts[2].strip())
        except ValueError as exc:
            raise ValueError(f"invalid probability in {raw!r}") from exc
        if not math.isfinite(probability) or not 0.0 <= probability <= 1.0:
            raise ValueError(f"probability must be between 0 and 1: {raw!r}")
    return Leg(label=label, american=american, probability=probability)


def money(value: float) -> str:
    return f"${value:,.2f}"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Independent parlay math with an SGP-price warning.",
        epilog=(
            "A same-game parlay is repriced for correlation. Use --final-american "
            "with the price actually shown in the FanDuel betslip."
        ),
    )
    parser.add_argument("--stake", type=float, required=True, help="stake in dollars")
    parser.add_argument(
        "--leg",
        action="append",
        default=[],
        metavar="LABEL|ODDS[|PROB]",
        help="leg label, American odds, and optional probability (0-1); repeat",
    )
    parser.add_argument(
        "--final-american",
        type=int,
        default=None,
        help="verified betslip price, e.g. +300; overrides the product for payout math",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="emit a JSON object instead of the text report",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.stake <= 0 or not math.isfinite(args.stake):
        parser.error("--stake must be a positive finite number")
    if not args.leg:
        parser.error("at least one --leg is required")

    try:
        legs = [parse_leg(raw) for raw in args.leg]
    except ValueError as exc:
        parser.error(str(exc))

    product = math.prod(leg.decimal for leg in legs)
    product_american = decimal_to_american(product)
    probabilities = [leg.probability for leg in legs]
    if all(p is not None for p in probabilities):
        combined_probability: float | None = math.prod(probabilities)  # type: ignore[arg-type]
    else:
        combined_probability = None

    final_american = args.final_american
    if final_american is not None:
        if final_american == 0 or abs(final_american) < 100:
            parser.error("--final-american must be <= -100 or >= +100")
        price_decimal = american_to_decimal(final_american)
        price_label = f"{final_american:+d}"
    else:
        price_decimal = product
        price_label = f"{product_american} (independent product)"

    payout = args.stake * price_decimal
    profit = payout - args.stake
    breakeven = 1.0 / price_decimal if price_decimal > 0 else float("inf")
    ev = (
        combined_probability * profit - (1.0 - combined_probability) * args.stake
        if combined_probability is not None
        else None
    )

    if args.json:
        import json

        print(
            json.dumps(
                {
                    "stake": round(args.stake, 2),
                    "legs": [
                        {
                            "label": leg.label,
                            "american": leg.american,
                            "decimal": round(leg.decimal, 4),
                            "probability": leg.probability,
                        }
                        for leg in legs
                    ],
                    "independent_decimal": round(product, 4),
                    "independent_american": product_american,
                    "price_used": price_label,
                    "payout": round(payout, 2),
                    "profit": round(profit, 2),
                    "breakeven": round(breakeven, 6),
                    "combined_probability": (
                        round(combined_probability, 6)
                        if combined_probability is not None
                        else None
                    ),
                    "ev": round(ev, 2) if ev is not None else None,
                    "warning": "SGP price must be read from the FanDuel betslip.",
                },
                indent=2,
            )
        )
        return 0

    print("FanDuel parlay math (independent estimate)")
    print(f"Stake: {money(args.stake)}")
    print()
    print(f"{'Leg':<42} {'American':>9} {'Decimal':>8} {'Prob':>7}")
    print("-" * 70)
    for leg in legs:
        probability = f"{leg.probability:.1%}" if leg.probability is not None else "-"
        print(
            f"{leg.label[:42]:<42} {leg.american:>+9d} {leg.decimal:>8.3f} {probability:>7}"
        )
    print()
    print(f"Independent product: {product_american} ({product:.4f})")
    print(f"Price used: {price_label}")
    print(f"Payout: {money(payout)}")
    print(f"Profit: {money(profit)}")
    print(f"Breakeven: {breakeven:.2%}")
    if combined_probability is not None:
        print(f"Combined probability: {combined_probability:.2%}")
        if ev is not None:
            print(f"EV at the price used: {money(ev)}")
    else:
        print("Combined probability: not calculated (provide a probability on every leg)")
    print()
    if final_american is None:
        print(
            "WARNING: this is the independent product, not the FanDuel SGP price. "
            "Read the final price from the betslip."
        )
    else:
        print(
            "Checked against the supplied betslip price. Confirm it again immediately "
            "before reporting or placing."
        )
        if price_decimal + 1e-9 < product:
            print("NOTE: the betslip price is shorter than the independent product.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
