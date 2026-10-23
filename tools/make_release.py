#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Make a release of the web game: a reproducible archive, checksums, and the bills of materials.

Usage: python3 tools/make_release.py [--dist web/dist] [--out release] [--revision REV] [--allow-quarantined]

From a built `web/dist` this writes into the output folder:

* `opensynd-<revision>.tar.gz`   the whole site, byte-for-byte reproducible (sorted names, fixed times and owners);
* `SHA256SUMS`                   a checksum for every file in the site and for the archive;
* `sbom.cdx.json`                a CycloneDX software bill of materials (the application and what it contains);
* `asset-bom.json`               for every file in the site: what it is, who made it, its licence and where it came from.

Every file in the site must map to documented licensing information, or the release stops: code is GPL-2.0-or-later (the
files carry SPDX notices), the open content pack is CC0-1.0, licence texts are themselves, and sprites and music must be
registered in `provenance/assets.json`. Registered assets that are not yet *approved* (quarantined pending a legal review)
make the release a "not cleared" one: it stops unless `--allow-quarantined` is given, and the bill says so.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIXED_TIME = 0  # the archive's times, owners and modes are fixed so that the same files always give the same bytes


class ReleaseError(Exception):
    pass


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def site_files(dist: Path) -> list[Path]:
    files = sorted(path for path in dist.rglob("*") if path.is_file())
    if not files:
        raise ReleaseError(f"{dist} holds no files: build the game first")
    if not (dist / "index.html").is_file():
        raise ReleaseError(f"{dist} has no index.html: was the game built?")
    return files


def load_registry(root: Path) -> dict[str, dict]:
    registry = json.loads((root / "provenance" / "assets.json").read_text(encoding="utf-8"))
    return {entry["path"]: entry for entry in registry["assets"]}


def classify(relative: str, registry: dict[str, dict]) -> dict:
    """What a file in the site is, and its licence and origin. Raises ReleaseError if it cannot be accounted for."""
    if relative.startswith("assets/"):
        entry = registry.get(f"web/public/{relative}")
        if entry is None:
            raise ReleaseError(f"{relative} is not registered in provenance/assets.json")
        return {
            "kind": "asset",
            "license": entry["license"],
            "creator": entry.get("creator", "UNKNOWN"),
            "copyright": entry.get("copyright", "NOASSERTION"),
            "source": entry.get("source", "NOASSERTION"),
            "status": entry["status"],
        }
    if relative.startswith("content/"):
        return {"kind": "content", "license": "CC0-1.0", "creator": "OpenSynd contributors",
                "source": "open-content/packs/developer", "status": "open"}
    if relative.startswith("licenses/"):
        return {"kind": "licence-text", "license": "see the text itself", "creator": "licence author", "status": "open"}
    if relative == "build-meta.json":
        return {"kind": "generated", "license": "CC0-1.0", "creator": "the build", "status": "open"}
    if relative.endswith((".js", ".css", ".html")):
        return {"kind": "code", "license": "GPL-2.0-or-later", "creator": "OpenSynd contributors", "status": "open"}
    raise ReleaseError(f"{relative} is a kind of file the release does not know how to account for")


def asset_bom(dist: Path, files: list[Path], registry: dict[str, dict]) -> list[dict]:
    bom = []
    for path in files:
        relative = path.relative_to(dist).as_posix()
        data = path.read_bytes()
        entry = {"path": relative, "sha256": sha256(data), "bytes": len(data), **classify(relative, registry)}
        if entry["kind"] == "asset":
            registered = registry[f"web/public/{relative}"]["sha256"]
            if registered != entry["sha256"]:
                raise ReleaseError(f"{relative} does not match the hash registered in provenance/assets.json")
        bom.append(entry)
    return bom


