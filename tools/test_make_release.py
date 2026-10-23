# SPDX-License-Identifier: GPL-2.0-or-later
"""Tests for tools/make_release.py: run with `python3 -m unittest discover -s tools -p "test_*.py"`."""

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import make_release as release


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class ReleaseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.dist = self.tmp / "dist"
        (self.dist / "assets" / "sprites").mkdir(parents=True)
        (self.dist / "content").mkdir()
        (self.dist / "licenses").mkdir()
        (self.dist / "index.html").write_text("<!doctype html>OpenSynd", encoding="utf-8")
        (self.dist / "app.js").write_text("// SPDX-License-Identifier: GPL-2.0-or-later\n", encoding="utf-8")
        (self.dist / "content" / "pack.json").write_text("{}", encoding="utf-8")
        (self.dist / "licenses" / "CC0-1.0.txt").write_text("text", encoding="utf-8")
        (self.dist / "build-meta.json").write_text(json.dumps({"revision": "abc123"}), encoding="utf-8")
        self.sprite = b"png bytes"
        (self.dist / "assets" / "sprites" / "a.png").write_bytes(self.sprite)
        self.root = self.tmp / "repo"
        (self.root / "provenance").mkdir(parents=True)
        self.status = "approved"
        self.write_registry(sha(self.sprite))
        (self.root / "provenance" / "dependencies.json").write_text(json.dumps({"packages": [
            {"name": "playwright-core", "version": "1.0.0", "license": "Apache-2.0", "scope": "dev"}]}), encoding="utf-8")

    def write_registry(self, digest: str) -> None:
        (self.root / "provenance" / "assets.json").write_text(json.dumps({"assets": [{
            "path": "web/public/assets/sprites/a.png", "sha256": digest, "status": self.status, "license": "CC0-1.0",
            "creator": "someone", "copyright": "someone", "source": "https://example.test/a"}]}), encoding="utf-8")

    def make(self, out: str = "out", allow: bool = False) -> dict:
        return release.make_release(self.dist, self.tmp / out, "abc123", allow, self.root)

    def test_the_same_files_give_the_same_archive_and_checksums(self) -> None:
        self.make("one")
        self.make("two")
        first = (self.tmp / "one" / "opensynd-abc123.tar.gz").read_bytes()
        second = (self.tmp / "two" / "opensynd-abc123.tar.gz").read_bytes()
        self.assertEqual(first, second)
        self.assertEqual((self.tmp / "one" / "SHA256SUMS").read_text(), (self.tmp / "two" / "SHA256SUMS").read_text())
        self.assertIn(f"{sha(first)}  opensynd-abc123.tar.gz", (self.tmp / "one" / "SHA256SUMS").read_text())

    def test_the_bills_account_for_every_file_and_licence(self) -> None:
        result = self.make()
        self.assertTrue(result["cleared"])
        bom = json.loads((self.tmp / "out" / "asset-bom.json").read_text())
        kinds = {entry["path"]: entry["kind"] for entry in bom["files"]}
        self.assertEqual(kinds["app.js"], "code")
        self.assertEqual(kinds["content/pack.json"], "content")
        self.assertEqual(kinds["assets/sprites/a.png"], "asset")
        sbom = json.loads((self.tmp / "out" / "sbom.cdx.json").read_text())
        self.assertEqual(sbom["bomFormat"], "CycloneDX")
        names = [component["name"] for component in sbom["components"]]
        self.assertEqual(names, ["assets/sprites/a.png"], "development-only dependencies are not part of what ships")

    def test_an_unregistered_or_altered_asset_stops_the_release(self) -> None:
        (self.dist / "assets" / "sprites" / "b.png").write_bytes(b"x")
        with self.assertRaisesRegex(release.ReleaseError, "not registered"):
            self.make()
        (self.dist / "assets" / "sprites" / "b.png").unlink()
        (self.dist / "assets" / "sprites" / "a.png").write_bytes(b"changed")
        with self.assertRaisesRegex(release.ReleaseError, "does not match"):
            self.make()

    def test_a_file_of_an_unknown_kind_stops_the_release(self) -> None:
        (self.dist / "mystery.bin").write_bytes(b"?")
        with self.assertRaisesRegex(release.ReleaseError, "does not know"):
            self.make()

    def test_quarantined_assets_make_an_uncleared_release_only_when_asked_for(self) -> None:
        self.status = "quarantined"
        self.write_registry(sha(self.sprite))
        with self.assertRaisesRegex(release.ReleaseError, "not approved"):
            self.make()
        result = self.make(allow=True)
        self.assertFalse(result["cleared"])
        bom = json.loads((self.tmp / "out" / "asset-bom.json").read_text())
        self.assertEqual(bom["unapprovedAssets"], ["assets/sprites/a.png"])


if __name__ == "__main__":
    unittest.main()
