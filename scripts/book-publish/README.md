# Local book publisher

Issue #62. A small Python command builds an illustrated book from local content,
images and licensed fonts. It does not upload a book or run the dashboard.

## Prepare the document tools

Use Python 3.10 or newer and a separate virtual environment. From the repository
root:

```sh
python3 -m venv .tmp/book-publish-venv
.tmp/book-publish-venv/bin/python -m pip install -r scripts/book-publish/requirements.txt
```

WeasyPrint also needs Pango (1.44 or newer). On macOS, install Pango through
Homebrew if it is missing. If the Python process cannot find the native library,
set the library search path before running the document command:

```sh
export DYLD_FALLBACK_LIBRARY_PATH="$(brew --prefix)/lib${DYLD_FALLBACK_LIBRARY_PATH:+:$DYLD_FALLBACK_LIBRARY_PATH}"
```

On Debian/Ubuntu, the native prerequisites include `libpango-1.0-0`,
`libpangoft2-1.0-0` and `libharfbuzz-subset0`. Follow the installation instructions
for the pinned WeasyPrint version if these packages have different names on your
system: <https://doc.courtbouillon.org/weasyprint/stable/first_steps.html>.

None of these dependencies belongs in the dashboard's `package.json`.

## Build and check

```sh
.tmp/book-publish-venv/bin/python scripts/book-publish/publish.py \
  --book docs/books/competitions/book.json

.tmp/book-publish-venv/bin/python scripts/book-publish/publish.py \
  --check docs/books/competitions/preview.pdf

.tmp/book-publish-venv/bin/python -m unittest discover -s scripts/book-publish/tests -v
```

An absolute manifest path also works from a different current directory. Relative
chapter, image and output paths are resolved from that manifest, never from the
shell's current directory. The renderer never reads `.env`, application modules,
databases, LINE credentials or network resources. Network access is needed only
when installing the pinned document tools, not when building a book.

The build first validates the manifest, files and Thai font coverage. A candidate
PDF is created under `.tmp/book-publish`, then checked for page count, A4 size,
selectable text, embedded fonts and contents links. Only a successful candidate
replaces the requested output. A failed build leaves an existing PDF untouched.
Successful builds emit a sibling `.build.json` file with versions and input
hashes, including every declared image dependency, its manifest and the print
templates. If final PDF promotion fails, the old report is restored too.
The preview's content is source-controlled; scratch candidates are cleaned
after each run. The installed environment may be removed after review and created
again from `requirements.txt` when needed.

## Add another book

Copy the book folder, edit `book.json` and its ordered Markdown chapters, then
pass the new manifest to the same command. This is the reusable seam: the engine
and a book folder work without `src`, `node_modules` or any dashboard settings.

Each manifest has `schema_version: 1`, metadata (`title`, `subtitle`, `language`,
`edition`, `publication_date`), `expected_pages`, `output`, ordered `chapters`
and named `assets`. A chapter has a unique lowercase `id`, a `title` and a local
Markdown `source`. An asset has a local `src`, descriptive `alt` and `caption`.

Place a figure on its own Markdown line, for example:

```md
![เลือกวัน เดือน และปี พ.ศ.](asset:date-picker)
```

The image path comes only from the manifest. Remote image URLs, absolute paths,
path escapes and symlinks outside the book are rejected. Raw HTML in Markdown is
disabled. The resource loader allows only declared assets and bundled fonts.

An SVG figure can act as a document viewport over an unchanged full screenshot.
Declare both the SVG and its referenced PNG in `assets`; the renderer verifies
both paths and records both hashes. This crops the figure in the document layout
without rewriting the original screenshot or reconstructing the UI. Undeclared
nested resources are rejected, even when they sit beside a permitted SVG.

## Visual acceptance is separate

Structural checks do not prove that Thai marks, line breaks or screenshots are
comfortable to read. Render **every** page and inspect it at A4 print size:

