+++
title = "Docker for homelabbers: zero to 10 services in a weekend"
date = 2026-01-23
draft = false
tags = ['docker', 'homelab', 'self-hosting']
categories = ['Homelab']
description = "Get Docker running and deploy 10 useful homelab services in a weekend. Portainer, Nginx Proxy Manager, Uptime Kuma, Homepage, Vaultwarden, and more."
+++

Docker is the fastest way to go from bare metal to a useful homelab. No VMs to manage, no dependency conflicts, no "it works on my machine" problems. Install Docker, write a compose file, and your service is running. Here's how to get from zero to a stack of 10 useful services over a weekend.

<!--more-->

## Install Docker

On CachyOS/Arch:

```bash
sudo pacman -S docker docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
# Log out and back in for the group change to take effect
```

On Debian/Ubuntu:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Verify it works:

```bash
docker run hello-world
```

## Project structure

I keep each service in its own directory with its own `docker-compose.yml`. This makes it easy to start, stop, update, and back up individual services without touching anything else.

```
~/homelab/
├── portainer/
│   └── docker-compose.yml
├── nginx-proxy-manager/
│   └── docker-compose.yml
├── uptime-kuma/
│   └── docker-compose.yml
├── homepage/
│   └── docker-compose.yml
├── vaultwarden/
│   └── docker-compose.yml
└── ...
```

Some people prefer one giant compose file for everything. That works too, but I find per-service files easier to manage. If Vaultwarden needs an update, I go into its directory and run `docker compose pull && docker compose up -d`. Nothing else is affected.

## The first 5: your foundation

### 1. Portainer (container management UI)

Portainer gives you a web UI for managing containers. It's optional if you're comfortable with the CLI, but it's nice to have for a quick visual overview.

```yaml
# portainer/docker-compose.yml
services:
  portainer:
    image: portainer/portainer-ce:latest
    container_name: portainer
    restart: unless-stopped
    ports:
      - "9443:9443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - portainer_data:/data

volumes:
  portainer_data:
```

Access it at `https://your-server:9443`.

### 2. Nginx Proxy Manager (reverse proxy)

NPM puts all your services behind proper domain names with automatic SSL certificates. Instead of remembering `192.168.1.50:8080`, you access `portainer.homelab.local`.

```yaml
# nginx-proxy-manager/docker-compose.yml
services:
  npm:
    image: jc21/nginx-proxy-manager:latest
    container_name: nginx-proxy-manager
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "81:81"
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
```

Default login: `admin@example.com` / `changeme`. Change it immediately.

### 3. Uptime Kuma (monitoring)

A beautiful, self-hosted uptime monitor. Tracks HTTP, TCP, DNS, Docker containers, and more. Sends alerts via email, Discord, Slack, Telegram, and dozens of other channels.

```yaml
# uptime-kuma/docker-compose.yml
services:
  uptime-kuma:
    image: louislam/uptime-kuma:latest
    container_name: uptime-kuma
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/data
```

### 4. Homepage (dashboard)

Homepage is a clean, customizable dashboard that shows all your services in one place with live status widgets. It auto-discovers Docker containers and can pull stats from dozens of service APIs.

```yaml
# homepage/docker-compose.yml
services:
  homepage:
    image: ghcr.io/gethomepage/homepage:latest
    container_name: homepage
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./config:/app/config
      - /var/run/docker.sock:/var/run/docker.sock:ro
```

### 5. Vaultwarden (password manager)

A lightweight, self-hosted Bitwarden-compatible password manager. Uses under 50MB of RAM and works with all official Bitwarden clients.

```yaml
# vaultwarden/docker-compose.yml
services:
  vaultwarden:
    image: vaultwarden/server:latest
    container_name: vaultwarden
    restart: unless-stopped
    ports:
      - "8222:80"
    environment:
      SIGNUPS_ALLOWED: "false"
    volumes:
      - ./data:/data
```

**Important:** Put this behind HTTPS (via Nginx Proxy Manager) before using it. Bitwarden clients require HTTPS.

## The next 5: actually useful stuff

### 6. Jellyfin (media server)

```yaml
services:
  jellyfin:
    image: jellyfin/jellyfin:latest
    container_name: jellyfin
    restart: unless-stopped
    ports:
      - "8096:8096"
    volumes:
      - ./config:/config
      - ./cache:/cache
      - /path/to/media:/media:ro
```

### 7. Paperless-ngx (document management)

Scans, OCRs, and organizes your documents. Toss PDFs into a consume folder and it auto-tags and files them.

```yaml
services:
  paperless:
    image: ghcr.io/paperless-ngx/paperless-ngx:latest
    container_name: paperless
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      PAPERLESS_OCR_LANGUAGE: eng
    volumes:
      - ./data:/usr/src/paperless/data
      - ./media:/usr/src/paperless/media
      - ./consume:/usr/src/paperless/consume
```

### 8. Immich (photo backup)

Self-hosted Google Photos alternative. Mobile apps with auto-backup, face recognition, map view, the works.

```yaml
# Immich is more complex - use their official docker-compose
# Download it from: https://github.com/immich-app/immich/releases/latest/download/docker-compose.yml
# and the .env file from the same location
```

### 9. Gitea (Git hosting)

Lightweight self-hosted Git. Way less resource-hungry than GitLab.

```yaml
services:
  gitea:
    image: gitea/gitea:latest
    container_name: gitea
    restart: unless-stopped
    ports:
      - "3002:3000"
      - "2222:22"
    volumes:
      - ./data:/data
    environment:
      USER_UID: 1000
      USER_GID: 1000
```

### 10. Actual Budget (budgeting)

A self-hosted budgeting app that's actually good. Envelope budgeting, bank sync support, fast and clean UI.

```yaml
services:
  actual:
    image: actualbudget/actual-server:latest
    container_name: actual-budget
    restart: unless-stopped
    ports:
      - "5006:5006"
    volumes:
      - ./data:/data
```

## Persistent storage: bind mounts vs volumes

You'll notice I use bind mounts (`./data:/data`) for most services instead of Docker volumes. Both work, but bind mounts are easier to back up because the data lives in a predictable location on disk. I can `rsync` my entire `~/homelab/` directory to another machine and have a complete backup of every service's config and data.

## Updating services

```bash
cd ~/homelab/uptime-kuma
docker compose pull
docker compose up -d
```

That pulls the latest image and recreates the container with the same config and data. Takes seconds.

To update everything at once:

```bash
for dir in ~/homelab/*/; do
    echo "Updating $dir"
    cd "$dir" && docker compose pull && docker compose up -d
    cd ..
done
```

## What's next

Once you have these 10 running, you'll start thinking about monitoring (Grafana + Prometheus), automation (Ansible to set up new Docker hosts), and maybe Kubernetes when Docker Compose starts feeling limiting. But for a weekend project, this stack gives you a seriously useful homelab.

If you're getting started with Docker and hit a wall, email me at chris@chrisputer.tech.
