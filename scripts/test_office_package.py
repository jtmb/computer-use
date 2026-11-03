"""Exercise real ZIP inputs and read-only Office package boundaries."""

import hashlib
import io
import json
import os
import stat
import struct
import subprocess
import sys
import tempfile
import unittest
import warnings
import zipfile
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

from office_package import (
    CENTRAL,
    DEFAULT_LIMITS,
    END,
    PackageRefused,
    inspect_package,
    read_member,
)


class OfficePackageTests(unittest.TestCase):
    """Use only synthetic archives in a session-approved private scratch root."""

    def setUp(self) -> None:
        """Create one isolated scratch directory for each test."""
        scratch = Path("/tmp/opencode")
        try:
            scratch.mkdir(mode=0o700)
        except FileExistsError:
            self.assertTrue(stat.S_ISDIR(scratch.lstat().st_mode))
        self.temporary = tempfile.TemporaryDirectory(
            prefix="office-package-", dir=scratch
        )
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def package(
        self,
        entries: list[tuple[str | zipfile.ZipInfo, bytes]] | None = None,
        name: str = "sample.docx",
        compression: int = zipfile.ZIP_STORED,
    ) -> Path:
        """Create exactly the synthetic package selected by the test."""
        target = self.root / name
        values = (
            entries
            if entries is not None
            else [
                ("[Content_Types].xml", b"<Types/>"),
                ("_rels/.rels", b"<Relationships/>"),
                ("word/document.xml", "<document>Unicode café</document>".encode()),
                ("word/footnotes.xml", b"<footnotes/>"),
                ("word/comments.xml", b"<comments/>"),
            ]
        )
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with zipfile.ZipFile(target, "w", compression=compression) as archive:
                for member, value in values:
                    archive.writestr(member, value)
        return target

    def test_inventory_preserves_source_without_safety_promotion(self) -> None:
        """Metadata inspection neither writes nor promotes uninspected layers."""
        source = self.package()
        before = source.stat()
        original = source.read_bytes()
        result = inspect_package(source)
        self.assertEqual(result["kind"], "docx")
        self.assertEqual(result["source_sha256"], hashlib.sha256(original).hexdigest())
        self.assertEqual(result["entries"], 5)
        self.assertFalse(result["xml_inspected"])
        self.assertFalse(result["payloads_verified"])
        self.assertFalse(result["safe_to_render"])
        self.assertFalse(result["authoring_ready"])
        self.assertEqual(source.read_bytes(), original)
        self.assertEqual(source.stat().st_mtime_ns, before.st_mtime_ns)
        self.assertEqual(source.stat().st_ino, before.st_ino)
        self.assertEqual(list(self.root.iterdir()), [source])

    def test_exact_member_reads_are_bounded_and_do_not_parse_entities(self) -> None:
        """Even active XML-looking bytes remain uninterpreted data."""
        payload = b'<!DOCTYPE x [<!ENTITY x SYSTEM "file:///not-read">]><x>&x;</x>'
        source = self.package(
            [("part.xml", payload)], name="sample.zip", compression=zipfile.ZIP_DEFLATED
        )
        self.assertEqual(read_member(source, "part.xml"), payload)
        with self.assertRaisesRegex(PackageRefused, "read budget"):
            read_member(source, "part.xml", max_bytes=10)
        with self.assertRaisesRegex(PackageRefused, "absent"):
            read_member(source, "different.xml")

    def test_directory_limits_precede_zipfile_construction(self) -> None:
        """Directory acquisition is refused before the library allocates metadata."""
        source = self.package()
        for limits in [
            replace(DEFAULT_LIMITS, archive_bytes=10),
            replace(DEFAULT_LIMITS, directory_bytes=10),
            replace(DEFAULT_LIMITS, entries=1),
        ]:
            with (
                self.subTest(limits=limits),
                patch(
                    "office_package.zipfile.ZipFile",
                    side_effect=AssertionError("must not construct"),
                ),
                self.assertRaises(PackageRefused),
            ):
                inspect_package(source, limits)

    def test_traversal_controls_aliases_and_duplicate_destinations_refuse(self) -> None:
        """Unsafe member names never become extraction or exact-read candidates."""
        for index, name in enumerate(
            [
                "../outside",
                "/absolute",
                "C:/outside",
                "word\\outside",
                "word//part",
                "word/./part",
                "word/../part",
                "word/part.",
                "word/\npart",
            ]
        ):
            source = self.package([(name, b"x")], name=f"bad-{index}.zip")
            with self.subTest(name=name), self.assertRaises(PackageRefused):
                inspect_package(source)
        for index, names in enumerate(
            [
                ["part.xml", "part.xml"],
                ["PART.xml", "part.xml"],
                ["café.xml", "cafe\u0301.xml"],
                ["word", "word/part.xml"],
            ]
        ):
            source = self.package(
                [(name, b"x") for name in names], name=f"collision-{index}.zip"
            )
            with (
                self.subTest(names=names),
                self.assertRaisesRegex(PackageRefused, "collision"),
            ):
                inspect_package(source)

    def test_embedded_nul_is_rejected_before_zipfile_truncates_the_name(self) -> None:
        """Raw central names, not only ZipInfo.filename, are checked."""
        source = self.package([("part.xml", b"x")], name="nul.zip")
        source.write_bytes(source.read_bytes().replace(b"part.xml", b"part\x00xml"))
        with self.assertRaisesRegex(PackageRefused, "Control"):
            inspect_package(source)

    def test_symlink_fifo_and_source_links_refuse(self) -> None:
        """Only regular source files and regular/directory members are supported."""
        for index, mode in enumerate([stat.S_IFLNK | 0o777, stat.S_IFIFO | 0o600]):
            member = zipfile.ZipInfo("unsafe")
            member.create_system = 3
            member.external_attr = mode << 16
            source = self.package([(member, b"target")], name=f"mode-{index}.zip")
            with self.assertRaisesRegex(PackageRefused, "special-file"):
                inspect_package(source)
        regular = self.package()
        link = self.root / "link.docx"
        link.symlink_to(regular)
        with self.assertRaises(OSError):
            inspect_package(link)
        fifo = self.root / "input.docx"
        os.mkfifo(fifo)
        with self.assertRaisesRegex(PackageRefused, "regular"):
            inspect_package(fifo)

    def test_expansion_and_selected_member_budgets_refuse(self) -> None:
        """Declared member/total/ratio bounds remain separate checks."""
        source = self.package(
            [("part.xml", b"a" * 4096)],
            name="ratio.zip",
            compression=zipfile.ZIP_DEFLATED,
        )
        with self.assertRaisesRegex(PackageRefused, "expansion"):
            inspect_package(source)
        source = self.package([("part.xml", bytes(range(256)))], name="size.zip")
        for limits in [
            replace(DEFAULT_LIMITS, member_bytes=100),
            replace(DEFAULT_LIMITS, total_bytes=100),
        ]:
            with self.assertRaisesRegex(PackageRefused, "expansion"):
                inspect_package(source, limits)
        for budget in [0, DEFAULT_LIMITS.read_bytes + 1]:
            with self.assertRaisesRegex(PackageRefused, "budget"):
                read_member(source, "part.xml", max_bytes=budget)

    def test_hard_read_limit_rejects_transport_bytes_beyond_declared_size(self) -> None:
        """The acquisition guard checks actual bytes, not only directory claims."""
        source = self.package([("part.xml", b"x")], name="read.zip")
        with (
            patch.object(
                zipfile.ZipFile, "open", return_value=io.BytesIO(b"oversized")
            ),
            self.assertRaisesRegex(PackageRefused, "hard decompression"),
        ):
            read_member(source, "part.xml", max_bytes=4)

    def test_malformed_envelopes_encryption_and_codecs_refuse(self) -> None:
        """Unsupported archive envelopes and codecs are not parsed permissively."""
        original = self.package([("part.xml", b"x")], name="original.zip").read_bytes()
        for index, change in enumerate(
            [
                "trailing",
                "count",
                "zip64",
                "multidisk",
                "encrypted",
                "method",
                "local-name",
            ]
        ):
            data = bytearray(original)
            end = data.rfind(b"PK\x05\x06")
            central = data.index(b"PK\x01\x02")
            if change == "trailing":
                data.extend(b"trailing")
            elif change in {"count", "zip64", "multidisk"}:
                fields = list(END.unpack_from(data, end))
                if change == "count":
                    fields[3] = fields[4] = 2
                if change == "zip64":
                    fields[4] = 65535
                if change == "multidisk":
                    fields[1] = 1
                END.pack_into(data, end, *fields)
            elif change in {"encrypted", "method"}:
                fields = list(CENTRAL.unpack_from(data, central))
                fields[3 if change == "encrypted" else 4] = (
                    1 if change == "encrypted" else 12
                )
                CENTRAL.pack_into(data, central, *fields)
            else:
                data[30] = ord("X")
            source = self.root / f"malformed-{index}.zip"
            source.write_bytes(data)
            with self.subTest(change=change), self.assertRaises(PackageRefused):
                inspect_package(source)

    def test_source_replacement_or_mutation_during_read_refuses(self) -> None:
        """A held descriptor cannot turn path replacement into a successful read."""
        original = zipfile.ZipFile.namelist
        for replace_path in [False, True]:
            source = self.package(name=f"change-{replace_path}.docx")

            def interference(
                archive: zipfile.ZipFile,
                source: Path = source,
                replace_path: bool = replace_path,
            ) -> list[str]:
                """Apply one real filesystem race after the library opens the ZIP."""
                names = original(archive)
                if replace_path:
                    moved = source.with_suffix(".old")
                    source.rename(moved)
                    source.write_bytes(moved.read_bytes())
                else:
                    with source.open("ab") as changed:
                        changed.write(b"change")
                return names

            with (
                patch.object(zipfile.ZipFile, "namelist", interference),
                self.assertRaisesRegex(PackageRefused, "changed"),
            ):
                inspect_package(source)

    def test_deadline_and_office_main_part_mismatch_refuse(self) -> None:
        """Timed-out inspection and wrongly labelled ZIPs never become Office readiness."""
        source = self.package()
        with (
            patch("office_package.time.monotonic", side_effect=[0.0, 6.0]),
            self.assertRaisesRegex(PackageRefused, "deadline"),
        ):
            inspect_package(source)
        mismatch = self.package([("xl/workbook.xml", b"x")], name="wrong.docx")
        with self.assertRaisesRegex(PackageRefused, "missing or mismatched"):
            inspect_package(mismatch)

    def test_real_cli_emits_no_member_body_or_write_and_fails_closed(self) -> None:
        """The actual CLI is a bounded metadata reader, not an extraction wrapper."""
        source = self.package()
        command = [
            sys.executable,
            "-B",
            str(Path(__file__).with_name("office_package.py")),
        ]
        result = subprocess.run(
            [*command, str(source)], capture_output=True, check=False, timeout=10
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        self.assertEqual(output["status"], "inspected")
        self.assertNotIn(b"Unicode", result.stdout)
        self.assertEqual(list(self.root.iterdir()), [source])
        invalid = self.root / "invalid.docx"
        invalid.write_bytes(b"not a zip")
        result = subprocess.run(
            [*command, str(invalid)], capture_output=True, check=False, timeout=10
        )
        self.assertEqual(result.returncode, 2)
        self.assertEqual(json.loads(result.stdout)["status"], "refused")

    def test_hidden_zip64_locator_refuses_before_library(self) -> None:
        """A maximum ZIP comment must not hide a locator that changes library budgets."""
        source = self.package([("part.xml", b"x")], name="hidden-zip64.zip")
        data = bytearray(source.read_bytes())
        end = data.rfind(b"PK\x05\x06")
        central = data.index(b"PK\x01\x02")
        entry = list(CENTRAL.unpack_from(data, central))
        entry[12] = 20
        CENTRAL.pack_into(data, central, *entry)
        footer = list(END.unpack_from(data, end))
        footer[5] += 20
        footer[7] = 65535
        locator = struct.pack("<4sIQI", b"PK\x06\x07", 0, 0, 1)
        source.write_bytes(data[:end] + locator + END.pack(*footer) + b"x" * 65535)
        with (
            patch(
                "office_package.zipfile.ZipFile",
                side_effect=AssertionError("must not construct"),
            ),
            self.assertRaisesRegex(PackageRefused, "ZIP64"),
        ):
            inspect_package(source)

    def test_growing_source_hash_acquisition_has_a_hard_byte_limit(self) -> None:
        """Growth during inspection cannot turn the hash pass into an unbounded read."""
        source = self.package()
        limits = replace(DEFAULT_LIMITS, archive_bytes=source.stat().st_size + 10)
        original = zipfile.ZipFile.namelist

        def grow(archive: zipfile.ZipFile) -> list[str]:
            """Add real bytes after directory validation, before the source hash read."""
            names = original(archive)
            with source.open("ab") as output:
                output.write(b"x" * 2048)
            return names

        with (
            patch.object(zipfile.ZipFile, "namelist", grow),
            self.assertRaisesRegex(PackageRefused, "hard source read budget"),
        ):
            inspect_package(source, limits)

    def test_forced_small_zip64_member_refuses(self) -> None:
        """Unsupported ZIP64 local headers refuse even when the final directory is small."""
        source = self.root / "local-zip64.zip"
        with (
            zipfile.ZipFile(source, "w") as archive,
            archive.open("part.xml", "w", force_zip64=True) as stream,
        ):
            stream.write(b"x")
        with self.assertRaisesRegex(PackageRefused, "ZIP64"):
            inspect_package(source)

    def test_limits_cannot_be_disabled_with_nonfinite_or_larger_values(self) -> None:
        """The public reader cannot silently raise its hard default budgets."""
        source = self.package()
        for limits in [
            replace(DEFAULT_LIMITS, seconds=float("nan")),
            replace(DEFAULT_LIMITS, seconds=float("inf")),
            replace(DEFAULT_LIMITS, entries=0),
            replace(DEFAULT_LIMITS, entries=True),
            replace(DEFAULT_LIMITS, read_bytes=DEFAULT_LIMITS.read_bytes + 1),
        ]:
            with (
                self.subTest(limits=limits),
                self.assertRaisesRegex(PackageRefused, "limits"),
            ):
                inspect_package(source, limits)

    def test_streamed_descriptor_archives_and_xlsx_metadata_remain_usable(self) -> None:
        """A positive data-descriptor control prevents an overbroad header refusal."""

        class StreamingOutput(io.BytesIO):
            """Make ZipFile emit public streaming/data-descriptor records."""

            def seek(self, offset: int, whence: int = 0) -> int:
                """Disallow seek so the writer uses data descriptors."""
                raise OSError("stream is not seekable")

        output = StreamingOutput()
        payload = b"<workbook/>"
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name, value in [
                ("[Content_Types].xml", b"<Types/>"),
                ("_rels/.rels", b"<Relationships/>"),
                ("xl/workbook.xml", payload),
            ]:
                archive.writestr(name, value)
        source = self.root / "streamed.xlsx"
        source.write_bytes(output.getvalue())
        self.assertEqual(inspect_package(source)["kind"], "xlsx")
        self.assertEqual(read_member(source, "xl/workbook.xml"), payload)

    def test_invalid_directory_source_closes_its_held_descriptor(self) -> None:
        """Refusals before file-wrapper construction must not leak descriptors."""
        original = os.close
        closed: list[int] = []

        def close(descriptor: int) -> None:
            """Record and execute the real descriptor cleanup."""
            closed.append(descriptor)
            original(descriptor)

        with (
            patch("office_package.os.close", close),
            self.assertRaises((PackageRefused, OSError)),
        ):
            inspect_package(self.root)
        self.assertEqual(len(closed), 1)
        with self.assertRaises(OSError):
            os.fstat(closed[0])

    def test_overlapping_member_ranges_refuse_before_library(self) -> None:
        """A real nested local header cannot alias another member's compressed range."""
        inner = self.package([("inner.xml", b"payload")], name="inner.zip").read_bytes()
        local = inner[: inner.index(b"PK\x01\x02")]
        source = self.package(
            [("outer.bin", local), ("inner.xml", b"payload")], name="overlap.zip"
        )
        data = bytearray(source.read_bytes())
        first = data.index(b"PK\x01\x02")
        fields = CENTRAL.unpack_from(data, first)
        second = first + CENTRAL.size + sum(fields[10:13])
        alias = list(CENTRAL.unpack_from(data, second))
        alias[16] = 30 + len("outer.bin")
        CENTRAL.pack_into(data, second, *alias)
        source.write_bytes(data)
        with (
            patch(
                "office_package.zipfile.ZipFile",
                side_effect=AssertionError("must not construct"),
            ),
            self.assertRaisesRegex(PackageRefused, "Overlapping"),
        ):
            inspect_package(source)

    def test_selected_payload_crc_is_separate_from_metadata(self) -> None:
        """Directory success is not all-payload validation; selected reads check CRC."""
        source = self.package([("part.xml", b"payload")], name="crc.zip")
        data = bytearray(source.read_bytes())
        data[30 + len("part.xml")] = ord("X")
        source.write_bytes(data)
        self.assertFalse(inspect_package(source)["payloads_verified"])
        with self.assertRaises(zipfile.BadZipFile):
            read_member(source, "part.xml")


if __name__ == "__main__":
    unittest.main()
