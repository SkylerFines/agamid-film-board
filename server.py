"""Agamid Film Board: a small, dependency-free shared production dashboard."""
import argparse
import hmac
import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
STAGES = ['Idea', 'Planning', 'Ready to shoot', 'Filming', 'Editing', 'Done']
MAX_BODY = 16 * 1024 * 1024


def now():
    return datetime.now(timezone.utc).isoformat()


def validate(data):
    if not isinstance(data, dict):
        raise ValueError('Expected a project object.')
    result = {}
    for field, limit in [('title', 160), ('summary', 400), ('owner', 120), ('notes', 30000)]:
        value = data.get(field, '')
        if not isinstance(value, str) or len(value) > limit:
            raise ValueError(f'{field} must be text, up to {limit} characters.')
        result[field] = value.strip()
    if not result['title']:
        raise ValueError('Give this video a title.')
    result['stage'] = data.get('stage', 'Idea')
    result['priority'] = data.get('priority', 'Normal')
    if result['stage'] not in STAGES or result['priority'] not in ['High', 'Normal', 'Low']:
        raise ValueError('Choose a valid stage and priority.')
    result['shootDate'] = data.get('shootDate', '')
    if not isinstance(result['shootDate'], str):
        raise ValueError('Choose a valid shoot date.')
    if result['shootDate']:
        if date.fromisoformat(result['shootDate']).isoformat() != result['shootDate']:
            raise ValueError('Shoot dates must use YYYY-MM-DD.')
    for field, maximum in [('links', 40), ('images', 12), ('checklist', 100)]:
        items = data.get(field, [])
        if not isinstance(items, list) or len(items) > maximum:
            raise ValueError(f'{field} allows up to {maximum} entries.')
        result[field] = []
        for item in items:
            if not isinstance(item, dict):
                raise ValueError(f'Invalid {field} entry.')
            label = item.get('label', '')
            if not isinstance(label, str) or len(label) > 500:
                raise ValueError('Labels must be text, up to 500 characters.')
            if field == 'checklist':
                if type(item.get('done', False)) is not bool:
                    raise ValueError('Checklist completion must be true or false.')
                result[field].append({'label': label, 'done': item.get('done', False)})
                continue
            url = item.get('url', '')
            if not isinstance(url, str):
                raise ValueError('Enter a valid URL.')
            is_image = field == 'images' and url.startswith(('data:image/jpeg;base64,', 'data:image/png;base64,', 'data:image/webp;base64,', 'data:image/gif;base64,'))
            if is_image:
                if len(url) > 1100000:
                    raise ValueError('Each image must be smaller than 800 KB after resizing.')
            elif len(url) > 4096 or urlsplit(url).scheme not in ['https', 'http'] or not urlsplit(url).netloc:
                raise ValueError('Links must start with https:// or http://.')
            result[field].append({'label': label, 'url': url})
    return result


@contextmanager
def connect(path):
    connection = sqlite3.connect(path, timeout=10)
    try:
        connection.execute('CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL)')
        with connection:
            yield connection
    finally:
        connection.close()


