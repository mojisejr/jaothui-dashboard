"""PDF checks complement the required visual review of every rendered page."""
from pathlib import Path
from pypdf import PdfReader
from manifest import BookError


def verify_pdf(path: Path, expected_pages=None) -> dict:
    try:
        reader = PdfReader(path, strict=True)
        if not reader.pages:
            raise BookError('PDF has no pages')
        if expected_pages is not None and len(reader.pages) != expected_pages:
            raise BookError(f'Expected {expected_pages} pages, rendered {len(reader.pages)} pages')
        fonts, internal_links, external_links = set(), 0, 0
        characters = 0
        for number, page in enumerate(reader.pages, 1):
            width, height = float(page.mediabox.width), float(page.mediabox.height)
            if abs(width - 595.276) > 1 or abs(height - 841.89) > 1:
                raise BookError(f'PDF page {number} is not A4 portrait')
            text = page.extract_text() or ''
            characters += len(text)
            if '\ufffd' in text or '\u25a1' in text:
                raise BookError(f'PDF page {number} contains missing-glyph markers')
            for reference in page.get('/Resources', {}).get('/Font', {}).values():
                font = reference.get_object()
                descendants = font.get('/DescendantFonts', [])
                concrete = descendants[0].get_object() if descendants else font
                descriptor = concrete.get('/FontDescriptor')
                if descriptor:
                    descriptor = descriptor.get_object()
                    if any(key in descriptor for key in ['/FontFile', '/FontFile2', '/FontFile3']):
                        fonts.add(str(font.get('/BaseFont')))
            for ref in page.get('/Annots', []):
                annotation = ref.get_object()
                if annotation.get('/Subtype') != '/Link':
                    continue
                if '/Dest' in annotation:
                    internal_links += 1
                elif annotation.get('/A', {}).get('/S') == '/URI':
                    external_links += 1
        if characters < 10:
            raise BookError('PDF has no useful selectable text')
        if not fonts:
            raise BookError('PDF has no embedded fonts')
        return {'pages': len(reader.pages), 'embedded_fonts': len(fonts),
                'internal_links': internal_links, 'external_links': external_links,
                'selectable_characters': characters, 'bookmarks': len(reader.outline)}
    except BookError:
        raise
    except Exception as exc:
        raise BookError(f'PDF verification failed: {exc}') from exc
