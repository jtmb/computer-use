# defusedxml0.7.1 static candidate review

This advances the existing document rights/dependency review only. **Nothing was
installed, imported or executed**, and no XML document was parsed. The broader
authoring/hardened-XML/runtime gates remain open.

## Exact artifact and acquisition

- [Version-specific PyPI metadata](https://pypi.org/pypi/defusedxml/0.7.1/json)
  identified `defusedxml-0.7.1-py2.py3-none-any.whl`,25604bytes, not yanked.
- The parent fetched only that artifact from its declared HTTPS
  `files.pythonhosted.org` URL, using normal TLS verification, no redirects,
  a131072byte per-response cap and5second socket timeout inside a30second shell
  deadline. The metadata response was35962bytes; the wheel was25604bytes.
- Actual wheel SHA256 matches the registry declaration:
  `a352e7e428770286cc899e2542b6cdaedb2b4953ff269a210103ec58f6198a61`.
  This is an actual byte check, not a signature or publisher-identity audit.
- The existing independently authored Office ZIP reader inspected16entries/
  68651declared expanded bytes with reduced128KiB archive/64KiB directory/member/
  read/128entry/256KiB total/5second bounds. It reports inspection only, XML
  uninspected, payloads not all verified and render/authoring readiness false.
- Only four exact text members were read, with bounded streaming, completed CRC/
  size verification and source rechecks. No tree extraction or code loading.

| Selected member | Bytes | SHA256 |
| --- | --- | --- |
| `defusedxml-0.7.1.dist-info/LICENSE` |2409| `b80ce9da8c42a1f91079627fbbe2bf27210ae108a0ffe5f077d5b08e076c24c8` |
| `defusedxml-0.7.1.dist-info/METADATA` |32518| `369d3cef64870daf849fba711cb8d05a7efe3c8d9ab0f763adc34079fe378bb1` |
| `defusedxml/ElementTree.py` |4640| `18b4aaa42cf9f285c63c6cb37ff1f296c3d2f7f75c1953f948de1d2bbcafc8fc` |
| `defusedxml/common.py` |4036| `ddddba8cd5b87cd5f38235a1bd47ecf3701f8b3e44571143ba941bba09123197` |

## Observed license and reuse boundary

The parent read the entire selected LICENSE. It contains **Python Software
Foundation License Version2**, not merely the registry's `PSFL` shorthand.
Clause2 permits analysis/reproduction/use subject to retaining the license and
PSF copyright notice; clause3 requires a brief change summary when distributing
a derivative. Clauses4–5 disclaim warranties/liability, and clause7 grants no
trademark endorsement rights. This is observed artifact text, not legal advice
or blanket rights/security approval for the whole authoring stack.

The unchanged license/copyright and original source text are retained together.
No third-party implementation was copied into this repository's helper/skill, no
project license was changed and nothing was published. The separately restricted
imported document-helper bundle was not used. Other candidates' license files and
transitive distribution rights remain unreviewed.

## Static API review status

The child is terminal/released and its watch stopped. Parent read both complete
source members and the relevant METADATA passages, independently confirming:

- `ElementTree.py:79–131` defaults to `forbid_dtd=False`, with entity/external
  prohibitions true. Explicit flags install raising Expat callbacks at construction;
  this is source wiring, not an observed hostile-input result on this host.
- `common.py:92–127` constructs that parser only when `parser is None` for
  parse/iterparse. Passing a custom parser bypasses those factory flags; fromstring
  always constructs its own. A future route must not expose an unchecked parser.
- Exceptions derive from ValueError, not just ElementTree.ParseError; interpolated
  error text is untrusted/unbounded. Future reporting must not echo it unrestricted.
- Neither selected implementation enforces input-byte/node/depth/time budgets or
  processes XInclude. The documented separate inclusion step must remain forbidden.
- Import selects a pure-Python stdlib parser through process-global module
  manipulation. No current CPython3.14/Expat compatibility or thread-safety proof
  follows. METADATA labels cElementTree/lxml wrappers deprecated and stdlib-wide
  monkey-patching experimental/untested; no such route was adopted.

The bounded native child audit covered21assistant records/19calls/177652bytes:
task-memory and required policy/preferences reads are visible; a CodeMode local-read
attempt failed and was followed by direct reads. The later catalogue search was
valid, not network access. Development/files skills were read as files rather than
loaded through the required skill tool, with required reference omissions. Narrow
static findings are supported; blanket startup compliance is not accepted. No
package import/execution, test, write, shell, network or goal call appears.

No static claim is an import test, CPython3.14/Expat compatibility result, bounded
XML-processing implementation or untrusted-document acceptance.

## Preservation

Seven selected wheel/acquisition/member/manifest files, with full unchanged license,
are preserved under
`/home/james/Documents/computer-use-native-host-20261029/defusedxml-static-review-jctghmoe/`.
Exclusive `receipt.json` SHA256:
`b4a14252820264cfab2aeb49239afb245d9b054448008e4975c19086b9f9f8ae`.
Scratch originals remain at `/tmp/opencode/defusedxml-static-review-nvsoyewk/`.
Preservation is not package installation, activation, permission/security changes,
or endorsement of unreviewed wheel members.
