# DESIGN.md File Manifest

Tracks provenance of the Aura-generated design spec as it moves from its
discovered location into the canonical `docs/design/aura/` structure.

## Source File

| Field | Value |
|---|---|
| Source path | `docs/aura/DESIGN.md` |
| Filesystem birth time | 2026-07-12 15:14:01.834609300 +0700 |
| Filesystem modify time | 2026-07-12 15:14:02.442913500 +0700 |
| Size | 7,878 bytes |
| Line count | 126 |
| SHA-256 | `c9ee2271eb39968100c54a45fc1feeebe06ebed35193641486d44fa73588b231` |

Note on the checksum: this is the raw output of `sha256sum` computed twice
independently against the source file; both runs matched. (A standard SHA-256
hex digest is 64 characters — the trailing character count was verified with
`awk '{print length($1)}'` returning `64`, confirming no corruption occurred
in transcription.)

## Destination — Canonical Copy

| Field | Value |
|---|---|
| Destination path | `docs/design/aura/DESIGN.md` |
| Copy date | 2026-07-12 |
| Size | 7,878 bytes |
| SHA-256 | `c9ee2271eb39968100c54a45fc1feeebe06ebed35193641486d44fa73588b231` |
| Match to source | IDENTICAL (checksum match confirmed) |

## Destination — Archived Original

| Field | Value |
|---|---|
| Archive path | `docs/design/aura/archive/DESIGN_SOURCE_2026-07-12.md` |
| Date basis | Filesystem modify date of source file (2026-07-12), not `Date.now()` / session date |
| Size | 7,878 bytes |
| SHA-256 | `c9ee2271eb39968100c54a45fc1feeebe06ebed35193641486d44fa73588b231` |
| Match to source | IDENTICAL (checksum match confirmed) |

## Disposition

- Original `docs/aura/DESIGN.md` — **left in place, unmodified.**
- Canonical working copy — `docs/design/aura/DESIGN.md` (used for all audits in this pass).
- Immutable archival snapshot — `docs/design/aura/archive/DESIGN_SOURCE_2026-07-12.md`.

All three files are byte-identical at time of writing. Any future edits should
happen only in `docs/design/aura/DESIGN_VERIFIED.md` (the normalized spec —
see Part 11), never in these three source-of-record copies.
