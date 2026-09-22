"""A disposable authenticated board for browser tests."""
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import make_server

with tempfile.TemporaryDirectory() as folder:
    server = make_server('127.0.0.1', 8782, Path(folder) / 'test.sqlite3', 'browser-test-key')
    print('Film Board test server ready', flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
