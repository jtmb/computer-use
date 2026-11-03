"""Bounded acquisition of exact-version PyPI JSON release metadata.

The helper reads only ``https://pypi.org/pypi/<project>/<version>/json``. It
refuses redirects, foreign hosts, URL credentials, queries and fragments, keeps
normal TLS verification, and performs no retries.

One :class:`JobBudget` is shared by every acquisition in a job. It fixes three
limits that this module never raises: 2 MiB per response, 10 MiB in aggregate
and 12 requests. A request is reserved before the connection opens. Every byte
is charged to the shared aggregate as it is read and the remaining budget is
checked before each read, so a refusal, failure or partially read body never
refunds anything.

End-of-body handling is fail-closed. A declared ``Content-Length`` that reaches
the effective cap is refused before the body is read. A body is refused when it
reaches the cap because confirming EOF would require one more read past the cap.
Accepted bodies are strictly smaller than both caps.

Socket timeouts and the cooperative deadline bound waiting. They do not preempt
a transport or kernel call that never returns, so this module makes no hard
interruption claim for an uncooperative trusted transport.

Results retain the raw bytes and their SHA-256 receipt so a later audit does not
depend on the parsed projection alone. A job that has spent its 12 requests is
finished: creating a replacement budget to continue the same pass is outside this
helper's authority, and this helper's success does not authorize another live run.
This is an acquisition primitive, not an acceptance test: offline fake transports
prove helper behavior only, and a successful call does not establish that live
PyPI bytes and identity match the projection.
"""

from __future__ import annotations

import hashlib
import http.client
import json
import math
import re
import ssl
import threading
import time
import urllib.parse
import urllib.request
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Protocol, cast, runtime_checkable
from urllib.response import addinfourl

PER_RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024
AGGREGATE_LIMIT_BYTES = 10 * 1024 * 1024
REQUEST_LIMIT = 12
READ_CHUNK_BYTES = 64 * 1024
SOCKET_TIMEOUT_SECONDS = 5.0
JOB_DEADLINE_SECONDS = 60.0

PYPI_METADATA_URL = "https://pypi.org/pypi/{project}/{version}/json"
USER_AGENT = "computer-use-document-metadata/1 (bounded read-only)"
MAX_IDENTIFIER_LENGTH = 128

_PROJECT_PATTERN = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?")
_VERSION_PATTERN = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9._+!-]{0,126}[A-Za-z0-9])?")


class MetadataError(Exception):
    """Base class for every refusal raised by this module."""


class BudgetExhausted(MetadataError):
    """The shared job deadline or a fixed request/byte limit is spent."""


class RefusedURL(MetadataError):
    """The project or version cannot form the official metadata URL."""


class RefusedResponse(MetadataError):
    """The transport returned a response this helper will not read."""


class RefusedMetadata(MetadataError):
    """The acquired body is not the requested release document."""


class TransportFailure(MetadataError):
    """The transport could not open or finish the bounded read."""


@dataclass(frozen=True)
class Limits:
    """Fixed acquisition limits; production callers use :data:`JOB_LIMITS`.

    The fields exist so offline tests can exercise boundary behavior cheaply.
    There is no CLI, environment variable or configuration path that raises them.
    """

    per_response_bytes: int = PER_RESPONSE_LIMIT_BYTES
    aggregate_bytes: int = AGGREGATE_LIMIT_BYTES
    requests: int = REQUEST_LIMIT
    socket_timeout_seconds: float = SOCKET_TIMEOUT_SECONDS
    deadline_seconds: float = JOB_DEADLINE_SECONDS

    def __post_init__(self) -> None:
        """Permit smaller test limits, never an expanded production ceiling."""
        for value, maximum in (
            (self.per_response_bytes, PER_RESPONSE_LIMIT_BYTES),
            (self.aggregate_bytes, AGGREGATE_LIMIT_BYTES),
            (self.requests, REQUEST_LIMIT),
        ):
            if type(value) is not int or not 0 < value <= maximum:
                raise ValueError("byte and request limits must be positive and capped")
        for value, maximum in (
            (self.socket_timeout_seconds, SOCKET_TIMEOUT_SECONDS),
            (self.deadline_seconds, JOB_DEADLINE_SECONDS),
        ):
            if (type(value) not in (int, float) or not math.isfinite(value)
                    or not 0 < value <= maximum):
                raise ValueError("time limits must be finite, positive and capped")


JOB_LIMITS = Limits()


