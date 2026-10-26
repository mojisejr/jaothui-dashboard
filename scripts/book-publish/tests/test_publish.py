"""Contract tests for an offline, portable book publisher (#62)."""
import base64
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

ENGINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE))
from manifest import BookError, load_book
from render import build_book


class PublisherContracts(unittest.TestCase):
    def setUp(self):
        scratch = ENGINE.parents[1] / '.tmp'
        scratch.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=scratch)
        self.base = Path(self.temp.name)
        self.book = self.base / 'book'
        self.book.mkdir()
        (self.book / 'intro.md').write_text('## เริ่มต้น\n\nทดลองสร้างหนังสือภาษาไทย\n')
        self.manifest = self.book / 'book.json'
        self.raw = {'schema_version': 1, 'title': 'หนังสือทดสอบ', 'subtitle': 'ตัวอย่าง',
                    'language': 'th-TH', 'edition': 'test', 'publication_date': '26 ตุลาคม 2569',
                    'output': 'test.pdf', 'expected_pages': 1,
                    'chapters': [{'id': 'intro', 'title': 'เริ่มต้น', 'source': 'intro.md'}], 'assets': {}}
        self.write()

    def tearDown(self):
        self.temp.cleanup()

    def write(self):
        self.manifest.write_text(json.dumps(self.raw, ensure_ascii=False))

    def test_missing_chapter_fails_with_actionable_message(self):
        (self.book / 'intro.md').unlink()
        with self.assertRaisesRegex(BookError, 'intro.md'):
            load_book(self.manifest)

    def test_manifest_rejects_remote_image(self):
        self.raw['assets'] = {'remote': {'src': 'https://example.test/a.png', 'alt': 'test', 'caption': 'test'}}
        self.write()
        with self.assertRaisesRegex(BookError, 'local|remote|URL'):
            load_book(self.manifest)

    def test_path_escape_and_symlink_are_rejected(self):
        outside = self.base / 'outside.md'
        outside.write_text('private')
        for value in ['../outside.md', 'escape.md']:
            if value == 'escape.md':
                (self.book / value).symlink_to(outside)
            self.raw['chapters'][0]['source'] = value
            self.write()
            with self.assertRaisesRegex(BookError, 'outside|escape'):
                load_book(self.manifest)

    def test_unknown_image_reference_fails(self):
        (self.book / 'intro.md').write_text('![ไม่พบรูป](asset:missing)')
        with self.assertRaisesRegex(BookError, 'missing'):
            build_book(self.manifest, work_dir=self.base / 'work')

    def nested_image(self, declare_context):
        png = self.book / 'context.png'
        png.write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6ZkAAAAASUVORK5CYII='))
        (self.book / 'panel.svg').write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="30" viewBox="0 0 120 30">'
            '<image href="context.png" width="120" height="30"/></svg>')
        self.raw['assets'] = {'panel': {'src': 'panel.svg', 'alt': 'กรอบภาพตัวอย่าง'}}
        if declare_context:
            self.raw['assets']['context'] = {'src': 'context.png', 'alt': 'ภาพต้นฉบับ'}
        (self.book / 'intro.md').write_text('ทดลองรูปภาพ\n\n![ภาพตัวอย่าง](asset:panel)\n')
        self.write()
        return png

    def test_declared_nested_svg_image_renders_and_hashes_actual_context(self):
        png = self.nested_image(declare_context=True)
        report = build_book(self.manifest, work_dir=self.base / 'work')
        self.assertEqual(report['pages'], 1)
        self.assertEqual(report['assets']['context'], hashlib.sha256(png.read_bytes()).hexdigest())
        self.assertIn('panel', report['assets'])

    def test_undeclared_nested_image_cannot_replace_good_pdf(self):
        self.nested_image(declare_context=False)
        target = self.book / 'test.pdf'
        target.write_bytes(b'previous-good-pdf')
        with self.assertRaisesRegex(BookError, 'undeclared|warnings'):
            build_book(self.manifest, work_dir=self.base / 'work')
        self.assertEqual(target.read_bytes(), b'previous-good-pdf')

    def test_build_report_cannot_overwrite_manifest(self):
        self.manifest.rename(self.book / 'test.build.json')
        with self.assertRaisesRegex(BookError, 'overwrite'):
            load_book(self.book / 'test.build.json')

    def test_failed_final_promotion_restores_old_pdf_and_report(self):
        target = self.book / 'test.pdf'
        sidecar = self.book / 'test.build.json'
        target.write_bytes(b'previous-good-pdf')
        sidecar.write_bytes(b'previous-good-report')
        import render
        original_replace = render.os.replace

        def fail_pdf_promotion(source, destination):
            if Path(source).name == 'candidate.pdf':
                raise OSError('simulated final promotion failure')
            return original_replace(source, destination)

        with patch.object(render.os, 'replace', side_effect=fail_pdf_promotion):
            with self.assertRaisesRegex(BookError, 'promotion failure'):
                build_book(self.manifest, work_dir=self.base / 'work')
        self.assertEqual(target.read_bytes(), b'previous-good-pdf')
        self.assertEqual(sidecar.read_bytes(), b'previous-good-report')

    def test_missing_font_does_not_replace_good_pdf(self):
        target = self.book / 'test.pdf'
        target.write_bytes(b'previous-good-pdf')
        fonts = self.base / 'fonts'
        fonts.mkdir()
        with self.assertRaisesRegex(BookError, 'font|Font'):
            build_book(self.manifest, work_dir=self.base / 'work', font_dir=fonts)
        self.assertEqual(target.read_bytes(), b'previous-good-pdf')

    def test_failed_page_verification_preserves_good_pdf(self):
        target = self.book / 'test.pdf'
        target.write_bytes(b'previous-good-pdf')
        self.raw['expected_pages'] = 4
        self.write()
        with self.assertRaisesRegex(BookError, 'page'):
            build_book(self.manifest, work_dir=self.base / 'work')
        self.assertEqual(target.read_bytes(), b'previous-good-pdf')

    def test_real_render_contains_thai_and_a4(self):
        result = build_book(self.manifest, work_dir=self.base / 'work')
        self.assertEqual(result['pages'], 1)
        self.assertGreater(result['embedded_fonts'], 0)
        from pypdf import PdfReader
        self.assertIn('ทดลองสร้างหนังสือภาษาไทย', PdfReader(self.book / 'test.pdf').pages[0].extract_text())
        self.assertGreaterEqual(result['internal_links'], 1)

    def test_relocated_engine_builds_without_dashboard_or_cwd(self):
        relocated = self.base / 'standalone'
        shutil.copytree(ENGINE, relocated / 'engine', ignore=shutil.ignore_patterns('__pycache__', 'tests'))
        result = subprocess.run([sys.executable, str(relocated / 'engine' / 'publish.py'), '--book', str(self.manifest),
                                 '--work-dir', str(self.base / 'work')], cwd=self.base,
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.book / 'test.pdf').exists())


if __name__ == '__main__':
    unittest.main()
