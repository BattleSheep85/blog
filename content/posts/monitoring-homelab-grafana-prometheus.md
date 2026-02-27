+++
title = "Monitoring your homelab with Grafana, Prometheus, and Uptime Kuma"
date = 2026-02-08
draft = false
tags = ['monitoring', 'homelab', 'grafana', 'prometheus']
categories = ['Homelab']
description = "Set up monitoring for your homelab with Grafana, Prometheus, Node Exporter, cAdvisor, and Uptime Kuma. See everything in one place."
+++

Running services without monitoring is like driving without a dashboard. Everything seems fine until it isn't, and then you have no idea what went wrong or when it started. A basic monitoring stack with Grafana, Prometheus, and Uptime Kuma gives you visibility into your homelab without being overly complex.

<!--more-->

## The architecture

The monitoring stack has three layers:

1. **Exporters** collect metrics from your systems. Node Exporter for host metrics (CPU, RAM, disk, network), cAdvisor for Docker container metrics.
2. **Prometheus** scrapes the exporters on a schedule and stores the time-series data.
3. **Grafana** visualizes the data in dashboards.
4. **Uptime Kuma** (separate from the Prometheus stack) monitors service availability and sends alerts when something goes down.

Prometheus and Grafana handle the "how are my systems performing" question. Uptime Kuma handles the "is this thing up or down" question. They complement each other.

## Deploy the stack

Here's the full Compose file. I run this as a single stack since the components are tightly coupled:

```yaml
# monitoring/docker-compose.yml
services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=90d'

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - grafana_data:/var/lib/grafana
    environment:
      GF_SECURITY_ADMIN_PASSWORD: your-grafana-password

  node-exporter:
    image: prom/node-exporter:latest
    container_name: node-exporter
    restart: unless-stopped
    ports:
      - "9100:9100"
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--path.rootfs=/rootfs'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    container_name: cadvisor
    restart: unless-stopped
    ports:
      - "8081:8080"
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
      - /dev/disk/:/dev/disk:ro
    privileged: true
    devices:
      - /dev/kmsg

  uptime-kuma:
    image: louislam/uptime-kuma:latest
    container_name: uptime-kuma
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - uptime_kuma_data:/app/data

volumes:
  prometheus_data:
  grafana_data:
  uptime_kuma_data:
```

## Prometheus config

Create `prometheus.yml` in the same directory:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
        labels:
          instance: 'homelab-main'

  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080']
        labels:
          instance: 'homelab-main'

  # Add more machines here
  # - job_name: 'node-exporter-nas'
  #   static_configs:
  #     - targets: ['10.0.10.20:9100']
  #       labels:
  #         instance: 'nas'
```

The `scrape_interval: 15s` means Prometheus collects metrics every 15 seconds. For a homelab, this is plenty. The `retention.time=90d` keeps 90 days of data, which uses roughly 1-2GB of disk depending on how many metrics you're collecting.

## Start it up

```bash
docker compose up -d
```

Check that Prometheus is scraping successfully at `http://your-server:9090/targets`. All targets should show "UP" in green.

## Grafana dashboards

Access Grafana at `http://your-server:3000`. Login with `admin` and the password you set.

### Add Prometheus as a data source

1. Go to Connections > Data Sources > Add data source.
2. Select Prometheus.
3. URL: `http://prometheus:9090` (Docker service name, not localhost).
4. Save and test.

### Import community dashboards

Don't build dashboards from scratch. The Grafana community has thousands of pre-built ones.

**Node Exporter Full** (Dashboard ID: 1860): The gold standard for host metrics. CPU, RAM, disk I/O, network, filesystem usage, all in one dashboard.

**Docker Container Monitoring** (Dashboard ID: 893): Container-level metrics from cAdvisor. CPU, memory, network, and disk per container.

To import: Dashboards > New > Import > Enter the dashboard ID > Select your Prometheus data source > Import.

Within five minutes you'll have professional-looking dashboards showing everything happening on your system.

## Key metrics to watch

Once the dashboards are up, here's what actually matters for a homelab:

**CPU usage.** If you're consistently above 80%, it's time to offload services or upgrade hardware.

**Memory usage.** Watch for containers slowly eating more RAM over time (memory leaks). Nextcloud and Immich are the usual suspects.

**Disk usage and I/O.** Track free space trends. If your NAS is filling up at 50GB/month, you know when to buy more drives.

**Network throughput.** Useful for spotting unexpected traffic (a misbehaving container, someone hitting your services, or a backup job saturating the link).

**Container restarts.** cAdvisor tracks this. A container that keeps restarting has a problem you need to investigate.

## Uptime Kuma

Uptime Kuma is separate from the Prometheus/Grafana stack, but it fills a different need. While Prometheus tells you "your CPU was at 95% at 3:14 AM," Uptime Kuma tells you "Jellyfin was down for 23 minutes starting at 3:12 AM."

### Add monitors

After accessing Uptime Kuma at `http://your-server:3001`, add monitors for each service:

- **HTTP(S):** Check that a URL returns 200 OK. Use this for web services.
- **TCP Port:** Check that a port is open. Use this for databases, game servers, etc.
- **DNS:** Check that DNS resolution works.
- **Docker Container:** Check that a container is running (requires Docker socket access).
- **Ping:** Basic ICMP ping for network devices.

### Alerts

Set up notifications so you know when something goes down:

1. Go to Settings > Notifications.
2. Add a notification channel (Discord webhook, email, Telegram, Slack, Pushover, etc.).
3. Each monitor can use one or more notification channels.

I use a Discord webhook that posts to a `#homelab-alerts` channel in my personal server. Quick, free, and I see it on my phone.

## Monitoring remote machines

If you have multiple machines, install Node Exporter on each one and add it to Prometheus:

```bash
# On the remote machine (CachyOS/Arch)
sudo pacman -S prometheus-node-exporter
sudo systemctl enable --now prometheus-node-exporter
```

Then add it to `prometheus.yml`:

```yaml
  - job_name: 'node-exporter-nas'
    static_configs:
      - targets: ['10.0.10.20:9100']
        labels:
          instance: 'nas'
```

Reload Prometheus:

```bash
docker exec prometheus kill -HUP 1
```

The new machine appears in your Grafana dashboards automatically.

## Resource usage

The whole monitoring stack is surprisingly light:

- Prometheus: 200-500MB RAM depending on metrics volume
- Grafana: 100-200MB RAM
- Node Exporter: ~20MB RAM
- cAdvisor: ~50MB RAM
- Uptime Kuma: ~100MB RAM

Total: about 500MB-1GB RAM for full monitoring. Well worth it.

If you're setting up monitoring for your homelab and want tips on what to track, email me at chris@chrisputer.tech.
