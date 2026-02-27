+++
title = "Reverse proxies compared: Nginx Proxy Manager vs Traefik vs Caddy"
date = 2026-02-06
draft = false
tags = ['reverse-proxy', 'homelab', 'docker']
categories = ['Homelab']
description = "Comparing Nginx Proxy Manager, Traefik, and Caddy for homelab reverse proxy use. GUI vs Docker-native vs simple config."
+++

Once you have more than a couple of services running in your homelab, you need a reverse proxy. Instead of remembering `192.168.1.50:8096` for Jellyfin and `192.168.1.50:3001` for Uptime Kuma, you access `jellyfin.homelab.local` and `status.homelab.local`. With automatic SSL. The three main options are Nginx Proxy Manager, Traefik, and Caddy. They all solve the same problem differently.

<!--more-->

## Nginx Proxy Manager: point and click

NPM is the most popular reverse proxy in the homelab community, and for good reason. It wraps Nginx in a web UI that makes adding proxy hosts, SSL certificates, and redirects dead simple.

### Deploy

```yaml
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

Default login: `admin@example.com` / `changeme`.

### Adding a service

1. Click "Proxy Hosts" > "Add Proxy Host."
2. Enter the domain name (`jellyfin.homelab.local`).
3. Enter the forward hostname/IP and port (`192.168.1.50:8096`).
4. Click the SSL tab, request a new Let's Encrypt certificate, check "Force SSL."
5. Save.

That's it. No config files, no restarts, no syntax errors. For someone who just wants services accessible by name with HTTPS, NPM is the fastest path.

### Strengths

- GUI for everything. Zero config file editing.
- Let's Encrypt integration with DNS challenge support (Cloudflare, Route53, etc.).
- Access lists for restricting services to specific IPs.
- Stream proxying for non-HTTP services (databases, game servers).
- Large community, tons of guides.

### Weaknesses

- Adding a new service means clicking through the UI manually. Not easily automated.
- No auto-discovery. When you add a new Docker container, you have to add it to NPM by hand.
- The database (SQLite) can occasionally get corrupted. Back up the `./data` directory.

## Traefik: Docker-native auto-discovery

Traefik is built for Docker and Kubernetes. It watches the Docker socket for new containers and automatically configures routes based on labels. No UI clicks, no config file edits. Add labels to your container, and Traefik picks it up.

### Deploy

```yaml
services:
  traefik:
    image: traefik:v3.2
    container_name: traefik
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"  # Dashboard
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik.yml:/etc/traefik/traefik.yml
      - ./acme.json:/acme.json
    networks:
      - proxy

networks:
  proxy:
    external: true
```

Create the static config (`traefik.yml`):

```yaml
api:
  dashboard: true
  insecure: true

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
  websecure:
    address: ":443"

providers:
  docker:
    exposedByDefault: false
    network: proxy

certificatesResolvers:
  letsencrypt:
    acme:
      email: you@yourdomain.com
      storage: /acme.json
      dnsChallenge:
        provider: cloudflare
```

```bash
# Create the proxy network and acme.json
docker network create proxy
touch acme.json && chmod 600 acme.json
```

### Adding a service with Traefik

You add labels to the service's compose file. No touching Traefik's config at all:

```yaml
services:
  uptime-kuma:
    image: louislam/uptime-kuma:latest
    container_name: uptime-kuma
    restart: unless-stopped
    volumes:
      - ./data:/app/data
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.uptime-kuma.rule=Host(`status.homelab.local`)"
      - "traefik.http.routers.uptime-kuma.entrypoints=websecure"
      - "traefik.http.routers.uptime-kuma.tls.certresolver=letsencrypt"
      - "traefik.http.services.uptime-kuma.loadbalancer.server.port=3001"
    networks:
      - proxy

networks:
  proxy:
    external: true
```

Start the container and Traefik automatically creates the route, gets an SSL cert, and starts proxying. Remove the container and the route disappears. This is the "infrastructure as code" approach: the routing config lives with the service, not in a central proxy.

### Strengths

- Auto-discovery. New containers with labels are automatically proxied.
- Config lives with the service (labels in Compose files). Easy to version control.
- Docker and Kubernetes native. First-class support for both.
- Middlewares for auth, rate limiting, headers, IP whitelisting, etc.
- Dashboard for monitoring routes and services.

### Weaknesses

- Steeper learning curve. The label syntax is verbose and the documentation, while thorough, can be overwhelming.
- Initial setup is more involved than NPM.
- Debugging routing issues requires checking container labels, Traefik logs, and the dashboard.
- The Docker socket mount (`/var/run/docker.sock`) is a security consideration. Traefik has read access to all container info.

## Caddy: the simplest config

Caddy's philosophy is radical simplicity. Its config file (the Caddyfile) is so short it barely looks like a config file. Automatic HTTPS is the default, not something you enable.

### Deploy

```yaml
services:
  caddy:
    image: caddy:2
    container_name: caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - ./data:/data
      - ./config:/config
```

### The Caddyfile

```
jellyfin.homelab.local {
    reverse_proxy 192.168.1.50:8096
}

status.homelab.local {
    reverse_proxy 192.168.1.50:3001
}

vault.homelab.local {
    reverse_proxy /notifications/hub 192.168.1.50:3012
    reverse_proxy 192.168.1.50:8222
}

grafana.homelab.local {
    reverse_proxy 192.168.1.50:3000
}
```

That's the whole config. Each service is two lines. Caddy automatically gets Let's Encrypt certificates for every domain and renews them. No `certbot`, no ACME config, no `ssl_certificate` directives. It just works.

### Strengths

- Simplest config syntax by far. Two lines per service.
- Automatic HTTPS by default. Zero SSL configuration needed.
- Single binary, no dependencies.
- Great documentation, easy to understand.
- JSON API for programmatic config changes.

### Weaknesses

- No web UI. Config file only (though the API allows dynamic changes).
- No Docker auto-discovery out of the box (there's a caddy-docker-proxy plugin, but it's not built in).
- Adding or changing services requires editing the Caddyfile and reloading. `docker exec caddy caddy reload --config /etc/caddy/Caddyfile` is quick, but it's not automatic.
- Smaller plugin ecosystem than Nginx/Traefik.

## Which one should you pick?

**Pick Nginx Proxy Manager if:**
- You want a GUI and don't want to edit config files.
- You're new to reverse proxies and want the gentlest learning curve.
- You don't add/remove services frequently.

**Pick Traefik if:**
- You run lots of Docker containers and want auto-discovery.
- You value "infrastructure as code" (routing config in Compose labels).
- You're comfortable with a steeper learning curve for more automation.
- You might move to Kubernetes later (Traefik handles both).

**Pick Caddy if:**
- You want the simplest config file possible.
- You value readability and minimal boilerplate.
- You don't need a web UI or Docker auto-discovery.
- You're comfortable editing a text file and running a reload command.

**What I use:** I've used all three. NPM when I was starting out, Traefik when I moved to a more automated setup, and Caddy for standalone projects where I want zero fuss. For a homelab with Docker, Traefik is my current pick because the auto-discovery is too convenient to give up. But Caddy's simplicity is genuinely appealing, and NPM is the right answer for a lot of people.

If you're trying to pick a reverse proxy for your homelab, drop me a line at chris@chrisputer.tech.
