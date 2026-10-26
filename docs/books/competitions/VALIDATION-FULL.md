# Full manual: Phase 2 validation — Issue #62

Historical baseline for edition0.2 at commit52611c4. The current task-based0.3
revision is tracked in `VALIDATION-TASK-PATHS.md`; the older hash and page review
below describe the original0.2 artifact, not the replacement PDF.

Verified 26 October 2026 (Asia/Bangkok). **PHASE_2_EDITORIAL_BUILD_VERIFIED**.
Review edition 0.2 is ready for the Phase 3 acceptance exercise. First-time-reader
acceptance and physical printing have not been performed.

## Final artifact

- 25 A4 portrait pages: separate cover/linked contents and 23 ordered chapters.
- 20 numbered illustrations, comprising actual local/dev screen panels and one
  explicitly labeled, source-backed duplicate/retry diagram.
- PDF SHA-256: `00108a0865e3469979ea0056798492af9dea139f60a5ada3f7cc951fe3dc2de2`.
- Four embedded fonts, 69 internal links, four external links and 49 bookmarks.
- 23 chapter titles verified in extracted text on their actual chapter pages,
  using Unicode NFKC and layout-whitespace normalization.
- Manifest, chapter, template, font and all 50 declared asset hashes recorded in
  `jaothui-competition-manual.build.json`; source/capture hashes match.

## Visual and editorial review

Every full-book page was rasterized with Poppler at 100 dpi and inspected for
Thai marks, wrapping, contrast, image labels, page/figure boundaries and footer
clearance. The final changed pages were inspected again; unchanged raster bytes
were compared by SHA-256. All final pages passed this phase's visual review.
The four-page preview was also rebuilt and re-reviewed without changing its
source chapters, manifest or accepted story order.

The Login full-page capture had moved centered content relative to DOM geometry;
it was rejected and replaced by an unchanged viewport capture. Explicit SVG
clip paths prevent adjacent panel fragments from leaking into constrained print
frames. Original image bytes remain intact. `capture-manifest-full.json` and
`SOURCE-TRUTH-CHECKLIST.md` provide lineage and source checks.

## Deterministic checks

- **16/16 document contracts passed**, including actual Thai rendering, the
  separate-frontmatter layout, nested SVG resource allow/deny behavior, source
  and path confinement, failure preservation and engine/book relocation.
- Python syntax compilation passed.
- Dashboard build, lint and TypeScript checks exited successfully after the final
  engine/style edits. No application source or dependencies changed.
- Application tests: **396 passed, 34 existing/opt-in skipped; seven snapshots
  passed**. Skipped cases were not reported as tested. Existing application lint
  warnings remain. Guards ran with non-production isolated runtime settings.

## Thai text repair and remaining viewer limit

The new exact-Thai regression exposed empty ToUnicode mappings for glyphs first
encountered in a Thai Sara Am cluster. Some visually correct words lost
consonants when extracted (for example คำนวณ). The documented full-font/feature
probes and isolated WeasyPrint 69.0/68.1 compatibility diagnostics did not resolve
it. Version 70.0 was retained; no library monkeypatch, CMap rewriting or downgrade
was shipped.

The engine now decomposes only U+0E33 to its NFKC-equivalent U+0E4D U+0E32
sequence in rendered HTML text nodes. Original source files, font files,
attributes and resource URLs remain exact. Real pypdf and Poppler output retains
the complete regression corpus in body/bold/headings after NFKC and layout
normalization; the visible Thai appearance was inspected as well.

PDF viewers differ in whether Find normalizes this compatibility sequence. If a
Thai query containing Sara Am is not found, use linked contents or a shorter query.
Universal exact-Find behavior across viewers has not been claimed.

## Test-data and action boundaries

- Actual local UI, dedicated fictitious dev records and blank Login fields only.
  No production event/participant or real LINE delivery was changed.
- The normal event, editable draft clone and explicit Royal variant are named
  separately. Black Royal birthday26Oct2568/cutoff26Oct2569 gives12 months;
  the current non-black adjustment can shift it to13 months.
- The filled onsite illustration was not submitted. The duplicate/retry diagram
  proves no actual save/retry or provider receipt in this slice; source review
  and prior application QA are separate evidence.
- Normal and Royal dev events were closed after capture; their documents and the
  unpublished draft clone were retained. All owned browser tabs were closed
  after the owner cancelled the stale confirmation.

## Phase 3 acceptance still open

Give a genuine first-time operator the main scenario without spoken coaching,
record the steps they misunderstand and revise. Check intended PDF viewer/print
behavior as appropriate. Until then use **HUMAN_FIRST_TIME_READER_CHECK_PENDING**,
not a claim that everyone can operate the system after one reading.
