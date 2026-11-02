"""Stand-in for a mutating desktop helper that is still running when aborted.

It writes nothing and touches no desktop API; it only proves that the adapter
kills the helper and reports what the kill means for an already-dispatched
mutation.
"""

import time

time.sleep(5)
print('{"dispatched": true}')
