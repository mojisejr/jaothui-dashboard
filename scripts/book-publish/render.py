"""Offline authored-book renderer; no application imports or network fetches."""
import hashlib
import html
from html.parser import HTMLParser
import json
import logging
import os
from pathlib import Path
import platform
import shutil
import tempfile
from urllib.parse import unquote, urlparse

from fontTools.ttLib import TTFont
from jinja2 import Environment, FileSystemLoader, select_autoescape
from markdown_it import MarkdownIt
from markdown_it.token import Token
import weasyprint
from weasyprint import CSS, HTML
from weasyprint.urls import URLFetcher
from weasyprint.text.fonts import FontConfiguration

from manifest import BookError, load_book
from verify import verify_pdf

ENGINE = Path(__file__).resolve().parent
FONT_FILES = ['Sarabun-Regular.ttf', 'Sarabun-Bold.ttf', 'Kanit-Regular.ttf', 'Kanit-SemiBold.ttf']


def render_text_equivalents(document):
    """Avoid empty Thai Sara Am cluster mappings in the pinned PDF renderer.

    U+0E33 has the NFKC-equivalent sequence U+0E4D U+0E32. Only visible
    HTML text changes; source files, attributes and resource URLs stay exact.
    This preserves glyph appearance without modifying a font or a PDF CMap.
    """
    class TextNodes(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=False)
            self.parts = []

        def handle_data(self, data):
            self.parts.append(data.replace('\u0e33', '\u0e4d\u0e32'))

        def handle_starttag(self, tag, attrs):
            self.parts.append(self.get_starttag_text())

        def handle_startendtag(self, tag, attrs):
            self.parts.append(self.get_starttag_text())

        def handle_endtag(self, tag):
            self.parts.append(f'</{tag}>')

        def handle_decl(self, decl):
            self.parts.append(f'<!{decl}>')

        def handle_entityref(self, name):
            self.parts.append(f'&{name};')

        def handle_charref(self, name):
            self.parts.append(f'&#{name};')

        def handle_comment(self, data):
            self.parts.append(f'<!--{data}-->')

    parser = TextNodes()
    parser.feed(document)
    parser.close()
    return ''.join(parser.parts)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def check_fonts(font_dir, text):
    required = {ord(c) for c in text if '\u0e00' <= c <= '\u0e7f'}
    for name in FONT_FILES:
        path = font_dir / name
        if not path.is_file():
            raise BookError(f'Missing font {name}; restore the bundled licensed font file')
        try:
            with TTFont(path) as font:
                if not required.issubset(font.getBestCmap()):
                    raise BookError(f'Font {name} cannot display all Thai characters in this book')
        except BookError:
            raise
        except Exception as exc:
            raise BookError(f'Cannot read font {name}: {exc}') from exc


def chapter_html(book, chapter):
    parser = MarkdownIt('commonmark', {'html': False}).enable('table')
    tokens = parser.parse(chapter['path'].read_text(encoding='utf-8'))
    figures = set()
    known_ids = {item['id'] for item in book.chapters}
    if book.data.get('frontmatter'):
        known_ids.update({'cover', 'contents'})

    def link_rule(tokens, index, options, env):
        token = tokens[index]
        href = token.attrGet('href') or ''
        if href.startswith('#'):
            if href[1:] not in known_ids:
                raise BookError(f'{chapter["id"]}: unknown internal chapter link {href}')
            token.attrJoin('class', 'chapter-link')
        return parser.renderer.renderToken(tokens, index, options, env)

    def image_rule(tokens, index, options, env):
        token = tokens[index]
        src = token.attrGet('src') or ''
        if not src.startswith('asset:'):
            raise BookError(f'{chapter["id"]}: images must reference local asset:name entries')
        name = src[6:]
        if name not in book.assets:
            raise BookError(f'{chapter["id"]}: unknown image asset {name}')
        figures.add(name)
        asset = book.assets[name]
        caption = html.escape(str(asset.get('caption', token.content)))
        css_class = html.escape(str(asset.get('class', '')))
        # Only template-controlled labels are supported, never arbitrary HTML.
        badges = ''.join(f'<span class="figure-label">{html.escape(str(label))}</span>'
                         for label in asset.get('labels', []))
        return (f'<figure class="{css_class}"><img src="{asset["path"].as_uri()}" '
                f'alt="{html.escape(asset["alt"], quote=True)}">'
                f'<figcaption>{badges}{caption}</figcaption></figure>')

    # Promote standalone Markdown images into block figures, avoiding invalid
    # <figure> inside <p> markup and its unpredictable empty paragraphs.
    normalized, index = [], 0
    while index < len(tokens):
        if (tokens[index].type == 'paragraph_open' and index + 2 < len(tokens)
                and tokens[index + 1].type == 'inline'
                and tokens[index + 2].type == 'paragraph_close'):
            children = tokens[index + 1].children or []
            if len(children) == 1 and children[0].type == 'image':
                block = Token('html_block', '', 0)
                block.content = image_rule(children, 0, parser.options, {})
                normalized.append(block)
                index += 3
                continue
            if any(child.type == 'image' for child in children):
                raise BookError(f'{chapter["id"]}: put each figure in its own Markdown paragraph')
        normalized.append(tokens[index])
        index += 1
    parser.renderer.rules['image'] = image_rule
    parser.renderer.rules['link_open'] = link_rule
    rendered = parser.renderer.render(normalized, parser.options, {})
    return rendered, figures


