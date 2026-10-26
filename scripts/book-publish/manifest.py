"""Portable book inputs. Nothing here loads app configuration or credentials."""
from dataclasses import dataclass
import json
from pathlib import Path
import re
from urllib.parse import urlparse


class BookError(ValueError):
    """A user-actionable publishing error."""


def local_path(base: Path, value: str, label: str, *, exists=True) -> Path:
    if not isinstance(value, str) or not value.strip() or urlparse(value).scheme or value.startswith('//'):
        raise BookError(f'{label}: use a local relative path, not a remote URL')
    candidate = Path(value)
    if candidate.is_absolute():
        raise BookError(f'{label}: absolute path is outside the book')
    resolved = (base / candidate).resolve()
    if not resolved.is_relative_to(base.resolve()):
        raise BookError(f'{label}: path escapes outside the book')
    if exists and not resolved.is_file():
        raise BookError(f'{label}: missing file {value}')
    return resolved


@dataclass
class Book:
    path: Path
    root: Path
    data: dict
    chapters: list
    assets: dict
    output: Path


def load_book(path: Path) -> Book:
    path = Path(path).resolve()
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError) as exc:
        raise BookError(f'Cannot read book manifest {path.name}: {exc}') from exc
    if not isinstance(data, dict) or data.get('schema_version') != 1:
        raise BookError('book.json needs schema_version: 1')
    for name in ['title', 'language', 'edition', 'publication_date', 'output']:
        if not isinstance(data.get(name), str) or not data[name].strip():
            raise BookError(f'book.json needs non-empty {name}')
    if not isinstance(data.get('expected_pages'), int) or not 1 <= data['expected_pages'] <= 500:
        raise BookError('expected_pages must be between 1 and 500')
    if 'frontmatter' in data and not isinstance(data['frontmatter'], bool):
        raise BookError('frontmatter must be true or false')
    if 'cover' in data and (not isinstance(data['cover'], dict)
                            or any(not isinstance(v, str) for v in data['cover'].values())):
        raise BookError('cover must be an object with text values')
    chapters = data.get('chapters')
    if not isinstance(chapters, list) or not chapters:
        raise BookError('chapters must be a non-empty ordered list')
    resolved_chapters, ids = [], set()
    for chapter in chapters:
        if not isinstance(chapter, dict) or not re.fullmatch('[a-z][a-z0-9-]*', str(chapter.get('id', ''))):
            raise BookError('Each chapter needs a lowercase id')
        if chapter['id'] in ids:
            raise BookError(f'Duplicate chapter id: {chapter["id"]}')
        ids.add(chapter['id'])
        if not isinstance(chapter.get('title'), str) or not chapter['title'].strip():
            raise BookError(f'Chapter {chapter["id"]} needs a title')
        source = local_path(path.parent, chapter.get('source'), 'chapter')
        if source.suffix != '.md':
            raise BookError('Chapter sources must be .md files')
        resolved_chapters.append({**chapter, 'path': source})
    assets = data.get('assets', {})
    if not isinstance(assets, dict):
        raise BookError('assets must be an object')
    resolved_assets = {}
    for name, asset in assets.items():
        if not re.fullmatch('[a-z][a-z0-9-]*', name) or not isinstance(asset, dict):
            raise BookError('Asset keys must be lowercase names')
        if not isinstance(asset.get('alt'), str) or not asset['alt'].strip():
            raise BookError(f'Asset {name} needs descriptive alt text')
        resolved = local_path(path.parent, asset.get('src'), f'asset {name}')
        if resolved.suffix.lower() not in {'.png', '.jpg', '.jpeg', '.svg'}:
            raise BookError(f'Asset {name}: supported images are PNG, JPEG and SVG')
        resolved_assets[name] = {**asset, 'path': resolved}
    output = local_path(path.parent, data['output'], 'output', exists=False)
    if output.suffix.lower() != '.pdf':
        raise BookError('output must end in .pdf')
    sources = {path, *(c['path'] for c in resolved_chapters), *(a['path'] for a in resolved_assets.values())}
    if output in sources or output.with_suffix('.build.json') in sources:
        raise BookError('output or build report must not overwrite a book source')
    return Book(path, path.parent, data, resolved_chapters, resolved_assets, output)