class Handler(BaseHTTPRequestHandler):
    def respond(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def authorized(self):
        key = self.server.board_key
        if key and not hmac.compare_digest(self.headers.get('Authorization', '').encode(), ('Bearer ' + key).encode()):
            self.respond(401, {'error': 'Enter the board access key.'})
            return False
        origin = self.headers.get('Origin')
        if origin and urlsplit(origin).netloc != self.headers.get('Host'):
            self.respond(403, {'error': 'Cross-origin requests are not allowed.'})
            return False
        return True

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/api/projects':
            if not self.authorized():
                return
            with connect(self.server.database) as db:
                rows = db.execute('SELECT body FROM projects').fetchall()
            self.respond(200, {'projects': [json.loads(row[0]) for row in rows]})
            return
        files = {
            '/': ('index.html', 'text/html'), '/app.js': ('app.js', 'text/javascript'),
            '/style.css': ('style.css', 'text/css'), '/favicon.svg': ('favicon.svg', 'image/svg+xml'),
            '/manifest.webmanifest': ('manifest.webmanifest', 'application/manifest+json'),
            '/install.js': ('install.js', 'text/javascript'), '/sw.js': ('sw.js', 'text/javascript'),
            '/offline.html': ('offline.html', 'text/html'),
            '/icon-192.png': ('icon-192.png', 'image/png'),
            '/icon-512.png': ('icon-512.png', 'image/png'),
            '/icon-maskable-512.png': ('icon-maskable-512.png', 'image/png'),
            '/apple-touch-icon.png': ('apple-touch-icon.png', 'image/png'),
        }
        if path not in files:
            self.respond(404, {'error': 'Not found.'})
            return
        filename, mime = files[path]
        body = (ROOT / 'web' / filename).read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mime if mime == 'image/png' else mime + '; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https: http:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def do_HEAD(self):
        self.do_GET()

    def mutate(self, method):
        if not self.authorized():
            return
        path = urlsplit(self.path).path
        if (method == 'POST' and path != '/api/projects') or (method != 'POST' and not path.startswith('/api/projects/')):
            self.respond(404, {'error': 'Not found.'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length < 1 or length > MAX_BODY:
                self.respond(413, {'error': 'Request is empty or too large.'})
                return
            if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                self.respond(415, {'error': 'Use application/json.'})
                return
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError('Expected a project object.')
            with connect(self.server.database) as db:
                db.execute('BEGIN IMMEDIATE')
                if method == 'POST':
                    project = validate(data)
                    project.update(id=str(uuid.uuid4()), revision=1, createdAt=now(), updatedAt=now())
                    db.execute('INSERT INTO projects VALUES (?, ?, ?)', (project['id'], 1, json.dumps(project)))
                else:
                    project_id = path.removeprefix('/api/projects/')
                    row = db.execute('SELECT revision, body FROM projects WHERE id = ?', (project_id,)).fetchone()
                    if row is None:
                        self.respond(404, {'error': 'This video was deleted. Refresh your board.'})
                        return
                    if type(data.get('revision')) is not int or data['revision'] != row[0]:
                        self.respond(409, {'error': 'Someone else changed this video. Copy any unsaved notes, close this panel, and reopen it to get the latest version.'})
                        return
                    if method == 'DELETE':
                        db.execute('DELETE FROM projects WHERE id = ?', (project_id,))
                        project = {'deleted': project_id}
                    else:
                        project = validate(data)
                        project.update(id=project_id, revision=row[0] + 1, createdAt=json.loads(row[1])['createdAt'], updatedAt=now())
                        db.execute('UPDATE projects SET revision = ?, body = ? WHERE id = ?', (project['revision'], json.dumps(project), project_id))
            self.respond(201 if method == 'POST' else 200, project)
        except (ValueError, TypeError) as error:
            self.respond(400, {'error': str(error)})
        except sqlite3.Error:
            self.respond(503, {'error': 'Storage is temporarily unavailable. Please try again.'})

    def do_POST(self):
        self.mutate('POST')

    def do_PUT(self):
        self.mutate('PUT')

    def do_DELETE(self):
        self.mutate('DELETE')


def make_server(host, port, database, key=''):
    Path(database).parent.mkdir(parents=True, exist_ok=True)
    with connect(database):
        pass
    server = ThreadingHTTPServer((host, port), Handler)
    server.database, server.board_key = str(database), key
    return server


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8780)
    parser.add_argument('--data', default=str(ROOT / 'data' / 'film-board.sqlite3'))
    args = parser.parse_args()
    key = os.environ.get('FILM_BOARD_KEY', '')
    if args.host not in ['127.0.0.1', 'localhost', '::1'] and len(key) < 12:
        parser.error('For network sharing, set FILM_BOARD_KEY to an access key of at least 12 characters.')
    server = make_server(args.host, args.port, args.data, key)
    print(f'Agamid Film Board is running at http://{args.host}:{server.server_port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
