+++
title = "Self-hosting Vaultwarden: your own password manager in 20 minutes"
date = 2026-02-04
draft = false
tags = ['vaultwarden', 'passwords', 'homelab', 'docker', 'self-hosting']
categories = ['Homelab']
description = "Set up Vaultwarden, a self-hosted Bitwarden-compatible password manager, in 20 minutes with Docker. Under 50MB RAM, full client compatibility."
+++

Vaultwarden is a lightweight, self-hosted implementation of the Bitwarden server API. It uses under 50MB of RAM, works with every official Bitwarden client (desktop, mobile, browser extension), and takes about 20 minutes to deploy. If you're already running Docker in your homelab, this is one of the easiest and most valuable services you can self-host.

<!--more-->

## Why Vaultwarden instead of Bitwarden?

The official Bitwarden server is written in .NET and requires Microsoft SQL Server. It's heavy. The minimum deployment uses multiple containers and wants several GB of RAM.

Vaultwarden is a community rewrite in Rust. It implements the same API, so all official Bitwarden clients work with it, but it runs in a single container using 30-50MB of RAM. For a homelab or small team, it's the obvious choice.

Features included that normally require Bitwarden Premium ($10/year):

- TOTP authenticator (built-in 2FA code storage)
- File attachments
- Emergency access
- Bitwarden Send (encrypted file/text sharing)
- Organization support for family/team sharing

## Deploy with Docker Compose

```yaml
# vaultwarden/docker-compose.yml
services:
  vaultwarden:
    image: vaultwarden/server:latest
    container_name: vaultwarden
    restart: unless-stopped
    ports:
      - "8222:80"
      - "3012:3012"
    environment:
      DOMAIN: "https://vault.yourdomain.com"
      SIGNUPS_ALLOWED: "true"
      WEBSOCKET_ENABLED: "true"
      ADMIN_TOKEN: "your-long-random-admin-token-here"
    volumes:
      - ./data:/data
```

```bash
cd ~/homelab/vaultwarden
docker compose up -d
```

Port 8222 is the web vault. Port 3012 is for WebSocket notifications (live sync between clients).

**Generate a proper admin token:**

```bash
# Use openssl to generate a random token
openssl rand -base64 48
```

The `ADMIN_TOKEN` gives you access to the admin panel at `https://vault.yourdomain.com/admin`, where you can manage users, view diagnostics, and change settings.

## HTTPS is mandatory

Bitwarden clients refuse to connect over plain HTTP (and they should). You need HTTPS. Two good options:

### Option A: Nginx Proxy Manager

If you're already running NPM in your homelab, add a proxy host:

1. Domain: `vault.yourdomain.com`
2. Forward to: `your-server-ip:8222`
3. Enable SSL with Let's Encrypt
4. Add a custom location for WebSocket: `/notifications/hub` forwarded to port 3012

### Option B: Caddy (simpler)

Caddy does automatic HTTPS with zero config. Add it alongside Vaultwarden:

```yaml
services:
  vaultwarden:
    image: vaultwarden/server:latest
    container_name: vaultwarden
    restart: unless-stopped
    environment:
      DOMAIN: "https://vault.yourdomain.com"
      SIGNUPS_ALLOWED: "true"
      WEBSOCKET_ENABLED: "true"
      ADMIN_TOKEN: "your-long-random-admin-token-here"
    volumes:
      - ./vw-data:/data

  caddy:
    image: caddy:2
    container_name: caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - ./caddy-data:/data
      - ./caddy-config:/config
```

Create the Caddyfile:

```
vault.yourdomain.com {
    reverse_proxy /notifications/hub vaultwarden:3012
    reverse_proxy vaultwarden:80
}
```

That's it. Caddy automatically gets a Let's Encrypt certificate and renews it. No clicking through UIs, no manual cert management.

## Initial setup

1. Navigate to `https://vault.yourdomain.com`.
2. Create your account.
3. **Immediately set `SIGNUPS_ALLOWED: "false"`** in your compose file and restart the container. You don't want random people creating accounts on your instance.

```bash
# After creating your account, disable signups
# Edit docker-compose.yml: SIGNUPS_ALLOWED: "false"
docker compose up -d
```

## Set up the clients

Install the Bitwarden app or browser extension on your devices. When it asks for the server URL, enter your custom domain:

- Server URL: `https://vault.yourdomain.com`

That's the only difference from using Bitwarden's cloud. Everything else (auto-fill, browser extension, mobile app) works identically.

## Enable two-factor authentication

Do this immediately after creating your account. Go to Settings > Security > Two-step Login in the web vault. Use a TOTP app (Aegis on Android, Raivo on iOS, or whatever you prefer). Don't skip this step.

## Backups

Your entire vault lives in the `./data` directory. Back it up.

```bash
# Simple backup script
#!/bin/bash
BACKUP_DIR="/mnt/storage/backups/vaultwarden"
DATE=$(date +%Y-%m-%d)

mkdir -p "$BACKUP_DIR"

# Stop the container briefly for a clean backup
docker compose -f ~/homelab/vaultwarden/docker-compose.yml stop
cp -r ~/homelab/vaultwarden/data "$BACKUP_DIR/vaultwarden-$DATE"
docker compose -f ~/homelab/vaultwarden/docker-compose.yml start

# Keep only the last 30 backups
ls -dt "$BACKUP_DIR"/vaultwarden-* | tail -n +31 | xargs rm -rf
```

The database is SQLite, so a file copy while the container is stopped is a clean backup. You can also enable the built-in backup feature in the admin panel, which creates database dumps on a schedule.

For extra safety, I also export my vault periodically using the Bitwarden CLI:

```bash
# Install the Bitwarden CLI
npm install -g @bitwarden/cli

# Export (encrypted JSON)
bw config server https://vault.yourdomain.com
bw login
bw export --format encrypted_json --output ~/vault-export.json
```

Store that export somewhere separate from the server. If your Vaultwarden instance and its backups are both gone, the export file lets you restore into any Bitwarden-compatible server.

## Hardening

A few settings to tighten up after the basics are working:

```yaml
environment:
  SIGNUPS_ALLOWED: "false"         # No new registrations
  INVITATIONS_ALLOWED: "false"     # No email invites
  SHOW_PASSWORD_HINT: "false"      # Don't leak password hints
  PASSWORD_ITERATIONS: "600000"    # OWASP recommended PBKDF2 iterations
  LOG_LEVEL: "warn"                # Reduce log verbosity
```

## What about reliability?

"What if your server goes down and you can't log in to anything?"

Bitwarden clients cache your vault locally. Your phone, laptop, and browser extension all have an offline copy. If the server is down for hours or even days, you can still access all your passwords. The server only needs to be up for syncing changes between devices.

That said, I still keep a printed copy of my most critical credentials (email, bank, Vaultwarden admin) in a fireproof safe. Belt and suspenders.

## The bottom line

Vaultwarden is one of the best self-hosted services out there. It's lightweight, reliable, compatible with polished commercial clients, and solves a real security need. If you self-host one thing, make it this.

If you run into any trouble setting it up, feel free to reach out at chris@chrisputer.tech.
