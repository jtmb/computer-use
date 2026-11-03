"""Offline tests for bounded PyPI metadata acquisition.

Every test drives the real helper through a fake transport. No test opens a
socket, resolves a name, or reads a live response. Regression tests here encode
the two defects observed in the discarded scratch reader: it read a 64 KiB chunk
before checking the remaining budget, and it reset its counters per process so a
second run regained spent requests and bytes.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import ssl
import unittest
import urllib.request
from collections.abc import Mapping
from pathlib import Path
from unittest import mock

import document_metadata as metadata
from document_metadata import (
    AGGREGATE_LIMIT_BYTES,
    JOB_LIMITS,
    PER_RESPONSE_LIMIT_BYTES,
    REQUEST_LIMIT,
    BudgetExhausted,
    JobBudget,
    Limits,
    RefusedMetadata,
    RefusedResponse,
    RefusedURL,
    TransportFailure,
    acquire_release_metadata,
    metadata_url,
)


class FakeResponse:
    """Deterministic in-memory response that records every requested size."""

    def __init__(
        self,
        body: bytes = b"",
        *,
        status: int = 200,
        headers: Mapping[str, str] | None = None,
        fail_after_bytes: int | None = None,
        ignore_read_size: bool = False,
        slice_bytes: int | None = None,
        url_override: str | None = None,
    ) -> None:
        """Prepare one response body and its framing metadata."""
        self.status = status
        self.headers = dict(headers or {})
        self.url = url_override or ""
        self.closed = False
        self.requested: list[int] = []
        self._body = body
        self._position = 0
        self._fail_after = fail_after_bytes
        self._ignore_size = ignore_read_size
        self._slice = slice_bytes

    def read(self, size: int) -> bytes:
        """Return up to ``size`` bytes, aborting after the configured offset."""
        if size <= 0:
            raise AssertionError("helper read without a positive remaining budget")
        self.requested.append(size)
        if self._fail_after is not None and self._position >= self._fail_after:
            raise OSError("simulated transport abort")
        remaining = self._body[self._position :]
        if self._ignore_size:
            chunk = remaining
        else:
            limit = size if self._slice is None else min(size, self._slice)
            chunk = remaining[:limit]
        self._position += len(chunk)
        return chunk

    def geturl(self) -> str:
        """Return the URL this fake claims to have served."""
        return self.url

    def close(self) -> None:
        """Record the close call."""
        self.closed = True


class FakeTransport:
    """Serve prepared responses or prepared errors without any I/O."""

    def __init__(self, *items: FakeResponse | BaseException) -> None:
        """Queue responses/errors in call order."""
        self._items = list(items)
        self.calls: list[tuple[str, float]] = []
        self.observed_requests: list[int] = []
        self._budget: JobBudget | None = None

    def open(self, url: str, *, timeout: float) -> FakeResponse:
        """Record the call and return the next prepared item."""
        self.calls.append((url, timeout))
        used = 0 if self._budget is None else self._budget.requests_used
        self.observed_requests.append(used)
        item = self._items.pop(0)
        if isinstance(item, BaseException):
            raise item
        item.url = item.url or url
        return item

    def watch(self, budget: JobBudget) -> "FakeTransport":
        """Observe the shared budget at the moment of each open call."""
        self._budget = budget
        return self


class StepClock:
    """Return scripted monotonic readings, repeating the final value."""

    def __init__(self, *values: float) -> None:
        """Store the scripted readings."""
        self._values = list(values)

    def __call__(self) -> float:
        """Return the next reading without sleeping."""
        if not self._values:
            raise AssertionError("clock was read more often than scripted")
        if len(self._values) == 1:
            return self._values[0]
        return self._values.pop(0)


def document(name: str = "demo-project", version: str = "1.2.3") -> bytes:
    """Return one minimal release document with the requested identity."""
    payload = {
        "info": {"name": name, "version": version},
        "urls": [{"filename": f"{name}-{version}.tar.gz"}],
    }
    return json.dumps(payload, sort_keys=True).encode("utf-8")


class DocumentMetadataTests(unittest.TestCase):
    """Boundary checks for the shared budget, framing and identity rules."""

    def test_success_returns_verified_identity_and_raw_receipt(self) -> None:
        """A verifiable document yields identity, projection and raw bytes."""
        body = document("Demo-Project", "1.2.3")
        response = FakeResponse(
            body,
            headers={
                "Content-Length": str(len(body)),
                "Content-Type": "application/json",
            },
        )
        budget = JobBudget()
        result = acquire_release_metadata(
            "demo_project", "1.2.3", budget=budget, transport=FakeTransport(response)
        )

        self.assertEqual(result.name, "Demo-Project")
        self.assertEqual(result.version, "1.2.3")
        self.assertEqual(result.info["version"], "1.2.3")
        self.assertEqual(result.source.raw, body)
        self.assertEqual(result.source.bytes_received, len(body))
        self.assertEqual(result.source.content_type, "application/json")
        self.assertEqual(result.source.content_length, len(body))
        self.assertTrue(response.closed)
        self.assertEqual(budget.requests_used, 1)
        self.assertEqual(budget.bytes_used, len(body))

    def test_receipt_digest_covers_retained_raw_bytes(self) -> None:
        """The receipt digest is auditable against the stored body."""
        body = document()
        result = acquire_release_metadata(
            "demo-project",
            "1.2.3",
            budget=JobBudget(),
            transport=FakeTransport(FakeResponse(body)),
        )

        self.assertEqual(
            result.source.sha256, hashlib.sha256(body).hexdigest()
        )
        self.assertIsNone(result.source.content_length)
        self.assertEqual(
            result.source.sha256,
            hashlib.sha256(result.source.raw).hexdigest(),
        )
        self.assertEqual(result.source.as_receipt()["sha256"], result.source.sha256)

    def test_request_is_reserved_before_open_with_bounded_timeout(self) -> None:
        """The transport observes an already-reserved request and a fixed timeout."""
        budget = JobBudget(
            Limits(
                per_response_bytes=1024,
                aggregate_bytes=4096,
                requests=1,
                socket_timeout_seconds=2.5,
                deadline_seconds=30.0,
            )
        )
        transport = FakeTransport(FakeResponse(document())).watch(budget)
        acquire_release_metadata(
            "demo-project", "1.2.3", budget=budget, transport=transport
        )

        self.assertEqual(transport.observed_requests, [1])
        expected = (metadata_url("demo-project", "1.2.3"), 2.5)
        self.assertEqual(transport.calls, [expected])

    def test_transport_open_failure_consumes_request_without_retry(self) -> None:
        """A failed open is charged once and never retried."""
        budget = JobBudget()
        transport = FakeTransport(OSError("connection refused"))

        with self.assertRaises(TransportFailure):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=budget, transport=transport
            )

        self.assertEqual(len(transport.calls), 1)
        self.assertEqual(budget.requests_used, 1)
        self.assertEqual(budget.bytes_used, 0)

    def test_regression_budget_is_shared_and_not_reset_per_call(self) -> None:
        """A spent request limit stays spent on later calls in the same job."""
        budget = JobBudget(
            Limits(per_response_bytes=1024, aggregate_bytes=4096, requests=2)
        )
        transport = FakeTransport(
            FakeResponse(document()),
            FakeResponse(document()),
            FakeResponse(document()),
        )

        for _ in range(2):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=budget, transport=transport
            )
        with self.assertRaises(BudgetExhausted):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=budget, transport=transport
            )

        self.assertEqual(len(transport.calls), 2)
        self.assertEqual(budget.requests_used, 2)

    def test_regression_reads_are_bounded_before_each_read(self) -> None:
        """No read is issued beyond the remaining aggregate or response budget."""
        budget = JobBudget(
            Limits(per_response_bytes=64, aggregate_bytes=10, requests=1)
        )
        response = FakeResponse(b"x" * 40)
        transport = FakeTransport(response)

        with self.assertRaises(RefusedResponse):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=budget, transport=transport
            )

        self.assertEqual(response.requested, [10])
        self.assertEqual(budget.bytes_used, 10)

    def test_per_response_cap_refuses_before_one_more_read(self) -> None:
        """Reaching the per-response cap refuses without probing for EOF."""
        budget = JobBudget(
            Limits(per_response_bytes=16, aggregate_bytes=1000, requests=1)
        )
        response = FakeResponse(b"x" * 100)
        transport = FakeTransport(response)

        with self.assertRaises(RefusedResponse):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=budget, transport=transport
            )

        self.assertEqual(response.requested, [16])
        self.assertEqual(budget.bytes_used, 16)

    def test_exact_cap_body_is_refused_without_reading_past_it(self) -> None:
        """A body exactly at the cap is ambiguous and therefore fail-closed."""
        budget = JobBudget(
            Limits(per_response_bytes=8, aggregate_bytes=64, requests=1)
        )
        response = FakeResponse(b"12345678")
        transport = FakeTransport(response)

        with self.assertRaises(RefusedResponse):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=budget, transport=transport
            )

        self.assertEqual(response.requested, [8])
        self.assertEqual(budget.bytes_used, 8)

    def test_declared_length_at_cap_is_refused_before_body(self) -> None:
        """Content-Length equal to the effective cap cannot prove completeness."""
        budget = JobBudget(
            Limits(per_response_bytes=8, aggregate_bytes=100, requests=1)
        )
        response = FakeResponse(b"12345678", headers={"Content-Length": "8"})
        transport = FakeTransport(response)

        with self.assertRaises(RefusedResponse):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=budget, transport=transport
            )

        self.assertEqual(response.requested, [])
        self.assertEqual(budget.bytes_used, 0)

    def test_declared_length_over_cap_is_refused_before_body(self) -> None:
        """An oversized Content-Length is rejected against the per-response cap."""
        budget = JobBudget(
            Limits(per_response_bytes=8, aggregate_bytes=100, requests=1)
        )
        response = FakeResponse(b"ignored", headers={"Content-Length": "9"})
        transport = FakeTransport(response)

        with self.assertRaises(RefusedResponse):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=budget, transport=transport
            )

        self.assertEqual(response.requested, [])

    def test_declared_length_over_aggregate_remaining_is_refused_before_body(
        self,
    ) -> None:
        """An oversized Content-Length is rejected against the aggregate too."""
        budget = JobBudget(
            Limits(per_response_bytes=64, aggregate_bytes=10, requests=1)
        )
        response = FakeResponse(b"ignored", headers={"Content-Length": "11"})
        transport = FakeTransport(response)

        with self.assertRaises(RefusedResponse):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=budget, transport=transport
            )

        self.assertEqual(response.requested, [])
        self.assertEqual(budget.bytes_used, 0)

    def test_aggregate_exhaustion_survives_write_off_of_first_body(self) -> None:
        """Bytes from a failed first response still reduce the shared aggregate."""
        budget = JobBudget(
            Limits(per_response_bytes=8, aggregate_bytes=10, requests=5)
        )
        first = FakeResponse(b"123456")
        second = FakeResponse(b"abcdefgh")
        transport = FakeTransport(first, second)

        with self.assertRaises(RefusedMetadata):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=budget, transport=transport
            )
        self.assertEqual(budget.bytes_used, 6)

        with self.assertRaises(RefusedResponse):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=budget, transport=transport
            )

        self.assertEqual(second.requested, [4])
        self.assertEqual(budget.bytes_used, 10)

    def test_partial_body_failure_keeps_bytes_and_request_charged(self) -> None:
        """A mid-body transport abort charges every byte already acquired."""
        budget = JobBudget(
            Limits(per_response_bytes=64, aggregate_bytes=64, requests=1)
        )
        response = FakeResponse(
            b"x" * 20, fail_after_bytes=6, slice_bytes=6
        )
        transport = FakeTransport(response)

        with self.assertRaises(TransportFailure):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=budget, transport=transport
            )

        self.assertEqual(budget.bytes_used, 6)
        self.assertEqual(budget.requests_used, 1)
        self.assertEqual(response.requested, [64, 58])

        with self.assertRaises(BudgetExhausted):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=budget, transport=transport
            )

        self.assertEqual(len(transport.calls), 1)

    def test_failed_identity_check_still_consumes_the_shared_budget(self) -> None:
        """A wrong-identity document is charged exactly like a success."""
        body = document("other-project", "1.2.3")
        budget = JobBudget(
            Limits(per_response_bytes=1024, aggregate_bytes=4096, requests=1)
        )
        transport = FakeTransport(FakeResponse(body))

        with self.assertRaises(RefusedMetadata):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=budget, transport=transport
            )

        self.assertEqual(budget.bytes_used, len(body))
        self.assertEqual(budget.requests_used, 1)

    def test_deadline_before_request_refuses_without_opening(self) -> None:
        """An expired cooperative deadline stops the call before any open."""
        budget = JobBudget(
            Limits(deadline_seconds=10.0),
            clock=StepClock(0.0, 20.0),
        )
        transport = FakeTransport(FakeResponse(document()))

        with self.assertRaises(BudgetExhausted):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=budget, transport=transport
            )

        self.assertEqual(transport.calls, [])
        self.assertEqual(budget.requests_used, 0)

    def test_deadline_during_body_read_keeps_partial_bytes(self) -> None:
        """The deadline is checked before each read and partial bytes are kept."""
        budget = JobBudget(
            Limits(
                per_response_bytes=64,
                aggregate_bytes=64,
                requests=1,
                deadline_seconds=10.0,
            ),
            clock=StepClock(0.0, 0.0, 0.0, 100.0),
        )
        response = FakeResponse(b"x" * 20, slice_bytes=6)
        transport = FakeTransport(response)

        with self.assertRaises(BudgetExhausted):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=budget, transport=transport
            )

        self.assertEqual(budget.bytes_used, 6)
        self.assertEqual(response.requested, [64])

    def test_response_url_mismatch_is_refused_before_body(self) -> None:
        """A response served from another URL is refused before reading."""
        response = FakeResponse(
            document(), url_override="https://pypi.org/pypi/other/1.2.3/json"
        )
        transport = FakeTransport(response)

        with self.assertRaises(RefusedResponse):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=JobBudget(), transport=transport
            )

        self.assertEqual(response.requested, [])

    def test_non_200_status_is_refused_before_body(self) -> None:
        """A redirect or error status is refused rather than read."""
        response = FakeResponse(document(), status=302)
        transport = FakeTransport(response)

        with self.assertRaises(RefusedResponse):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=JobBudget(), transport=transport
            )

        self.assertEqual(response.requested, [])

    def test_non_numeric_content_length_is_refused_before_body(self) -> None:
        """Ambiguous framing such as duplicate lengths is refused."""
        response = FakeResponse(
            document(), headers={"Content-Length": "88, 88"}
        )
        transport = FakeTransport(response)

        with self.assertRaises(RefusedResponse):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=JobBudget(), transport=transport
            )

        self.assertEqual(response.requested, [])

    def test_transport_over_return_is_charged_and_refused(self) -> None:
        """Bytes a transport returns past the request are charged, then refused."""
        budget = JobBudget(
            Limits(per_response_bytes=64, aggregate_bytes=64, requests=1)
        )
        response = FakeResponse(b"x" * 200, ignore_read_size=True)
        transport = FakeTransport(response)

        with self.assertRaises(RefusedResponse):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=budget, transport=transport
            )

        self.assertEqual(budget.bytes_used, 200)

    def test_wrong_name_and_version_are_refused(self) -> None:
        """Both name and version must match the exact requested release."""
        for body in (document("other-project"), document(version="9.9.9")):
            with self.subTest(body=body):
                with self.assertRaises(RefusedMetadata):
                    acquire_release_metadata(
                        "demo-project",
                        "1.2.3",
                        budget=JobBudget(),
                        transport=FakeTransport(FakeResponse(body)),
                    )

    def test_malformed_json_is_refused(self) -> None:
        """Non-JSON and non-UTF-8 bodies are refused after bounded acquisition."""
        for body in (b"{not json", b"\xff\xfe\x00", b"[]"):
            with self.subTest(body=body):
                with self.assertRaises(RefusedMetadata):
                    acquire_release_metadata(
                        "demo-project",
                        "1.2.3",
                        budget=JobBudget(),
                        transport=FakeTransport(FakeResponse(body)),
                    )

    def test_metadata_url_refuses_unsafe_identifiers(self) -> None:
        """No identifier may alter the host, path, query or credentials."""
        cases = [
            ("demo/evil", "1.2.3"),
            ("demo", "1.2.3?x=1"),
            ("demo#fragment", "1.2.3"),
            ("demo@evil.example", "1.2.3"),
            ("..", "1.2.3"),
            ("demo", "1.2.3/../9.9.9"),
            ("demo\n", "1.2.3"),
            ("x" * 129, "1.2.3"),
            (123, "1.2.3"),
            ("demo", ""),
        ]
        for project, version in cases:
            with self.subTest(project=project, version=version):
                with self.assertRaises(RefusedURL):
                    metadata_url(project, version)

    def test_redirect_handler_refuses_instead_of_following(self) -> None:
        """The default opener's redirect hook raises rather than returns a request."""
        handler = metadata.RedirectRefusalHandler()
        request = urllib.request.Request(metadata_url("demo-project", "1.2.3"))

        with self.assertRaises(RefusedResponse):
            handler.redirect_request(
                request,
                None,
                301,
                "Moved Permanently",
                {},
                "https://example.com/pypi/demo-project/1.2.3/json",
            )

    def test_real_transport_refuses_foreign_url_without_opening(self) -> None:
        """URL policy runs before any connection attempt."""
        transport = metadata.UrllibTransport()
        with mock.patch.object(transport, "_opener") as opener:
            with self.assertRaises(RefusedURL):
                transport.open(
                    "https://example.com/pypi/demo-project/1.2.3/json", timeout=1.0
                )
        opener.open.assert_not_called()

    def test_real_transport_refusal_does_not_echo_credentials(self) -> None:
        """Credentialed URLs are refused without repeating the secret."""
        transport = metadata.UrllibTransport()
        secret = "top-secret-token"

        with mock.patch.object(transport, "_opener") as opener:
            with self.assertRaises(RefusedURL) as raised:
                transport.open(
                    f"https://user:{secret}@pypi.org/pypi/demo/1.2.3/json",
                    timeout=1.0,
                )

        self.assertNotIn(secret, str(raised.exception))
        opener.open.assert_not_called()

    def test_transport_does_not_weaken_tls_verification(self) -> None:
        """The default transport builds a required-verification HTTPS handler."""
        with mock.patch.object(urllib.request, "build_opener") as builder:
            builder.return_value = mock.Mock()
            metadata.UrllibTransport()

        handlers = builder.call_args.args
        https_handlers = [
            handler
            for handler in handlers
            if isinstance(handler, urllib.request.HTTPSHandler)
        ]
        redirect_handlers = [
            handler
            for handler in handlers
            if isinstance(handler, metadata.RedirectRefusalHandler)
        ]

        self.assertEqual(len(https_handlers), 1)
        self.assertEqual(len(redirect_handlers), 1)
        context = getattr(https_handlers[0], "_context", None)
        self.assertIsNotNone(context)
        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(context.check_hostname)

    def test_module_source_contains_no_tls_or_cap_escape_hatch(self) -> None:
        """No source-level switch disables verification or adds a CLI override."""
        source = Path(metadata.__file__).read_text(encoding="utf-8")

        for forbidden in (
            "CERT_NONE",
            "check_hostname = False",
            "check_hostname=False",
            "_create_unverified_context",
            "import argparse",
            "os.environ",
        ):
            self.assertNotIn(forbidden, source)

    def test_fixed_limits_match_the_approved_job_budget(self) -> None:
        """The shipped limits are the approved values and cannot be reassigned."""
        self.assertEqual(PER_RESPONSE_LIMIT_BYTES, 2 * 1024 * 1024)
        self.assertEqual(AGGREGATE_LIMIT_BYTES, 10 * 1024 * 1024)
        self.assertEqual(REQUEST_LIMIT, 12)
        self.assertEqual(JOB_LIMITS, Limits())
        self.assertEqual(JOB_LIMITS.per_response_bytes, 2 * 1024 * 1024)
        self.assertEqual(JOB_LIMITS.aggregate_bytes, 10 * 1024 * 1024)
        self.assertEqual(JOB_LIMITS.requests, 12)

        with self.assertRaises(dataclasses.FrozenInstanceError):
            setattr(JOB_LIMITS, "requests", 99)

    def test_budget_exposes_no_reset_or_cap_raise_path(self) -> None:
        """A job budget has accounting only: no reset and no limit mutation."""
        budget = JobBudget()

        self.assertFalse(hasattr(budget, "reset"))
        self.assertFalse(hasattr(budget, "raise_limits"))
        self.assertFalse(hasattr(metadata, "main"))

    def test_budget_rejects_larger_or_invalid_limits_and_reassignment(self) -> None:
        """The test seam can reduce limits, not expand or replace the job policy."""
        for changes in (
            {"requests": REQUEST_LIMIT + 1},
            {"per_response_bytes": PER_RESPONSE_LIMIT_BYTES + 1},
            {"aggregate_bytes": AGGREGATE_LIMIT_BYTES + 1},
            {"socket_timeout_seconds": 6},
            {"deadline_seconds": 61},
            {"requests": 0},
            {"requests": True},
            {"deadline_seconds": float("nan")},
        ):
            with self.subTest(changes=changes):
                with self.assertRaises(ValueError):
                    JobBudget(Limits(**changes))
        budget = JobBudget()
        with self.assertRaises(AttributeError):
            budget.limits = Limits(requests=1)

    def test_deadline_crossed_by_eof_is_not_success(self) -> None:
        """A late EOF must not bypass the cooperative deadline check."""
        clock = [0.0]

        class LateEOF(FakeResponse):
            def read(self, size: int) -> bytes:
                chunk = super().read(size)
                if not chunk:
                    clock[0] = 61.0
                return chunk

        budget = JobBudget(clock=lambda: clock[0])
        response = LateEOF(document())
        with self.assertRaises(BudgetExhausted):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=budget,
                transport=FakeTransport(response),
            )
        self.assertEqual(budget.bytes_used, len(document()))

    def test_declared_length_must_equal_the_acquired_body(self) -> None:
        """Valid JSON is not enough to accept a truncated or overlong frame."""
        body = document()
        for declared in (len(body) - 1, len(body) + 1):
            with self.subTest(declared=declared):
                response = FakeResponse(
                    body, headers={"Content-Length": str(declared)},
                )
                with self.assertRaises(RefusedResponse):
                    acquire_release_metadata(
                        "demo-project", "1.2.3", budget=JobBudget(),
                        transport=FakeTransport(response),
                    )

    def test_over_return_is_compared_with_requested_chunk_not_entire_budget(
        self,
    ) -> None:
        """A transport may violate read(size) while staying under the total cap."""
        response = FakeResponse(
            document() + b" " * metadata.READ_CHUNK_BYTES,
            ignore_read_size=True,
        )
        budget = JobBudget()
        with self.assertRaises(RefusedResponse):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=budget,
                transport=FakeTransport(response),
            )
        self.assertGreater(budget.bytes_used, metadata.READ_CHUNK_BYTES)

    def test_utf16_json_does_not_pass_the_utf8_metadata_contract(self) -> None:
        """json.loads byte autodetection must not silently change the encoding."""
        response = FakeResponse(document().decode("utf-8").encode("utf-16"))
        with self.assertRaises(RefusedMetadata):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=JobBudget(),
                transport=FakeTransport(response),
            )

    def test_spent_aggregate_prevents_a_further_open(self) -> None:
        """There is no reason to open another response after the byte budget ends."""
        budget = JobBudget()
        budget.charge(AGGREGATE_LIMIT_BYTES)
        transport = FakeTransport(FakeResponse(document()))
        with self.assertRaises(BudgetExhausted):
            acquire_release_metadata(
                "demo-project", "1.2.3", budget=budget, transport=transport,
            )
        self.assertEqual(transport.calls, [])

    def test_transport_refuses_non_exact_release_paths(self) -> None:
        """Safe host spelling alone does not authorize another PyPI resource."""
        transport = metadata.UrllibTransport()
        for url in (
            "https://pypi.org/pypi/demo/1.2.3/extra/json",
            "https://pypi.org/pypi/../1.2.3/json",
            "https://pypi.org/pypi/demo//json",
        ):
            with self.subTest(url=url):
                with mock.patch.object(transport, "_opener") as opener:
                    with self.assertRaises(RefusedURL):
                        transport.open(url, timeout=1.0)
                    opener.open.assert_not_called()

    def test_shared_job_refuses_overlapping_acquisitions(self) -> None:
        """Two bodies cannot independently reserve the same remaining bytes."""
        budget = JobBudget()
        inner = FakeTransport(FakeResponse(document()))
        outcomes = []

        class OverlappingTransport(FakeTransport):
            def open(self, url: str, *, timeout: float) -> FakeResponse:
                try:
                    acquire_release_metadata(
                        "demo-project", "1.2.3", budget=budget, transport=inner,
                    )
                except metadata.MetadataError:
                    outcomes.append("refused")
                return super().open(url, timeout=timeout)

        acquire_release_metadata(
            "demo-project", "1.2.3", budget=budget,
            transport=OverlappingTransport(FakeResponse(document())),
        )
        self.assertEqual(outcomes, ["refused"])
        self.assertEqual(inner.calls, [])
        self.assertEqual(budget.requests_used, 1)

    def test_identity_errors_do_not_echo_untrusted_metadata(self) -> None:
        """A registry field must not become an unbounded exception/log payload."""
        for body in (
            document(name="untrusted-" + "x" * 100_000),
            document(version="untrusted-" + "x" * 100_000),
        ):
            with self.subTest(field=body[:40]):
                with self.assertRaises(RefusedMetadata) as raised:
                    acquire_release_metadata(
                        "demo-project", "1.2.3", budget=JobBudget(),
                        transport=FakeTransport(FakeResponse(body)),
                    )
                self.assertLess(len(str(raised.exception)), 256)
                self.assertNotIn("untrusted-", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
