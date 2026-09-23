import concurrent.futures
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import make_server


class BoardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.db = Path(cls.temp.name) / 'board.sqlite3'
        cls.server = make_server('127.0.0.1', 0, cls.db, 'test-access-key')
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def request(self, method='GET', path='/api/projects', data=None, key='test-access-key', headers=None):
        request = Request(self.url + path, method=method,
                          data=json.dumps(data).encode() if data is not None else None,
                          headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, **(headers or {})})
        try:
            response = urlopen(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            content = response.read()
            return response.status, json.loads(content) if 'json' in response.headers.get('Content-Type', '') else content

    def create(self, **fields):
        status, project = self.request('POST', data={'title': 'A short film', **fields})
        self.assertEqual(status, 201, project)
        return project

    def test_project_lifecycle_and_storage(self):
        p = self.create(notes='Shot list\n1. Wide\n2. Close-up', owner='Crew', shootDate='2026-10-05',
                        links=[{'label': 'Reference', 'url': 'https://example.com'}],
                        images=[{'label': 'Image', 'url': 'https://example.com/image.jpg'}],
                        checklist=[{'label': 'Confirm gear', 'done': False}])
        status, result = self.request('GET')
        self.assertEqual(status, 200)
        self.assertIn(p, result['projects'])
        p['stage'] = 'Done'
        p['checklist'][0]['done'] = True
        status, saved = self.request('PUT', '/api/projects/' + p['id'], p)
        self.assertEqual(status, 200)
        self.assertEqual(saved['revision'], 2)
        self.assertEqual(saved['stage'], 'Done')
        self.assertEqual(saved['createdAt'], p['createdAt'])
        # A separate server instance sees the same durable database.
        second = make_server('127.0.0.1', 0, self.db)
        from server import connect
        with connect(second.database) as db:
            stored = json.loads(db.execute('SELECT body FROM projects WHERE id=?', (p['id'],)).fetchone()[0])
        second.server_close()
        self.assertEqual(stored, saved)
        self.assertEqual(self.request('DELETE', '/api/projects/' + p['id'], {'revision': 2})[0], 200)
        self.assertEqual(self.request('PUT', '/api/projects/' + p['id'], saved)[0], 404)

    def test_concurrent_edits_allow_exactly_one_writer(self):
        p = self.create()
        def save(stage):
            return self.request('PUT', '/api/projects/' + p['id'], {**p, 'stage': stage})[0]
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(save, ['Planning', 'Editing']))
        self.assertEqual(sorted(results), [200, 409])
        self.assertEqual(self.request('DELETE', '/api/projects/' + p['id'], {'revision': 1})[0], 409)

    def test_auth_required_to_read_and_write(self):
        for method, data in [('GET', None), ('POST', {'title': 'Denied'}), ('PUT', {'title': 'Denied'}), ('DELETE', {'revision': 1})]:
            with self.subTest(method=method):
                self.assertEqual(self.request(method, data=data, key='wrong')[0], 401)
        self.assertEqual(self.request(key='')[0], 401)

    def test_cross_origin_write_is_denied(self):
        self.assertEqual(self.request('POST', data={'title': 'Denied'}, headers={'Origin': 'https://other-site.example'})[0], 403)

    def test_invalid_data_and_unsafe_urls(self):
        for body in [[], {'title': ''}, {'title': 'x', 'stage': 'Invalid'}, {'title': 'x', 'shootDate': 'not-a-date'},
                     {'title': 'x', 'shootDate': '20260201'}, {'title': 'x', 'links': [{'url': 'javascript:alert(1)'}]},
                     {'title': 'x', 'images': [{'url': 'data:image/svg+xml,<svg/>'}]}, {'title': 'x', 'checklist': [{'label': 'x', 'done': 'false'}]}]:
            with self.subTest(body=body):
                self.assertEqual(self.request('POST', data=body)[0], 400)

    def test_markup_is_stored_as_text(self):
        p = self.create(title='<img src=x onerror=alert(1)>', notes='<script>alert(1)</script>')
        self.assertEqual(p['title'], '<img src=x onerror=alert(1)>')

    def test_static_routing_and_headers(self):
        for path in ['/', '/app.js', '/style.css', '/favicon.svg']:
            with urlopen(self.url + path) as response:
                self.assertEqual(response.status, 200)
                self.assertIn("script-src 'self'", response.headers['Content-Security-Policy'])
        for path in ['/server.py', '/data/board.sqlite3', '/../../server.py']:
            self.assertEqual(self.request(path=path)[0], 404)

    def test_body_content_type_and_size(self):
        self.assertEqual(self.request('POST', data={'title': 'x'}, headers={'Content-Type': 'text/plain'})[0], 415)
        self.assertEqual(self.request('POST', data={'title': 'x'}, headers={'Content-Length': str(17 * 1024 * 1024)})[0], 413)

    def test_install_assets_are_public_but_board_stays_protected(self):
        with urlopen(self.url + '/manifest.webmanifest') as response:
            self.assertEqual(response.headers.get_content_type(), 'application/manifest+json')
            manifest = json.load(response)
        self.assertEqual(manifest['name'], 'Agamid Film Board')
        self.assertEqual(manifest['start_url'], '/')
        self.assertEqual(manifest['display'], 'standalone')
        import struct
        for icon in manifest['icons']:
            with urlopen(self.url + icon['src']) as response:
                self.assertEqual(response.headers.get_content_type(), 'image/png')
                png = response.read()
                self.assertEqual(png[:8], b'\x89PNG\r\n\x1a\n')
                width, height = struct.unpack('>II', png[16:24])
                self.assertEqual(icon['sizes'], f'{width}x{height}')
        for path in ['/', '/sw.js', '/install.js', '/offline.html', '/apple-touch-icon.png']:
            with urlopen(Request(self.url + path, method='HEAD')) as response:
                self.assertEqual(response.status, 200)
                self.assertGreater(int(response.headers['Content-Length']), 0)
                self.assertEqual(response.read(), b'')
        self.assertEqual(self.request(key='')[0], 401)


if __name__ == '__main__':
    unittest.main()