class RenderMessages(logging.Handler):
    def __init__(self):
        super().__init__(logging.WARNING)
        self.errors = []

    def emit(self, record):
        # Missing assets are fatal; other diagnostics remain in the build report.
        self.errors.append(record.getMessage())


def build_book(manifest_path, *, work_dir=None, font_dir=None):
    book = load_book(Path(manifest_path))
    font_dir = Path(font_dir or ENGINE / 'assets' / 'fonts').resolve()
    text = '\n'.join(c['path'].read_text(encoding='utf-8') + c['title'] for c in book.chapters)
    check_fonts(font_dir, text + json.dumps(book.data, ensure_ascii=False))
    chapters, used_figures = [], set()
    for chapter in book.chapters:
        content, figures = chapter_html(book, chapter)
        used_figures.update(figures)
        chapters.append({**chapter, 'html': content})
    allowed_files = {a['path'] for a in book.assets.values()}
    allowed_files.update(font_dir / name for name in FONT_FILES)
    # CSS is read from a trusted engine file, and all resource URLs are allowlisted.
    class LocalAssets(URLFetcher):
        def fetch(self, url, headers=None):
            parsed = urlparse(url)
            if parsed.scheme != 'file' or parsed.netloc not in ['', 'localhost']:
                raise BookError('Renderer denied a remote resource URL')
            candidate = Path(unquote(parsed.path)).resolve()
            if candidate not in allowed_files:
                raise BookError('Renderer denied an undeclared local resource')
            return super().fetch(url, headers)
    fetch = LocalAssets(allowed_protocols={'file'}, allow_redirects=False)

    environment = Environment(loader=FileSystemLoader(ENGINE / 'templates'),
                              autoescape=select_autoescape(['html']))
    template = environment.get_template('book.html')
    document = render_text_equivalents(template.render(book=book.data, chapters=chapters))
    css_source = (ENGINE / 'templates' / 'print.css').read_text(encoding='utf-8')
    css_source = css_source.replace('__FONT_ROOT__', font_dir.as_uri())
    scratch = Path(work_dir or ENGINE.parents[1] / '.tmp' / 'book-publish')
    scratch.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix='candidate-', dir=scratch))
    handler = RenderMessages()
    logger = logging.getLogger('weasyprint')
    logger.addHandler(handler)
    try:
        candidate = temporary / 'candidate.pdf'
        font_configuration = FontConfiguration()
        HTML(string=document, base_url=book.root.as_uri() + '/', url_fetcher=fetch).write_pdf(
            candidate, stylesheets=[CSS(string=css_source, font_config=font_configuration,
                                       url_fetcher=fetch)], font_config=font_configuration)
        if handler.errors:
            raise BookError('Renderer warnings must be resolved: ' + '; '.join(handler.errors))
        report = verify_pdf(candidate, book.data['expected_pages'])
        required_contents_links = (sum(len(group['links']) for group in book.data['navigation'])
                                   if book.data.get('navigation') else len(chapters))
        if report['internal_links'] < required_contents_links:
            raise BookError('PDF table of contents has missing internal links')
        report.update({'schema_version': 1, 'book': book.path.name, 'edition': book.data['edition'],
                       'python': platform.python_version(), 'weasyprint': weasyprint.__version__,
                       'text_normalization': 'Thai Sara Am NFKC-equivalent sequence in HTML text nodes only',
                       'pdf_sha256': digest(candidate), 'manifest_sha256': digest(book.path),
                       'inputs': {str(c['path'].relative_to(book.root)): digest(c['path']) for c in book.chapters},
                       # SVG figures can reference declared PNG context images.
                       # Hash the full allowed set, not only Markdown figures.
                       'assets': {name: digest(asset['path']) for name, asset in sorted(book.assets.items())},
                       'figures': sorted(used_figures),
                       'templates': {name: digest(ENGINE / 'templates' / name)
                                     for name in ['book.html', 'print.css']},
                       'fonts': {name: digest(font_dir / name) for name in FONT_FILES},
                       'visual_review': 'REQUIRED: inspect every rasterized PDF page before sharing'})
        book.output.parent.mkdir(parents=True, exist_ok=True)
        # os.replace on the same filesystem promotes only a fully verified candidate.
        report_path = book.output.with_suffix('.build.json')
        staged_report = temporary / 'report.json'
        staged_report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        previous_report = report_path.read_bytes() if report_path.exists() else None
        os.replace(staged_report, report_path)
        try:
            os.replace(candidate, book.output)
        except OSError:
            # A failed PDF promotion must not leave a new report describing an
            # undelivered candidate. The existing PDF has not been modified.
            if previous_report is None:
                report_path.unlink(missing_ok=True)
            else:
                restored_report = temporary / 'previous-report.json'
                restored_report.write_bytes(previous_report)
                os.replace(restored_report, report_path)
            raise
        return report
    except BookError:
        raise
    except Exception as exc:
        raise BookError(f'PDF render failed: {exc}') from exc
    finally:
        logger.removeHandler(handler)
        shutil.rmtree(temporary)
