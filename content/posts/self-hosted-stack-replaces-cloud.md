+++
title = "The self-hosted stack that replaces $200/month in cloud services"
date = 2026-02-02
draft = false
tags = ['self-hosting', 'homelab', 'docker']
categories = ['Homelab']
description = "Replace $200/month in cloud subscriptions with self-hosted alternatives running on a single mini PC. Nextcloud, Vaultwarden, Gitea, Immich, Jellyfin, and more."
+++

I added up what I was paying for cloud services a while back and hit about $200/month. Cloud storage, password manager, photo backup, Git hosting, media streaming, uptime monitoring, budgeting app. None of them were expensive individually, but they add up. Most of them now run on a single mini PC in my office that idles at 15W. Here's the full stack.

<!--more-->

## The math

Here's what I was paying before self-hosting:

| Service | Cloud Cost/mo | Self-Hosted Replacement |
|---------|--------------|------------------------|
| Google One (2TB) | $10 | Nextcloud |
| 1Password Family | $5 | Vaultwarden |
| GitHub Pro | $4 | Gitea |
| Google Photos (storage) | (included above) | Immich |
| Plex Pass | $5 | Jellyfin |
| UptimeRobot Pro | $7 | Uptime Kuma |
| YNAB | $15 | Actual Budget |
| Paperless (was physical filing) | N/A | Paperless-ngx |
| Various other SaaS | ~$30 | Various containers |

**Cloud total: ~$200/month, ~$2,400/year.**

**Self-hosted cost: a $400 mini PC, 15W of electricity (~$2/month), and my time.**

The mini PC paid for itself in two months. Even if you value your time highly, the initial setup is a weekend project and ongoing maintenance is minimal.

## The hardware

A Beelink SER7 or Minisforum UM790 Pro with 32-64GB DDR5 RAM and a 1TB NVMe drive handles all of this easily. These services are not resource-hungry. The whole stack uses maybe 8-12GB of RAM and barely touches the CPU except during Nextcloud syncs or Immich face recognition processing.

Power draw: 12-18W at idle. That's about $2/month in electricity.

## The stack

Everything runs in Docker with individual Compose files per service. Here's what's running:

### Nextcloud (cloud storage, calendar, contacts)

Replaces: Google Drive, Google Calendar, Google Contacts

```yaml
services:
  nextcloud:
    image: nextcloud:latest
    container_name: nextcloud
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - ./data:/var/www/html
      - /mnt/storage/nextcloud:/var/www/html/data
    environment:
      MYSQL_HOST: nextcloud-db
      MYSQL_DATABASE: nextcloud
      MYSQL_USER: nextcloud
      MYSQL_PASSWORD: your-db-password

  nextcloud-db:
    image: mariadb:11
    container_name: nextcloud-db
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: your-root-password
      MYSQL_DATABASE: nextcloud
      MYSQL_USER: nextcloud
      MYSQL_PASSWORD: your-db-password
    volumes:
      - ./db:/var/lib/mysql
```

Nextcloud is the most complex piece to set up properly. Get HTTPS working (via Nginx Proxy Manager or Caddy) before doing anything else. The desktop and mobile sync clients work well once the server is configured correctly.

### Vaultwarden (passwords)

Replaces: 1Password, Bitwarden Premium

Under 50MB RAM, full compatibility with all Bitwarden apps. I covered this in detail in my Vaultwarden post.

### Gitea (Git hosting)

Replaces: GitHub Pro, GitLab

Lightweight, fast, and does everything I need for personal repos. CI/CD through Gitea Actions (GitHub Actions compatible) or Woodpecker CI.

### Immich (photo backup)

Replaces: Google Photos

This is the one that impresses me the most. Mobile app with auto-backup, face recognition, location maps, album sharing, and a timeline view that's nearly as good as Google Photos. Active development, new features constantly.

Immich is the heaviest service in the stack. Face recognition and ML features use some CPU, and the database wants 2-4GB of RAM. Still manageable on a mini PC with 32GB.

### Jellyfin (media streaming)

Replaces: Plex Pass

Free, open source, no account required, no telemetry. Hardware transcoding works with Intel Quick Sync (which most mini PCs have). Clients for every platform.

### Uptime Kuma (monitoring)

Replaces: UptimeRobot Pro

Monitors all my services and external sites. Sends alerts via Discord and email. Beautiful dashboard.

### Actual Budget (budgeting)

Replaces: YNAB

Envelope budgeting, bank sync (through GoCardless/SimpleFIN), fast UI. The sync server is under 50MB RAM.

### Paperless-ngx (document management)

Replaces: A filing cabinet and scattered PDFs

Drop a PDF into the consume folder (or email it, or scan it with the mobile app) and Paperless OCRs it, auto-tags it, and files it. Searching for tax documents is now instant instead of digging through folders.

## The stuff I still pay for

Self-hosting isn't an all-or-nothing proposition. Some things are better left to the cloud:

- **Email.** Self-hosting email is a nightmare of deliverability, spam filtering, and reputation management. I use Fastmail ($5/month). Worth every penny.
- **Domain and DNS.** Cloudflare (free tier) for DNS, $10-15/year for the domain.
- **Offsite backups.** I replicate critical data to a Backblaze B2 bucket ($0.005/GB/month). About $3/month for 600GB.

## Backup strategy

Self-hosting means you're responsible for backups. My approach:

1. **Local snapshots.** ZFS snapshots every hour, retained for 30 days.
2. **On-site replica.** Syncoid replication to a second machine nightly.
3. **Off-site.** Critical data (documents, passwords, photos) synced to Backblaze B2 via restic.

```bash
# Restic backup to B2 (runs nightly via systemd timer)
export B2_ACCOUNT_ID="your-account-id"
export B2_ACCOUNT_KEY="your-account-key"
restic -r b2:your-bucket-name:/backups backup \
  /mnt/storage/nextcloud \
  /mnt/storage/vaultwarden \
  /mnt/storage/immich \
  /mnt/storage/paperless
```

If the mini PC dies, I can buy a new one, restore from backups, and be running again in a few hours.

## The honest downsides

- **Initial setup takes a weekend.** Not hard, but not instant either.
- **You're the sysadmin.** If something breaks at 2 AM, there's no support ticket to file.
- **Updates are your responsibility.** I spend maybe 30 minutes a month pulling new images and checking changelogs.
- **Mobile apps vary.** Nextcloud and Immich have good mobile apps. Some other services rely on the web UI.
- **Sharing with non-technical family.** Getting my wife to use Nextcloud instead of Google Drive took some patience. It works fine now, but the onboarding isn't as smooth as commercial services.

Despite all that, I'd never go back. The stack is reliable, the data is mine, and the $200/month savings is real.

If you're thinking about self-hosting and want to know where to start, email me at chris@chrisputer.tech.
