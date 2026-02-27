+++
title = "Hosting game servers on Linux"
date = 2026-02-18
draft = false
tags = ['gaming', 'linux', 'docker', 'homelab']
categories = ['Homelab']
description = "How to host game servers on Linux with Docker. Covers Minecraft, Valheim, Palworld, and connecting friends via WireGuard."
+++

Running your own game servers is one of the most satisfying homelab projects. No monthly rental fees, no random strangers, full control over settings and mods. And with Docker, spinning up a new server takes five minutes instead of an afternoon of manual setup. Here's how to host the popular ones on Linux.

<!--more-->

## Hardware requirements

Game servers are more CPU and RAM hungry than most homelab services. Here's what you actually need:

| Game | RAM | CPU | Storage | Notes |
|------|-----|-----|---------|-------|
| Minecraft (Java) | 2-4GB | 2 cores | 5-10GB | More RAM for mods, 4GB comfortable for 10 players |
| Valheim | 4-8GB | 2-4 cores | 5GB | Memory usage grows with world exploration |
| Palworld | 16-32GB | 4+ cores | 20GB+ | This game is a RAM monster |
| Satisfactory | 6-12GB | 4 cores | 10GB+ | Scales with factory complexity |
| Terraria | 1-2GB | 1-2 cores | 1GB | Very lightweight |

A mini PC with 32GB RAM handles Minecraft and Valheim easily. Palworld wants a more serious machine or a used server with 64GB+ RAM.

## Minecraft with Docker

The `itzg/minecraft-server` container is the gold standard. It handles Java versions, server properties, mods, and updates automatically.

### Vanilla server

```yaml
# minecraft/docker-compose.yml
services:
  minecraft:
    image: itzg/minecraft-server:latest
    container_name: minecraft
    restart: unless-stopped
    ports:
      - "25565:25565"
    environment:
      EULA: "TRUE"
      TYPE: "VANILLA"
      VERSION: "LATEST"
      MEMORY: "4G"
      MAX_PLAYERS: 10
      MOTD: "Chris's Minecraft Server"
      DIFFICULTY: "normal"
      VIEW_DISTANCE: 12
      SIMULATION_DISTANCE: 8
      ENABLE_COMMAND_BLOCK: "true"
    volumes:
      - ./data:/data
```

### Modded server (Fabric + mods)

```yaml
services:
  minecraft:
    image: itzg/minecraft-server:latest
    container_name: minecraft-modded
    restart: unless-stopped
    ports:
      - "25565:25565"
    environment:
      EULA: "TRUE"
      TYPE: "FABRIC"
      VERSION: "1.21.4"
      MEMORY: "6G"
      MODRINTH_PROJECTS: |
        fabric-api
        lithium
        starlight
        ferrite-core
    volumes:
      - ./data:/data
```

The `MODRINTH_PROJECTS` variable automatically downloads mods from Modrinth. No manual mod management needed.

```bash
docker compose up -d
docker logs -f minecraft  # Watch the startup
```

## Valheim

Valheim dedicated server using the `lloesche/valheim-server` container:

```yaml
# valheim/docker-compose.yml
services:
  valheim:
    image: lloesche/valheim-server:latest
    container_name: valheim
    restart: unless-stopped
    ports:
      - "2456-2458:2456-2458/udp"
    environment:
      SERVER_NAME: "Chris's Valheim"
      WORLD_NAME: "HomeWorld"
      SERVER_PASS: "your-password-here"
      BACKUPS_MAX_COUNT: 5
      BACKUPS_IF_IDLE: "false"
      UPDATE_ON_STARTUP: "true"
    volumes:
      - ./config:/config
      - ./data:/opt/valheim
    cap_add:
      - sys_nice
```

The container handles Steam updates, automatic backups, and graceful shutdown for world saves. The `cap_add: sys_nice` lets it set process priority for better performance.

## Palworld

Palworld's dedicated server is a resource hog. Be warned.

```yaml
# palworld/docker-compose.yml
services:
  palworld:
    image: thijsvanloef/palworld-server-docker:latest
    container_name: palworld
    restart: unless-stopped
    ports:
      - "8211:8211/udp"
      - "27015:27015/udp"
    environment:
      PUID: 1000
      PGID: 1000
      MULTITHREADING: "true"
      COMMUNITY: "false"
      SERVER_NAME: "Chris's Palworld"
      SERVER_PASSWORD: "your-password-here"
      ADMIN_PASSWORD: "your-admin-password"
      PLAYERS: 16
      UPDATE_ON_BOOT: "true"
    volumes:
      - ./data:/palworld
    deploy:
      resources:
        limits:
          memory: 32G
```

