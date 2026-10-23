<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# How the project is run

OpenSynd is a fan game built by John McCourt and the open source community, on top of rules and ideas from FreeSynd. It is a
hobby project and is run lightly.

## Decisions

- Small changes are made by anyone with commit rights and explained in the commit message.
- A change to a rule that comes from FreeSynd must check FreeSynd's source first: **FreeSynd's rules and values win** over ours
  (principle 8 in `ROADMAP.md`), unless the project owner decides otherwise and writes down why.
- Bigger decisions (a new dependency, a file format change, a licence change, a new name) are discussed in a public issue first
  and recorded in `ROADMAP.md` or `docs/design/`.
- Anything that touches licensing, provenance or trademarks follows `CONTRIBUTING.md`, `ASSET_POLICY.md` and
  `TRADEMARKS.md`; when in doubt the file is quarantined until its origin is clear.

## Maintainers

- The **project owner** (see `AUTHORS`) has the final say.
- **Maintainers** may review and merge changes and make releases. A maintainer is added when the owner and at least one
  existing maintainer agree, and removed at their own request or after a year without activity.
- The project should never depend on one person. Every maintainer can make a release from the written procedure in
  [docs/RELEASING.md](docs/RELEASING.md), and at least two should be able to. Until a second maintainer exists, the procedure
  and the release checklist are the stand-in: they are kept complete enough for someone new to follow.

## Succession

If the owner can no longer run the project:

1. The remaining maintainers carry on and choose a new owner among themselves.
2. If there are no maintainers, anyone may fork the project: everything needed is public (code, content, art sources,
   deployment files, the release procedure), the licences allow it, and nothing depends on a private service.
3. The owner keeps a note of where the hosting, domain and code-host accounts are, with a trusted person, so the site can be
   handed over or switched off cleanly.

## Releases and security

See [docs/RELEASING.md](docs/RELEASING.md) and [SECURITY.md](SECURITY.md). Releases are made from tagged, signed commits;
every release comes with checksums and software and asset bills of materials.