def software_bom(revision: str, bom: list[dict], root: Path) -> dict:
    """A CycloneDX 1.5 bill of materials: the application, and every distinct licensed thing inside it."""
    dependencies = json.loads((root / "provenance" / "dependencies.json").read_text(encoding="utf-8"))
    components = []
    for entry in bom:
        if entry["kind"] != "asset":
            continue
        components.append({
            "type": "data",
            "bom-ref": f"asset:{entry['path']}",
            "name": entry["path"],
            "version": entry["sha256"][:12],
            "hashes": [{"alg": "SHA-256", "content": entry["sha256"]}],
            "licenses": [{"license": {"name": entry["license"]}}],
            "copyright": entry["copyright"],
            "externalReferences": [{"type": "website", "url": entry["source"]}] if entry["source"].startswith("http") else [],
            "properties": [{"name": "opensynd:status", "value": entry["status"]}],
        })
    digest = hashlib.sha256(revision.encode()).hexdigest()
    runtime = [package for package in dependencies["packages"] if package.get("scope") != "dev"]
    for package in runtime:
        components.append({
            "type": "library",
            "name": package["name"],
            "version": package["version"],
            "licenses": [{"license": {"id": package["license"]}}],
            "purl": f"pkg:npm/{package['name']}@{package['version']}",
        })
    components.sort(key=lambda item: item.get("bom-ref", item["name"]))
    return {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "version": 1,
        "serialNumber": f"urn:uuid:{digest[:8]}-0000-4000-8000-{digest[8:20]}",
        "metadata": {
            "component": {
                "type": "application",
                "bom-ref": "opensynd-web",
                "name": "OpenSynd browser game",
                "version": revision,
                "licenses": [{"license": {"id": "GPL-2.0-or-later"}}, {"license": {"id": "CC0-1.0"}}],
                "description": "A static website: no server code, no runtime dependencies, no third-party requests.",
            },
        },
        "components": components,
        "dependencies": [{"ref": "opensynd-web", "dependsOn": [item["bom-ref"] for item in components if "bom-ref" in item]}],
    }


def archive(dist: Path, files: list[Path], destination: Path) -> None:
    """A tar.gz that is the same bytes every time for the same files."""
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w", format=tarfile.PAX_FORMAT) as tar:
        for path in files:
            data = path.read_bytes()
            info = tarfile.TarInfo(name=f"opensynd/{path.relative_to(dist).as_posix()}")
            info.size = len(data)
            info.mtime = FIXED_TIME
            info.mode = 0o644
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            tar.addfile(info, io.BytesIO(data))
    with destination.open("wb") as handle:
        with gzip.GzipFile(filename="", mode="wb", fileobj=handle, mtime=0, compresslevel=9) as zipped:
            zipped.write(buffer.getvalue())


def make_release(dist: Path, out: Path, revision: str, allow_quarantined: bool, root: Path = ROOT) -> dict:
    files = site_files(dist)
    registry = load_registry(root)
    bom = asset_bom(dist, files, registry)
    unapproved = sorted(entry["path"] for entry in bom if entry["kind"] == "asset" and entry["status"] != "approved")
    if unapproved and not allow_quarantined:
        raise ReleaseError(
            f"{len(unapproved)} shipped assets are not approved for release (still quarantined pending legal review), "
            "for example " + ", ".join(unapproved[:3]) + ". Run with --allow-quarantined to make a release that says so."
        )
    out.mkdir(parents=True, exist_ok=True)
    package = out / f"opensynd-{revision}.tar.gz"
    archive(dist, files, package)
    sums = [f"{entry['sha256']}  {entry['path']}" for entry in bom]
    sums.append(f"{sha256(package.read_bytes())}  {package.name}")
    (out / "SHA256SUMS").write_text("\n".join(sums) + "\n", encoding="utf-8")
    (out / "asset-bom.json").write_text(
        json.dumps({"revision": revision, "cleared": not unapproved, "unapprovedAssets": unapproved, "files": bom}, indent=2) + "\n",
        encoding="utf-8",
    )
    (out / "sbom.cdx.json").write_text(json.dumps(software_bom(revision, bom, root), indent=2) + "\n", encoding="utf-8")
    return {"archive": package.name, "files": len(bom), "cleared": not unapproved, "unapproved": len(unapproved)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dist", type=Path, default=ROOT / "web" / "dist")
    parser.add_argument("--out", type=Path, default=ROOT / "release")
    parser.add_argument("--revision", default=None, help="defaults to the revision recorded in build-meta.json")
    parser.add_argument("--allow-quarantined", action="store_true")
    args = parser.parse_args()
    try:
        revision = args.revision
        if revision is None:
            revision = json.loads((args.dist / "build-meta.json").read_text(encoding="utf-8"))["revision"]
        result = make_release(args.dist, args.out, revision, args.allow_quarantined)
    except (ReleaseError, OSError, KeyError, ValueError) as error:
        print(f"release: ERROR: {error}", file=sys.stderr)
        return 1
    note = "cleared" if result["cleared"] else f"NOT CLEARED: {result['unapproved']} assets still quarantined"
    print(f"release: wrote {result['archive']} ({result['files']} files, {note}) to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
