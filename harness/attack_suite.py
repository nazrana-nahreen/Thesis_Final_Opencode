#!/usr/bin/env python3
"""Deprecated placeholder.

This file used to be a skeleton whose attack functions returned stub results.
It is kept only so that an old command fails loudly instead of producing fake
evidence. Use the real runner:

    python harness/attack_harness.py --system all --out harness/results

That runner executes `forge test --json` and maps actual test outcomes.
"""

import sys


def main() -> int:
    print(__doc__.strip(), file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
