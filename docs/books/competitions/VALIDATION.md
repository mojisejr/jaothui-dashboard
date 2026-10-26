# Slice 1 validation — Issue #62

Verified on 26 October 2026 (Asia/Bangkok). This is a four-page format sample,
not the completed competition manual.

## Artifact and page review

- PDF SHA-256: `af4a0851873a513df862d557c1b2e762d987648062664b5a4518f93b17fb9913`.
- Four A4 portrait pages, four embedded fonts, 12 internal links and eight bookmarks.
- Thai text is selectable. Every page was rendered with Poppler at 100 dpi and
  visually inspected after the final build for Thai marks, line breaks, image
  labels, table wrapping, footer clearance and clipping.
- All four pages passed visual review. Owner review of readability, image scale
  and explanation order is the next acceptance step.
- `preview.build.json` matches the PDF, manifest and all ten declared assets;
  `capture-manifest.json` matches all original screenshots and SVG frames.

## Automated checks

- Document contracts: **12 passed**, including actual Thai rendering, nested
  SVG-to-PNG allow/deny behavior, path and symlink confinement, missing assets /
  fonts, output preservation on failure and relocation outside the dashboard.
- Python syntax compilation passed.
- Dashboard build, lint and TypeScript check exited successfully.
- Dashboard tests: **396 passed, 34 skipped; seven snapshots passed**. The existing
  skipped/opt-in suites were not represented as tested. Existing lint warnings
  remain in application files; no application source changed in this slice.
- Dashboard guards used an isolated non-production runtime with database writes
  unavailable and real LINE delivery disabled.

## Capture provenance and limits

- Screenshots came from the actual local dashboard with fictitious dev fixtures.
  See `capture-manifest.json` for routes, revisions, timestamps and image hashes.
- Settings use an identical dev clone without applicants so controls are editable.
  Review images use a synthetic, non-deliverable applicant; no real LINE was sent.
- Unmodified full-viewport PNGs are preserved. SVG viewports frame their relevant
  areas in the book layout. Rejected initial crops were not published.
- Structural checks and this page review do not prove first-time-reader usability.
  A novice trial and the complete book belong to later slices. Paper printing has
  not been physically tested.

## Phase 2 rebuilt-preview follow-up

The original hash above identifies the Slice1 commit's PDF. The current preview
was rebuilt after the Thai Sara Am text-node repair, preserving the same source
chapters, manifest and four-page layout. Its current SHA-256 is
`a4ea26e0bcdf45bd2e681c068f4a33d18ae363992a5e5ee5bb343ae95a9fa852`. All four new pages passed visual review; the document
contracts now total16 passing cases. See VALIDATION-FULL.md for the Unicode/viewer
limit and complete Phase2 evidence.