```sh
mkdir -p .tmp/book-publish-review
pdftoppm -r 120 -png docs/books/competitions/preview.pdf \
  .tmp/book-publish-review/page
```

Inspect the latest PNGs for clipped text, overlapping callouts, tiny image labels,
orphaned headings and broken Thai glyphs. Check the contents links in a PDF viewer.
Record source/capture revisions and use only fictitious data in committed images.
Do not claim first-time-reader usability until a genuine novice has tried it.

## Fonts and provenance

The bundled Sarabun and Kanit fonts are distributed under SIL OFL 1.1. Their
copyright/license files remain beside the font files. Source:

- <https://github.com/google/fonts/tree/main/ofl/sarabun>
- <https://github.com/google/fonts/tree/main/ofl/kanit>

Typography can vary across operating systems and native-library versions. The
build report records content/font hashes and renderer versions; it does not
promise byte-identical PDFs across different environments.

## Full books with a separate cover and contents

The short sample keeps its original inline contents. Set `frontmatter: true` for
an additional cover page and separate linked contents page. `expected_pages`
includes those two pages. Optional `cover` text fields are `brand`, `audience`,
`route`, `reading_help`, `notice`, `note`, and `contents_notice`; the book owns
these words, so the renderer does not import a particular application's story.
Newlines in the route/help/note fields appear as document line breaks. All values
are plain escaped text, not HTML. A non-boolean `frontmatter` or non-text cover
value fails validation.

The full competition review edition uses its own manifest and chapters:

```sh
.tmp/book-publish-venv/bin/python scripts/book-publish/publish.py \
  --book docs/books/competitions/manual.json

.tmp/book-publish-venv/bin/python scripts/book-publish/publish.py \
  --check docs/books/competitions/jaothui-competition-manual.pdf
```

Do not replace `book.json`, `chapters/`, or `preview.pdf` when editing the full
manual. Full-book editorial traceability is in
`docs/books/competitions/SOURCE-TRUTH-CHECKLIST.md`. Render and inspect both the
short preview and the full book after changing shared templates.

## Thai text semantics

The pinned renderer can cache an empty Unicode mapping for a Thai consonant when
it first appears in a Sara Am cluster. Before rendering, the engine therefore
uses the Unicode compatibility-equivalent sequence U+0E4D U+0E32 for U+0E33 in
**HTML text nodes only**. Authored Markdown/metadata remain unchanged, as do HTML
attributes, links, image paths and the fonts. No generated PDF character map is
rewritten. The report records this normalization.

A real-render contract checks complete Thai phrases across heading/body/bold with
pypdf and, when installed, Poppler after NFKC and layout-whitespace normalization.
These checks establish retained text semantics, not identical extracted codepoint
sequences or identical Find behavior in every PDF viewer. If a viewer does not
normalize Sara Am when searching, use the linked contents or a shorter search
term without Sara Am. Visual page review remains mandatory after this change.

## Optional task navigation and print references

A book can present a few jobs before its deeper references. Set optional
`navigation` to non-empty groups, for example:

```json
"navigation": [
  {"title": "Main tasks", "links": [
    {"label": "Open an event", "chapter": "task-new", "summary": "Prepare, publish, verify"}
  ]},
  {"title": "Optional detail", "links": [
    {"label": "Reference index", "chapter": "reference-guide"}
  ]}
]
```

Titles/labels and optional summaries are non-empty text. Targets must name existing
chapter IDs; invalid types/targets fail before rendering. Omitting navigation
keeps the original complete contents behavior, including the four-page sample.
A separate cover/chooser is enabled by `frontmatter` as before.

Write cross-references as `[More detail](#chapter-id)` in Markdown. They become
clickable PDF links with an automatically computed `(หน้า X)` for print. Unknown
internal targets fail instead of producing broken links. `#contents` and `#cover`
are allowed only when frontmatter exists and cannot collide with chapter IDs.
External URLs and resource attributes remain exact. Raw HTML is still disabled;
there is no hand-coded page-number or page-range system.