class JobBudget:
    """Shared, non-resettable byte, request and deadline accounting for one job.

    The caller creates one budget and passes it to every acquisition. Nothing in
    this module recreates or resets it, and failures consume it exactly like
    successes, so a retry cannot refund spent requests or bytes.
    """

    def __init__(
        self,
        limits: Limits = JOB_LIMITS,
        *,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        """Start one job's accounting at the current clock reading.

        Args:
            limits: Fixed limits for this job.
            clock: Monotonic time source; injectable for deadline tests.
        """
        self._limits = limits
        self._clock = clock
        self._started = clock()
        self._bytes_used = 0
        self._requests_used = 0
        self._operation_lock = threading.Lock()

    @property
    def limits(self) -> Limits:
        """Return the frozen policy, without a public reassignment path."""
        return self._limits

    @property
    def bytes_used(self) -> int:
        """Return body bytes acquired so far, including failed reads."""
        return self._bytes_used

    @property
    def requests_used(self) -> int:
        """Return requests reserved so far, including failed opens."""
        return self._requests_used

    def bytes_remaining(self) -> int:
        """Return aggregate bytes still available, possibly zero or negative."""
        return self.limits.aggregate_bytes - self._bytes_used

    def remaining_seconds(self) -> float:
        """Return cooperative seconds left in the job."""
        return self.limits.deadline_seconds - (self._clock() - self._started)

    def reserve_request(self) -> None:
        """Reserve one request before any connection is opened.

        Raises:
            BudgetExhausted: The deadline has passed or every request is used.
        """
        if self.remaining_seconds() <= 0:
            raise BudgetExhausted("job deadline passed before the request")
        if self.bytes_remaining() <= 0:
            raise BudgetExhausted("shared aggregate byte budget is already spent")
        if self._requests_used >= self.limits.requests:
            raise BudgetExhausted(
                f"job request limit of {self.limits.requests} is spent"
            )
        self._requests_used += 1

    def charge(self, count: int) -> None:
        """Charge acquired body bytes to the shared aggregate.

        Args:
            count: Non-negative byte count, charged whether or not the request
                later succeeds.

        Raises:
            ValueError: A negative count was charged.
        """
        if count < 0:
            raise ValueError("charged bytes cannot be negative")
        self._bytes_used += count


@dataclass(frozen=True)
class SourceReceipt:
    """Raw bytes and provenance retained for later audit.

    Attributes:
        url: Exact requested metadata URL.
        status: HTTP status; only 200 responses produce a receipt.
        content_type: Declared content type, if the response supplied one.
        content_length: Parsed Content-Length, if the response supplied one.
        bytes_received: Body bytes acquired and charged.
        sha256: Hex SHA-256 digest of ``raw``.
        raw: The exact acquired body, never a re-serialized projection.
    """

    url: str
    status: int
    content_type: str | None
    content_length: int | None
    bytes_received: int
    sha256: str
    raw: bytes

    def as_receipt(self) -> dict[str, object]:
        """Return a JSON-ready provenance record without the raw body."""
        return {
            "url": self.url,
            "status": self.status,
            "contentType": self.content_type,
            "contentLength": self.content_length,
            "bytesReceived": self.bytes_received,
            "sha256": self.sha256,
        }


@dataclass(frozen=True)
class ReleaseMetadata:
    """Verified release identity plus the raw source receipt.

    Attributes:
        project: Requested project spelling.
        version: Requested exact version.
        name: Project name reported by the document.
        source: Raw-byte receipt for audit.
        payload: Parsed JSON document; a projection, not audit evidence.
    """

    project: str
    version: str
    name: str
    source: SourceReceipt
    payload: Mapping[str, object]

    @property
    def info(self) -> Mapping[str, object]:
        """Return the parsed ``info`` object for read-only projection."""
        return cast(Mapping[str, object], self.payload["info"])


@runtime_checkable
class MetadataResponse(Protocol):
    """Narrow response surface the bounded reader relies on."""

    status: int
    headers: Mapping[str, str]

    def read(self, size: int) -> bytes:
        """Return at most ``size`` bytes, or b"" at end of body."""

    def geturl(self) -> str:
        """Return the URL the response was finally served from."""

    def close(self) -> None:
        """Release the underlying connection."""


class MetadataTransport(Protocol):
    """Injectable transport; only offline tests replace the default."""

    def open(self, url: str, *, timeout: float) -> MetadataResponse:
        """Open ``url`` without following redirects."""


class RedirectRefusalHandler(urllib.request.HTTPRedirectHandler):
    """Refuse redirects: following one would leave the reviewed URL."""

    def redirect_request(
        self,
        req: urllib.request.Request,
        fp: object,
        code: int,
        msg: str,
        headers: object,
        newurl: str,
    ) -> None:
        """Refuse the redirect instead of returning a follow-up request."""
        raise RefusedResponse(f"refused redirect ({code}) from the metadata URL")


class _UrllibResponse:
    """Adapt a urllib response to the typed transport surface."""

    def __init__(self, response: addinfourl) -> None:
        self.status = response.status
        self.headers = {
            str(key).lower(): str(value) for key, value in response.headers.items()
        }
        self._response = response
        self._url = response.geturl()

    def read(self, size: int) -> bytes:
        """Return at most ``size`` bytes from the connection."""
        return self._response.read(size)

    def geturl(self) -> str:
        """Return the URL the connection was finally served from."""
        return self._url

    def close(self) -> None:
        """Release the connection."""
        self._response.close()


class UrllibTransport:
    """Default transport: verified system TLS, no redirects, no logging."""

    def __init__(self) -> None:
        """Build one opener with a verified default context."""
        handlers = (
            RedirectRefusalHandler(),
            urllib.request.HTTPSHandler(context=ssl.create_default_context()),
        )
        self._opener = urllib.request.build_opener(*handlers)

    def open(self, url: str, *, timeout: float) -> MetadataResponse:
        """Open an official metadata URL without following redirects.

        Args:
            url: URL this module built itself.
            timeout: Bound for connect and each socket operation.

        Returns:
            Adapted response with normalised lowercase headers.

        Raises:
            RefusedURL: The URL is not the exact official HTTPS shape.
        """
        _refuse_unsafe_url(url)
        request = urllib.request.Request(
            url,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        )
        return _UrllibResponse(self._opener.open(request, timeout=timeout))


def metadata_url(project: str, version: str) -> str:
    """Return the official exact-version JSON URL for a project and version.

    Args:
        project: PyPI project name using letters, digits, ``.``, ``-`` or ``_``.
        version: Exact version using letters, digits and ``._+!-``.

    Returns:
        HTTPS metadata URL with no query, fragment or credentials.

    Raises:
        RefusedURL: An identifier is empty, too long, not a string or contains a
            character that could change the request target.
    """
    _require_identifier("project", project, _PROJECT_PATTERN)
    _require_identifier("version", version, _VERSION_PATTERN)
    return PYPI_METADATA_URL.format(project=project, version=version)


def acquire_release_metadata(
    project: str,
    version: str,
    *,
    budget: JobBudget,
    transport: MetadataTransport | None = None,
) -> ReleaseMetadata:
    """Acquire, bound and verify one exact-version metadata document.

    Args:
        project: Requested PyPI project name.
        version: Exact requested version.
        budget: Shared job budget, charged even when this call fails.
        transport: Injectable transport for offline tests; the default performs
            a real HTTPS request and is not exercised by the test suite.

    Returns:
        Verified release identity plus the raw-byte source receipt.

    Raises:
        RefusedURL: The identifiers cannot form a safe metadata URL.
        BudgetExhausted: The deadline or a fixed limit is already spent.
        RefusedResponse: Status, framing or response URL is not acceptable.
        RefusedMetadata: The body is not the requested release document.
        TransportFailure: The transport could not open or finish the read.
    """
    url = metadata_url(project, version)
    # Overlapping readers must not both spend the same remaining byte allowance.
    if not budget._operation_lock.acquire(blocking=False):
        raise BudgetExhausted("another acquisition is already using this job")
    try:
        budget.reserve_request()
        client = transport if transport is not None else UrllibTransport()
        receipt = _acquire_bytes(url, budget, client)
        payload = _parse_payload(receipt)
        name = _verify_identity(payload, project, version)
        return ReleaseMetadata(
            project=project,
            version=version,
            name=name,
            source=receipt,
            payload=payload,
        )
    finally:
        budget._operation_lock.release()


def _require_identifier(kind: str, value: object, pattern: re.Pattern[str]) -> None:
    """Refuse an identifier that cannot be placed in the URL path verbatim."""
    if not isinstance(value, str):
        raise RefusedURL(f"{kind} must be a string")
    if len(value) > MAX_IDENTIFIER_LENGTH:
        raise RefusedURL(f"{kind} is longer than {MAX_IDENTIFIER_LENGTH} characters")
    if not pattern.fullmatch(value):
        raise RefusedURL(f"{kind} contains characters this helper will not request")


def _refuse_unsafe_url(url: str) -> None:
    """Refuse any URL that is not the exact official HTTPS shape."""
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != "https" or parts.hostname != "pypi.org":
        raise RefusedURL("metadata URL must be https on pypi.org")
    try:
        port = parts.port
    except ValueError as exc:
        raise RefusedURL("metadata URL has an invalid port") from exc
    if port not in (None, 443):
        raise RefusedURL("metadata URL must use the default HTTPS port")
    if parts.username is not None or parts.password is not None:
        raise RefusedURL("metadata URL must not contain credentials")
    if parts.query or parts.fragment:
        raise RefusedURL("metadata URL must not contain a query or fragment")
    segments = parts.path.split("/")
    if len(segments) != 5 or segments[:2] != ["", "pypi"] or segments[-1] != "json":
        raise RefusedURL("metadata URL must be a PyPI JSON release path")
    _require_identifier("project", segments[2], _PROJECT_PATTERN)
    _require_identifier("version", segments[3], _VERSION_PATTERN)


def _acquire_bytes(
    url: str, budget: JobBudget, transport: MetadataTransport
) -> SourceReceipt:
    """Open one response and read its body under the shared budget."""
    try:
        response = transport.open(url, timeout=budget.limits.socket_timeout_seconds)
    except MetadataError:
        raise
    except (OSError, http.client.HTTPException) as exc:
        raise TransportFailure(
            f"transport failed to open the metadata URL: {type(exc).__name__}"
        ) from exc
    try:
        if response.geturl() != url:
            raise RefusedResponse("response URL differs from the requested URL")
        if response.status != 200:
            raise RefusedResponse(
                f"metadata response status {response.status} is not 200"
            )
        headers = response.headers
        if not isinstance(headers, Mapping):
            raise RefusedResponse("response headers are not a mapping")
        normalised = {str(key).lower(): str(value) for key, value in headers.items()}
        declared = _declared_length(normalised.get("content-length"))
        effective = min(budget.limits.per_response_bytes, budget.bytes_remaining())
        if effective <= 0:
            raise BudgetExhausted("shared aggregate byte budget is already spent")
        if declared is not None and declared >= effective:
            raise RefusedResponse(
                f"declared Content-Length {declared} reaches the {effective}-byte "
                "cap, so a complete body cannot be proven within budget"
            )
        body = _read_body(response, budget)
        if declared is not None and len(body) != declared:
            raise RefusedResponse("body size differs from declared Content-Length")
        return SourceReceipt(
            url=url,
            status=200,
            content_type=normalised.get("content-type"),
            content_length=declared,
            bytes_received=len(body),
            sha256=hashlib.sha256(body).hexdigest(),
            raw=body,
        )
    finally:
        _close_quietly(response)


def _declared_length(value: str | None) -> int | None:
    """Parse Content-Length, refusing anything that is not plain digits."""
    if value is None:
        return None
    text = value.strip()
    if not text.isdigit():
        raise RefusedResponse("Content-Length is not a non-negative integer")
    return int(text)


def _read_body(response: MetadataResponse, budget: JobBudget) -> bytes:
    """Read the body with a remaining-budget check before every read.

    Reading exactly to a cap is refused rather than probed with one more byte,
    because that probe would itself exceed the cap for an oversized body.
    """
    limits = budget.limits
    chunks: list[bytes] = []
    received = 0
    while True:
        if budget.remaining_seconds() <= 0:
            raise BudgetExhausted("job deadline passed while reading the body")
        room = min(limits.per_response_bytes - received, budget.bytes_remaining())
        if room <= 0:
            raise RefusedResponse(
                "body reached the byte cap; end of body cannot be confirmed "
                "without reading past the cap"
            )
        try:
            requested = min(READ_CHUNK_BYTES, room)
            chunk = response.read(requested)
        except (OSError, http.client.HTTPException) as exc:
            raise TransportFailure(
                f"transport failed while reading the body: {type(exc).__name__}"
            ) from exc
        budget.charge(len(chunk))
        received += len(chunk)
        if len(chunk) > requested:
            raise RefusedResponse("transport returned more bytes than requested")
        if budget.remaining_seconds() <= 0:
            raise BudgetExhausted("job deadline passed during the body read")
        if not chunk:
            break
        chunks.append(chunk)
    return b"".join(chunks)


def _close_quietly(response: MetadataResponse) -> None:
    """Release the response; a close failure cannot invalidate a receipt."""
    try:
        response.close()
    except (OSError, http.client.HTTPException):
        return


def _parse_payload(receipt: SourceReceipt) -> Mapping[str, object]:
    """Parse already-bounded bytes as one JSON object."""
    try:
        payload: object = json.loads(receipt.raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise RefusedMetadata(
            f"metadata body is not UTF-8 JSON: {type(exc).__name__}"
        ) from exc
    if not isinstance(payload, dict):
        raise RefusedMetadata("metadata body is not a JSON object")
    return cast(Mapping[str, object], payload)


def _normalize_name(name: str) -> str:
    """Normalise a project name the way PyPI treats equivalent spellings."""
    return re.sub(r"[-_.]+", "-", name).lower()


def _verify_identity(
    payload: Mapping[str, object], project: str, version: str
) -> str:
    """Refuse a document whose declared name or version differs from the request."""
    info = payload.get("info")
    if not isinstance(info, Mapping):
        raise RefusedMetadata("metadata body has no info object")
    name = info.get("name")
    reported_version = info.get("version")
    if not isinstance(name, str) or not isinstance(reported_version, str):
        raise RefusedMetadata("metadata info lacks name/version strings")
    if _normalize_name(name) != _normalize_name(project):
        raise RefusedMetadata("metadata name does not match the requested project")
    if reported_version != version:
        raise RefusedMetadata("metadata version does not match the requested version")
    return name
