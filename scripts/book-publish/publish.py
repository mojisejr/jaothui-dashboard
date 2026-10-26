#!/usr/bin/env python3
"""Build a local book PDF. 'Publish' never uploads or changes a running app."""
import argparse
import json
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser(description='Build a local illustrated book PDF from book.json')
    parser.add_argument('--book', type=Path, help='Book manifest; all content paths are relative to this file')
    parser.add_argument('--work-dir', type=Path, help='Optional scratch directory (default: project .tmp)')
    parser.add_argument('--check', type=Path, help='Verify an existing PDF without rebuilding it')
    args = parser.parse_args()
    if bool(args.book) == bool(args.check):
        parser.error('provide exactly one of --book or --check')
    try:
        from manifest import BookError
        if args.check:
            from verify import verify_pdf
            report = verify_pdf(args.check)
        else:
            from render import build_book
            report = build_book(args.book, work_dir=args.work_dir)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except ImportError as exc:
        print('Missing document dependency. Install scripts/book-publish/requirements.txt '
              'in a separate Python virtual environment. Detail: ' + str(exc), file=sys.stderr)
        return 2
    except OSError as exc:
        print('Document runtime could not load a native library or file. On macOS, '
              'follow the Pango library-path setup in scripts/book-publish/README.md. '
              'Detail: ' + str(exc), file=sys.stderr)
        return 2
    except BookError as exc:
        print(f'Book publish failed: {exc}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
