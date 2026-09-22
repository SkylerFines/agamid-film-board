# Hosting Agamid Film Board for collaborators in different locations

The app supports shared editing, but the local URL is only a preview. Internet access needs an always-on host, a public domain, and HTTPS. The included Docker Compose configuration runs Agamid Film Board behind Caddy, which handles HTTPS. This configuration has not yet been deployed to an internet host.

## On a server with Docker Compose

1. Copy or clone this repository onto the server. Point your domain's DNS address record at that server. Allow inbound TCP ports 80 and 443. Do not expose the Python port 8780 directly.
2. Copy `.env.example` to `.env`. Set `FILM_BOARD_DOMAIN` to the domain without `https://` or a path. Generate a private access key with `python3 -c "import secrets; print(secrets.token_urlsafe(32))"` and set `FILM_BOARD_KEY` to that value. Do not send the key in source control.
3. Check the configuration and start the containers:

   ```sh
   docker compose config --quiet
   docker compose up -d --build
   docker compose logs --tail=50
   ```

4. Open `https://YOUR-DOMAIN`, enter the access key, and create a test video. Open the same URL on another device with the same key and confirm that edits appear.
5. Share the HTTPS URL and access key privately with your collaborators. Everyone with the key can read, edit, and delete any video. Individual accounts and permissions are not part of this first version.

Agamid Film Board runs as an unprivileged user. Its data stays in the `board-data` Docker volume across normal restarts and rebuilds. Caddy certificate data is also persisted. Keep one Agamid Film Board instance attached to this database; this setup is not for horizontal scaling.

## Back up the hosted database

The JSON export in the app is useful for taking a readable copy of all project data. For a directly restorable database copy, use SQLite's online backup API inside the container, then copy out the result:

```sh
docker compose exec board python -c "import sqlite3; source=sqlite3.connect('/app/data/film-board.sqlite3'); target=sqlite3.connect('/app/data/backup.sqlite3'); source.backup(target); target.close(); source.close()"
docker compose cp board:/app/data/backup.sqlite3 ./film-board-backup.sqlite3
```

Store backups away from the host. Do not run `docker compose down -v` unless you intentionally want to delete the board and certificate data.

To update the app, pull or copy the new source and run `docker compose up -d --build`. To change the shared key, update `.env` and run the same command; collaborators will need the new key.

## Managed hosting

The `Dockerfile` can also run on a service that supports a persistent disk. Configure the service to route HTTPS to container port 8780, mount persistent storage at `/app/data` with write access for UID 10001, and set the `FILM_BOARD_KEY` secret. Keep one instance and preserve the incoming `Host` header. A host with only temporary disk storage will lose the board when the container is replaced.

An account, deployment target, and any hosting charges need to be settled before publishing. No hosting account or public URL has been created by these files.