Set that memory limit seriously. Palworld servers have been known to consume all available RAM without limits.

## Performance tuning on CachyOS

CachyOS has an edge for game servers thanks to its kernel optimizations. The BORE scheduler handles mixed workloads (game server + other services) better than the default CFS scheduler. If you're running CachyOS, you already have it.

A few extra tweaks:

```bash
# Increase file descriptor limits for game servers that open many files
echo "* soft nofile 65535" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65535" | sudo tee -a /etc/security/limits.conf

# Increase network buffer sizes for UDP-heavy game traffic
echo "net.core.rmem_max = 16777216" | sudo tee -a /etc/sysctl.d/99-gameserver.conf
echo "net.core.wmem_max = 16777216" | sudo tee -a /etc/sysctl.d/99-gameserver.conf
sudo sysctl -p /etc/sysctl.d/99-gameserver.conf
```

## Connecting friends with WireGuard

You have two options for letting friends connect: port forwarding or VPN.

**Port forwarding** is simpler. Forward the game's UDP/TCP ports from your router to the server. On a MikroTik:

```
# Minecraft (TCP 25565)
/ip firewall nat add chain=dstnat protocol=tcp dst-port=25565 action=dst-nat to-addresses=10.0.10.10
/ip firewall filter add chain=forward protocol=tcp dst-port=25565 action=accept place-before=0

# Valheim (UDP 2456-2458)
/ip firewall nat add chain=dstnat protocol=udp dst-port=2456-2458 action=dst-nat to-addresses=10.0.10.10
/ip firewall filter add chain=forward protocol=udp dst-port=2456-2458 action=accept place-before=0
```

**WireGuard VPN** is more secure. Instead of exposing game ports to the internet, give your friends a WireGuard config that connects them to your LAN. They connect to the server using its LAN IP. Nothing is exposed publicly.

I covered WireGuard setup in detail in my WireGuard post, but the short version:

1. Set up WireGuard on your server.
2. Create a peer config for each friend.
3. They install WireGuard, import the config, connect.
4. They join the game server using `10.100.0.1:25565` (the WireGuard IP).

I prefer the VPN approach. It's more setup for each friend, but nothing is exposed to port scanners and bots.

## Automatic backups

Game servers need backups. Worlds represent hours of gameplay and losing them hurts.

```bash
#!/bin/bash
# backup-gameservers.sh
BACKUP_DIR="/mnt/storage/backups/gameservers"
DATE=$(date +%Y-%m-%d_%H%M)

mkdir -p "$BACKUP_DIR"

# Minecraft
tar czf "$BACKUP_DIR/minecraft-$DATE.tar.gz" -C ~/homelab/minecraft data/

# Valheim
tar czf "$BACKUP_DIR/valheim-$DATE.tar.gz" -C ~/homelab/valheim config/ data/

# Keep last 14 days
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +14 -delete
```

```bash
# Run nightly at 4 AM
echo "0 4 * * * /home/chris/scripts/backup-gameservers.sh" | crontab -
```

Some containers (like the Valheim one) handle backups internally, but I still do external backups as an extra safety net.

## Managing multiple servers

With Docker Compose per game, managing them is clean:

```bash
# Start Minecraft
cd ~/homelab/minecraft && docker compose up -d

# Stop Valheim (graceful shutdown, saves world)
cd ~/homelab/valheim && docker compose down

# Update Palworld
cd ~/homelab/palworld && docker compose pull && docker compose up -d

# Check resource usage across all game servers
docker stats minecraft valheim palworld
```

## The cost argument

A Valheim server rental runs about $10-15/month. Minecraft is $5-15/month. Palworld is $15-30/month. Running them yourself on hardware you already own costs electricity ($2-5/month for a mini PC) and your time.

If you already have a homelab, the marginal cost of adding game servers is essentially zero. And you get to keep the worlds forever, mod whatever you want, and run multiple servers simultaneously.

If you're setting up game servers and want tips on performance or networking, reach out at chris@chrisputer.tech.
