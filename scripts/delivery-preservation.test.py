"""Exercise delivery-preservation against disposable real-file Git fixtures."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("delivery-preservation.py")


def sha256(data: bytes) -> str:
    """Return SHA-256 for fixture byte assertions."""
    return hashlib.sha256(data).hexdigest()


def git(root: Path, *arguments: str) -> str:
    """Run one Git fixture command in the disposable repository."""
    environment = os.environ.copy()
    environment.update(
        {
            "GIT_AUTHOR_NAME": "Delivery Fixture",
            "GIT_AUTHOR_EMAIL": "fixture@example.invalid",
            "GIT_COMMITTER_NAME": "Delivery Fixture",
            "GIT_COMMITTER_EMAIL": "fixture@example.invalid",
            "GIT_TERMINAL_PROMPT": "0",
        }
    )
    for name in (
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_INDEX_FILE",
        "GIT_COMMON_DIR",
        "GIT_OBJECT_DIRECTORY",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    ):
        environment.pop(name, None)
    result = subprocess.run(
        ["git", "-C", str(root), *arguments],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=environment,
        text=True,
    )
    return result.stdout.strip()


def run_cli(*arguments: str) -> tuple[int, dict[str, object], str]:
    """Run the auditor and decode its JSON report."""
    environment = os.environ.copy()
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    for name in (
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_INDEX_FILE",
        "GIT_COMMON_DIR",
        "GIT_OBJECT_DIRECTORY",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    ):
        environment.pop(name, None)
    result = subprocess.run(
        [sys.executable, "-B", str(SCRIPT), *arguments],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=environment,
        text=True,
    )
    report = json.loads(result.stdout) if result.stdout else {}
    return result.returncode, report, result.stderr


def make_repository(parent: Path) -> Path:
    """Create a committed main branch inside the test's temporary directory."""
    root = parent / "repo"
    root.mkdir()
    subprocess.run(["git", "init", "-q", "-b", "main", str(root)], check=True)
    (root / "tracked.txt").write_text("base\n", encoding="utf-8")
    git(root, "add", "tracked.txt")
    git(root, "commit", "-m", "fixture base")
    return root


def capture_baseline(root: Path, location: Path) -> dict[str, object]:
    """Capture a baseline to a file outside the temporary repository."""
    code, report, error = run_cli("capture", "--repo", str(root))
    if code != 0:
        raise AssertionError(f"capture failed: {error}")
    location.write_text(json.dumps(report), encoding="utf-8")
    return report


