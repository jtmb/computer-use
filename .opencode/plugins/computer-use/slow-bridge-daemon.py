"""Fake bridge daemon: accepts one framed request, then replies late.

Used only to abort a single in-flight bridge request and observe the adapter's
failure text. It has no D-Bus, compositor or desktop access.
"""

import json
import sys
import time

for line in sys.stdin:
    message = json.loads(line)
    time.sleep(2.5)
    print(json.dumps({"id": message["id"], "available": True, "ok": True, "marker": "late"}), flush=True)
