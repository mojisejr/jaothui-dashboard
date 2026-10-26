# Task-based manual 0.3 validation — Issue #62

26 October 2026, Asia/Bangkok. Slice2R-A content/engine evidence and Slice2R-B root visual acceptance. A novice trial and physical
printing have not been performed; no live application/LINE action was executed
for this task-path revision.

## Artifact and source

- `jaothui-competition-manual.pdf`, edition0.3, **38 A4 portrait pages**.
- PDF SHA-256: `9707ebf215f5fb1dc3573787b2a2b774fc0bdfc47ec7429c5bd7d5e1bafc2757`.
- Four embedded fonts,229 internal links,10 external links,64 bookmarks,
  50,522 selectable characters (extractor count, not a usability measure).
- Six complete task chapters, one optional reference index and23 retained
  reference chapters. New-event task spans three pages; public signup control fits one page; other tasks two each.
- 20 **unique** illustrations are reused across paths and references; this is not
  a claim of20 image occurrences. All50 declared appearance-input hashes match
  the baseline52611c4. No screenshot, diagram or capture manifest was changed.
- `manual.json` and the sibling build report record ordered sources, assets,
  templates/fonts and renderer versions. No byte-identical cross-runtime claim.

## Actual navigation audit

The published PDF, not only its HTML or source, was checked:

| Target | Actual PDF page |
|---|---:|
| task-new |3|
| task-review |6|
| task-signup |8|
| task-onsite |9|
| task-close |11|
| task-recover |13|
| reference-guide |15|
| login |16|
| admin-appendix |38|

All nine grouped chooser links resolve to their named destination and display the
correct page counter. All30 chapter titles are present on their actual starting
page after Unicode NFKC/layout-whitespace normalization. All101 authored Markdown
fragment links have matching generated `(หน้า X)` text for the actual destination;
all six task paths return to `#contents`. Every internal PDF annotation destination
resolves. These page numbers report **this artifact**, not hardcoded book content.

## Engine and application gates

- **20/20 document contracts pass**: the original16 plus navigation schema/target
  errors, real five-page grouped navigation with a resolved late target and print
  page counter, reserved frontmatter IDs and unknown internal links preserving a
  previous good output. Default no-navigation and relocated second-book contracts
  remain passing.
- Python syntax compilation and `git diff --check` pass.
- Actual full-book build and CLI `--check` pass. The unchanged-source sample builds
  to four A4 pages; its PDF hash remains
  `a4ea26e0bcdf45bd2e681c068f4a33d18ae363992a5e5ee5bb343ae95a9fa852`.
- Root reports isolated application build/lint/TypeScript checks successful;
 396 tests and seven snapshots passed,34 inherited/opt-in tests skipped.
  No application source/dependency was changed.

## Editorial audit and boundaries

`TASK-PATHS-SOURCE-MATRIX.md` maps every path's prerequisites, actions, observable
DoD, self-help, safe hold, escalation packet and optional references to code.
Source review corrected two important branches: whole-event clone is chosen
before editing and uses the existing-draft save button; downloading files alone
never requires closing an event. A known onsite save plus refresh failure is
separate from an uncertain write; the uncertain request must remain in the same
page for same-request retry, not reload/close/new request.

Staff input recovery, organizer/admin decisions and developer/log investigations
are distinct. Provider acceptance is not proof of receipt/read. Royal non-black
one-day adjustment, strict age bands, special manual checks, shared-account
limitations and post-entrant rule review remain explicit.

The earlier Sara Am text-node NFKC-equivalent repair is retained. Full Unicode
semantics are tested; exact Find behavior differs by PDF viewer. Sources, URLs,
resource attributes and fonts remain unchanged. No PDF CMap rewriting.

## Remaining independent acceptance

Root inspected all 38 final raster pages at 100 dpi on 26 October 2026.
No clipping, overlap, broken Thai marks, unreadable image panels, orphaned chapter
headings or incorrect footer/page transitions remained. The public-signup path
was condensed to one page without shrinking type or dropping its completion and
recovery rules. The close/export completion criteria were kept together on page12.
All six paths were reviewed against the author cases and code-source matrix;
this was an author review, not a novice or physical-print trial.
No author/source/structural assertion establishes that a genuine first-time user
completed a task without oral coaching. Keep
`HUMAN_FIRST_TIME_READER_CHECK_PENDING` until that trial is actually recorded.