class DeliveryPreservationTests(unittest.TestCase):
    """Verify preservation, archive, and merge-proposal behavior end to end."""

    def test_capture_hashes_index_staged_patch_and_dirty_untracked_files_read_only(self) -> None:
        """Capture records staged scope and dirty bytes without changing Git state."""
        with tempfile.TemporaryDirectory(prefix="delivery-preservation-", dir="/tmp/opencode") as temporary:
            parent = Path(temporary)
            root = make_repository(parent)
            (root / "staged.bin").write_bytes(b"binary\x00payload")
            git(root, "add", "staged.bin")
            (root / "tracked.txt").write_text("modified in worktree\n", encoding="utf-8")
            (root / "src").mkdir()
            (root / "src" / "new.py").write_text("preserve me\n", encoding="utf-8")
            index_before = (root / ".git" / "index").read_bytes()
            head_before = git(root, "rev-parse", "HEAD")
            status_before = git(root, "status", "--porcelain=v2", "-z", "--untracked-files=all")

            code, report, error = run_cli("capture", "--repo", str(root))

            self.assertEqual((code, error), (0, ""))
            self.assertTrue(report["repository"]["head_is_git_commit"])
            self.assertEqual(report["repository"]["branch"], "main")
            self.assertEqual(report["git"]["status_count"], 3)
            self.assertNotEqual(report["git"]["staged_patch_sha256"], sha256(b""))
            self.assertEqual(
                report["git"]["worktree_files"]["src/new.py"]["sha256"],
                sha256(b"preserve me\n"),
            )
            self.assertEqual((root / ".git" / "index").read_bytes(), index_before)
            self.assertEqual(git(root, "rev-parse", "HEAD"), head_before)
            self.assertEqual(
                git(root, "status", "--porcelain=v2", "-z", "--untracked-files=all"),
                status_before,
            )

    def test_capture_disables_configured_fsmonitor_commands(self) -> None:
        """A repository fsmonitor hook cannot run as a side effect of capture."""
        with tempfile.TemporaryDirectory(prefix="delivery-preservation-", dir="/tmp/opencode") as temporary:
            parent = Path(temporary)
            root = make_repository(parent)
            marker = parent / "fsmonitor-was-run"
            hook = parent / "fsmonitor.py"
            hook.write_text(
                f"#!{sys.executable}\nfrom pathlib import Path\n"
                f"Path({str(marker)!r}).write_text('ran', encoding='utf-8')\n",
                encoding="utf-8",
            )
            hook.chmod(0o700)
            git(root, "config", "core.fsmonitor", str(hook))

            code, _, error = run_cli("capture", "--repo", str(root))

            self.assertEqual((code, error), (0, ""))
            self.assertFalse(marker.exists())

    def test_exact_baseline_and_checkpoint_label_do_not_claim_a_git_commit(self) -> None:
        """A caller label remains distinct from the verified HEAD commit object."""
        with tempfile.TemporaryDirectory(prefix="delivery-preservation-", dir="/tmp/opencode") as temporary:
            parent = Path(temporary)
            root = make_repository(parent)
            baseline = parent / "baseline.json"
            captured = capture_baseline(root, baseline)

            code, report, error = run_cli(
                "audit",
                "--repo",
                str(root),
                "--baseline",
                str(baseline),
                "--expect-branch",
                "main",
                "--expect-head",
                str(captured["repository"]["head"]),
                "--expect-index-sha256",
                str(captured["git"]["index_sha256"]),
                "--expect-staged-patch-sha256",
                str(captured["git"]["staged_patch_sha256"]),
                "--goal-checkpoint",
                "goal-checkpoint-17",
            )

            self.assertEqual((code, error), (0, ""))
            self.assertTrue(report["preservation"]["passed"])
            self.assertTrue(report["expected_values"]["passed"])
            self.assertFalse(report["goal_checkpoint"]["counts_as_git_commit"])
            self.assertTrue(report["repository"]["head_is_git_commit"])
            self.assertFalse(report["merge_authorized"])

    def test_malformed_baseline_is_rejected_before_path_comparison(self) -> None:
        """Malformed external evidence fails closed instead of raising a traceback."""
        with tempfile.TemporaryDirectory(prefix="delivery-preservation-", dir="/tmp/opencode") as temporary:
            parent = Path(temporary)
            root = make_repository(parent)
            baseline = parent / "baseline.json"
            capture_baseline(root, baseline)
            evidence = json.loads(baseline.read_text(encoding="utf-8"))
            evidence["git"]["status_records"] = [{"kind": "untracked"}]
            evidence["git"]["status_count"] = 1
            baseline.write_text(json.dumps(evidence), encoding="utf-8")

            code, report, error = run_cli(
                "audit", "--repo", str(root), "--baseline", str(baseline)
            )

            self.assertEqual(code, 2)
            self.assertEqual(report, {})
            self.assertIn("baseline status record is malformed", error)

    def test_staged_rename_captures_both_names_and_detects_destination_drift(self) -> None:
        """A staged rename retains source/destination scope and current bytes."""
        with tempfile.TemporaryDirectory(prefix="delivery-preservation-", dir="/tmp/opencode") as temporary:
            parent = Path(temporary)
            root = make_repository(parent)
            git(root, "mv", "tracked.txt", "renamed.txt")
            baseline = parent / "baseline.json"
            captured = capture_baseline(root, baseline)

            self.assertEqual(captured["git"]["status_count"], 1)
            self.assertEqual(captured["git"]["status_records"][0]["kind"], "rename")
            self.assertEqual(captured["git"]["status_records"][0]["original_path"], "tracked.txt")
            self.assertEqual(captured["git"]["worktree_files"]["tracked.txt"]["kind"], "missing")
            self.assertEqual(
                captured["git"]["worktree_files"]["renamed.txt"]["sha256"],
                sha256(b"base\n"),
            )

            (root / "renamed.txt").write_text("changed destination\n", encoding="utf-8")
            code, report, error = run_cli(
                "audit", "--repo", str(root), "--baseline", str(baseline)
            )

            self.assertEqual(code, 1, error)
            self.assertFalse(report["preservation"]["passed"])
            self.assertFalse(report["preservation"]["checks"][-1]["passed"])

    def test_only_exact_new_paths_can_be_allowed_and_existing_untracked_bytes_are_checked(self) -> None:
        """An allow-list cannot excuse mutation or removal of pre-existing user files."""
        with tempfile.TemporaryDirectory(prefix="delivery-preservation-", dir="/tmp/opencode") as temporary:
            parent = Path(temporary)
            root = make_repository(parent)
            original = root / "docs" / "existing.md"
            original.parent.mkdir()
            original.write_text("keep original bytes\n", encoding="utf-8")
            baseline = parent / "baseline.json"
            capture_baseline(root, baseline)
            owned = root / "scripts" / "delivery-preservation.py"
            owned.parent.mkdir()
            owned.write_text("new owned source\n", encoding="utf-8")

            code, report, error = run_cli(
                "audit",
                "--repo",
                str(root),
                "--baseline",
                str(baseline),
                "--allow-path",
                "scripts/delivery-preservation.py",
            )
            self.assertEqual((code, error), (0, ""))
            self.assertTrue(report["preservation"]["passed"])
            self.assertEqual(
                report["preservation"]["allowed_new_paths"],
                ["scripts/delivery-preservation.py"],
            )

            original.write_text("changed user bytes\n", encoding="utf-8")
            (root / "surprise.txt").write_text("unapproved new path\n", encoding="utf-8")
            bad_code, bad_report, bad_error = run_cli(
                "audit",
                "--repo",
                str(root),
                "--baseline",
                str(baseline),
                "--allow-path",
                "scripts/delivery-preservation.py",
            )
            self.assertEqual(bad_code, 1, bad_error)
            self.assertFalse(bad_report["preservation"]["passed"])
            self.assertEqual(
                bad_report["preservation"]["checks"][-1]["changed_paths"]["items"][0]["path"],
                "docs/existing.md",
            )

    def test_release_preflight_is_structural_only_even_for_a_real_conflict(self) -> None:
        """A conflicted divergent branch is never labeled merge-ready by this auditor."""
        with tempfile.TemporaryDirectory(prefix="delivery-preservation-", dir="/tmp/opencode") as temporary:
            parent = Path(temporary)
            root = make_repository(parent)
            git(root, "branch", "consolidated-delivery")
            git(root, "checkout", "-q", "consolidated-delivery")
            (root / "tracked.txt").write_text("feature value\n", encoding="utf-8")
            git(root, "commit", "-am", "feature edit")
            git(root, "checkout", "-q", "main")
            (root / "tracked.txt").write_text("main value\n", encoding="utf-8")
            git(root, "commit", "-am", "main edit")
            git(root, "checkout", "-q", "consolidated-delivery")
            baseline = parent / "baseline.json"
            capture_baseline(root, baseline)
            refs_before = git(root, "for-each-ref", "--format=%(refname) %(objectname)")
            head_before = git(root, "rev-parse", "HEAD")
            index_before = (root / ".git" / "index").read_bytes()

            code, report, error = run_cli(
                "audit",
                "--repo",
                str(root),
                "--baseline",
                str(baseline),
                "--target",
                "main",
            )

            proposal = report["release_proposal"]
            self.assertEqual((code, error), (0, ""))
            self.assertTrue(report["preservation"]["passed"])
            self.assertEqual(proposal["status"], "structural_candidate_for_parent_review")
            self.assertEqual(proposal["ahead_commits"], 1)
            self.assertEqual(proposal["behind_commits"], 1)
            self.assertEqual(
                proposal["committed_path_scope"]["items"],
                [{"status": "M", "path": "tracked.txt"}],
            )
            self.assertIn("not_run", proposal["conflict_check"])
            self.assertFalse(proposal["final_merge_ready"])
            self.assertFalse(proposal["actual_merge_performed"])
            self.assertEqual(git(root, "for-each-ref", "--format=%(refname) %(objectname)"), refs_before)
            self.assertEqual(git(root, "rev-parse", "HEAD"), head_before)
            self.assertEqual((root / ".git" / "index").read_bytes(), index_before)

    def test_archive_command_refuses_missing_manifest_without_creating_files(self) -> None:
        """An incomplete archive root fails closed and remains untouched."""
        with tempfile.TemporaryDirectory(prefix="delivery-preservation-", dir="/tmp/opencode") as temporary:
            archive = Path(temporary) / "archive"
            archive.mkdir()
            before = list(archive.iterdir())

            code, report, error = run_cli("archive", "--root", str(archive))

            self.assertEqual(code, 2)
            self.assertEqual(report, {})
            self.assertIn("missing archive file", error)
            self.assertEqual(list(archive.iterdir()), before)


if __name__ == "__main__":
    unittest.main()
