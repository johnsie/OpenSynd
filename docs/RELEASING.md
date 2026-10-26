<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Making a release

A release is a tagged, signed commit, a reproducible archive of the website, its checksums and its bills of materials. Anyone
who can follow this page can make one; a second maintainer should do it once to prove the page is complete.

## Before you start

1. All checks pass on the commit you are releasing: the GitLab pipeline's **check** stage, or locally
   ```sh
   python3 tools/validate_content.py && python3 tools/check_web_sync.py && python3 tools/check_style.py \
     && python3 tools/check_provenance.py && python3 tools/check_source_licenses.py && python3 tools/check_dependencies.py
   python3 -m unittest discover -s tools -p "test_*.py"
   (cd web && npm test && npm run e2e && npm run perf)
   ```
2. **The legal gate** (`docs/legal/IP_AUDIT.md`, "Release blockers"): no shipped asset may be quarantined or unregistered, the
   source audit has no unresolved file that ships, the licence expression is settled and the name is cleared. The release
   tool checks the first of these for you (see step 3); the rest are a human decision recorded in the release notes.
3. `ROADMAP.md` says what changed; write the release notes from it (what is new, what was fixed, anything players must know).

## Steps

1. **Tag** the commit with a version and a signature (a key that is listed in `AUTHORS` or `GOVERNANCE.md`):
   ```sh
   git tag -s v0.1.0 -m "NeuroReign 0.1.0"
   git push gitlab v0.1.0
   ```
   `git tag -v v0.1.0` shows the signature; do not release from an unsigned tag.
2. **Build** the site, reproducibly. The revision and the date come from the tag, so the same commit gives the same bytes:
   ```sh
   cd web
   SOURCE_REVISION=$(git rev-parse --short=8 v0.1.0^{commit}) \
   SOURCE_DATE_EPOCH=$(git log -1 --format=%ct v0.1.0^{commit}) \
   PIN_RELEASES=1 node build.mjs
   ```
   (`PIN_RELEASES=1` makes the page load its code from its own release folder; leave it out for a copy that is not hosted
   at the project's own address.)
3. **Make the release files:**
   ```sh
   cd ..
   python3 tools/make_release.py --out release          # stops if an asset is quarantined or unregistered
   python3 tools/make_release.py --out release --allow-quarantined   # a release that says it is NOT cleared
   ```
   This writes `release/opensynd-<revision>.tar.gz`, `SHA256SUMS`, `sbom.cdx.json` (software bill of materials) and
   `asset-bom.json` (every shipped file with its licence, maker and source). Build twice and compare `SHA256SUMS`: they must be
   identical. If they are not, something in the build is not reproducible; fix that before releasing.
4. **Sign the checksums** so they can be trusted without trusting the download host:
   ```sh
   gpg --armor --detach-sign release/SHA256SUMS
   ```
5. **Publish**: attach `release/*` and the notes to a release on the code host, and (for the project's own site) let the pipeline
   deploy the tag (`deploy/README.md`). The site keeps older releases under `/r/<revision>/`, so games that are open keep
   running and then pick up the new one at a quiet moment.
6. **Afterwards**: check `https://<site>/build-meta.json` shows the new revision, play the first operation, and note the release
   in `ROADMAP.md`.

## Checking someone else's release

```sh
tar -xzf opensynd-<revision>.tar.gz && (cd opensynd && sha256sum -c ../SHA256SUMS --ignore-missing)
gpg --verify SHA256SUMS.asc SHA256SUMS
```

The bills are plain JSON; `asset-bom.json` lists every file with its licence, and `cleared: false` means some shipped asset is
still waiting for a legal review.

## Two people

Until at least two maintainers have each made a release from this page (see `GOVERNANCE.md`), the project does not claim to
meet the "two maintainers can release" exit gate in `ROADMAP.md`.
