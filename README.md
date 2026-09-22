# Film Board

A shared dashboard for turning video ideas into finished productions. Built with Python's standard library, SQLite, and plain HTML/CSS/JavaScript. No npm install or paid service is needed to run it.

## Run locally

Requires Python 3.10 or newer.

```sh
python3 server.py
```

Open **http://localhost:8780**. On Windows, double-click `start.cmd` (Python must be on PATH), or run `python server.py` from this folder. In WSL, run `./start.sh`.

The initial board is empty. Create a video, or use **Try three example videos** to explore the workflow. Examples are added to the shared database and can be edited or deleted.

## Share with your crew

Everyone must connect to **the same running server**. Running separate copies on separate devices creates separate boards. Changes refresh every eight seconds while the page is visible. Each editor saves explicitly. If two people edit the same video, the second save is rejected so it cannot overwrite the first person's work. Copy unsaved notes before closing and reopening a conflicting video.

On a trusted local network, set an access key and bind the server to the network:

```sh
export FILM_BOARD_KEY='replace-with-a-long-private-key'
python3 server.py --host 0.0.0.0
```

Windows PowerShell:

```powershell
$env:FILM_BOARD_KEY = 'replace-with-a-long-private-key'
python server.py --host 0.0.0.0
```

Give collaborators `http://YOUR-COMPUTER-LAN-IP:8780` and the access key. Allow port 8780 through the host firewall for private networks if needed. For access from other devices when developing in WSL, running the server directly on Windows is usually simpler than configuring WSL forwarding. The host computer must stay running. Network binding requires an access key at least 12 characters long; it protects both reads and writes. The browser remembers the key for that tab's session.

For collaborators outside your local network, deploy this repo on an always-on host with persistent disk, place an HTTPS reverse proxy in front of the server, and set `FILM_BOARD_KEY`. Forward the original `Host` header so same-origin checks work. Keep the Python port private behind the proxy. Public deployment, a domain, and hosting are not configured by this repo. This is a small trusted-team app with one shared access key, not individual accounts or permission roles. Plain HTTP is intended only for a trusted local network; use HTTPS remotely.

## Working with the board

- Stages: Idea → Planning → Ready to shoot → Filming → Editing → Done. Change a video's stage in its detail panel.
- Board and table views; search title, pitch, people, and notes.
- Sort by recent updates, shoot date, priority, title, or stage. In board view, the selected sort applies within each stage. Use table view for sorting across the entire board.
- Filter by stage or priority; sidebar shortcuts for upcoming shoots and completed videos.
- Per-video notes, owner/collaborators, shoot date, priority, and checklist.
- Reference links and up to 12 images per video, uploaded or linked. Uploads are resized to a maximum 1400 pixels and stored with the project; animated GIFs become a still image. Linked images must remain available at their original URL.
- Use the down arrow at the bottom of the sidebar to export the latest board as JSON. You can also export from the mobile toolbar.

## Data and backups

Data lives in `data/film-board.sqlite3`, excluded from Git. Changing the repo or restarting the server does not clear it. Uploaded images are embedded in project data. The JSON export includes projects and uploaded images; an in-app JSON restore interface is not included.

For a restorable database backup, stop the server and copy `data/film-board.sqlite3` somewhere safe. To restore, stop the server, preserve the current database, and replace it with your backup. Restart the server. For a different storage location or port:

```sh
python3 server.py --data /path/to/film-board.sqlite3 --port 8781
```

## Verify

```sh
python3 -m unittest discover -s tests -v
node --check web/app.js
```

Tests use temporary databases and do not modify your board. Node is only needed for the optional JavaScript syntax check.

The optional browser suite requires Node 20 or newer:

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

It starts an isolated server on port 8782 and checks image uploads, saved details, filters, exports, mobile layout, and conflicting edits from two separate browser sessions. Run these commands in WSL, macOS, or Linux (the test fixture command uses `python3`).

The server is intended for a small crew. It sends the whole board on refresh, including uploaded images; a large archive would benefit from separate image storage and incremental synchronization.
