+++
title = "WireGuard VPN to your homelab in 20 minutes"
date = 2026-01-19
draft = false
tags = ['wireguard', 'vpn', 'homelab', 'linux']
categories = ['Homelab']
description = "Set up a WireGuard VPN tunnel to your homelab in 20 minutes. Covers install, key generation, DDNS, split tunneling, and the wg-easy Docker option."
+++

WireGuard is the fastest, simplest VPN I've ever used. It's in the Linux kernel, the config is a single file, and it connects in under a second. If you have a homelab and want to reach it from anywhere, this is how you set it up.

<!--more-->

## Install WireGuard

On CachyOS (or any Arch-based distro), WireGuard is already in the kernel. You just need the tools:

```bash
sudo pacman -S wireguard-tools
```

On Debian/Ubuntu:

```bash
sudo apt install wireguard
```

## Generate keys

WireGuard uses public/private key pairs, one for the server and one for each client.

```bash
# On the server
wg genkey | tee server-private.key | wg pubkey > server-public.key

# For each client
wg genkey | tee client1-private.key | wg pubkey > client1-public.key
```

Keep the private keys private. Treat them like SSH keys.

## Server config

Create `/etc/wireguard/wg0.conf` on your homelab server:

```ini
[Interface]
Address = 10.100.0.1/24
ListenPort = 51820
PrivateKey = <server-private-key>

# Enable IP forwarding and NAT when the interface comes up
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]
# Client 1 (laptop)
PublicKey = <client1-public-key>
AllowedIPs = 10.100.0.2/32
```

Replace `eth0` with your actual network interface name (check with `ip link`).

Enable IP forwarding:

```bash
echo 'net.ipv4.ip_forward = 1' | sudo tee /etc/sysctl.d/99-wireguard.conf
sudo sysctl -p /etc/sysctl.d/99-wireguard.conf
```

Start it up:

```bash
sudo systemctl enable --now wg-quick@wg0
```

## Client config

Create `/etc/wireguard/wg0.conf` on your client (laptop, phone, whatever):

```ini
[Interface]
Address = 10.100.0.2/24
PrivateKey = <client1-private-key>
DNS = 10.100.0.1

[Peer]
PublicKey = <server-public-key>
Endpoint = your-homelab.duckdns.org:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
```

`AllowedIPs = 0.0.0.0/0` routes ALL traffic through the VPN. If you only want to reach your homelab network (split tunneling), change it:

```ini
# Split tunnel: only homelab traffic goes through VPN
AllowedIPs = 10.100.0.0/24, 10.0.10.0/24, 10.0.20.0/24
```

This is what I use day to day. Full tunnel when I'm on sketchy Wi-Fi, split tunnel the rest of the time.

## DDNS for residential IPs

Most home internet connections have dynamic IPs. You need a way for your client to find your server when the IP changes.

### DuckDNS (free, simple)

```bash
# Create an account at duckdns.org and pick a subdomain
# Then set up a cron job to update it every 5 minutes
echo "*/5 * * * * curl -s 'https://www.duckdns.org/update?domains=yourdomain&token=YOUR-TOKEN&ip='" | crontab -
```

### Cloudflare DDNS (if you own a domain)

If your domain's DNS is on Cloudflare, use a DDNS updater container:

```yaml
# docker-compose.yml
services:
  cloudflare-ddns:
    image: favonia/cloudflare-ddns:latest
    restart: always
    environment:
      CF_API_TOKEN: "your-cloudflare-api-token"
      DOMAINS: "homelab.yourdomain.com"
      PROXIED: "false"
    network_mode: host
```

I use Cloudflare DDNS because I already manage my domain there. It updates within seconds of an IP change.

## Open the port

You need to forward UDP port 51820 from your router to your WireGuard server. On a MikroTik:

```
/ip firewall nat add chain=dstnat protocol=udp dst-port=51820 action=dst-nat to-addresses=10.0.10.5
/ip firewall filter add chain=forward protocol=udp dst-port=51820 action=accept place-before=0
```

On any other router, find the port forwarding section in the web UI and forward UDP 51820 to your server's LAN IP.

## The easy way: wg-easy

If you don't want to manage config files and key pairs manually, wg-easy gives you a web UI for managing WireGuard peers:

```yaml
# docker-compose.yml
services:
  wg-easy:
    image: ghcr.io/wg-easy/wg-easy:latest
    container_name: wg-easy
    restart: unless-stopped
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    sysctls:
      - net.ipv4.ip_forward=1
      - net.ipv4.conf.all.src_valid_mark=1
    environment:
      WG_HOST: your-homelab.duckdns.org
      PASSWORD_HASH: '$2a$12$yourbcrypthashhere'
      WG_DEFAULT_DNS: 10.0.10.53
      WG_ALLOWED_IPS: 10.0.10.0/24, 10.100.0.0/24
    volumes:
      - ./wireguard:/etc/wireguard
    ports:
      - "51820:51820/udp"
      - "51821:51821/tcp"
```

The web UI (port 51821) lets you create clients, download configs, and generate QR codes for phone clients. It's great for giving friends and family VPN access without explaining key pairs.

## Testing

From your client:

```bash
# Bring up the tunnel
sudo wg-quick up wg0

# Check the connection
sudo wg show

# You should see a handshake timestamp and transferred bytes
# Ping your homelab
ping 10.100.0.1
ping 10.0.10.5  # whatever your server's LAN IP is
```

If the handshake shows but you can't reach LAN hosts, check IP forwarding and the PostUp iptables rules on the server. That's where 90% of WireGuard issues live.

## Why not OpenVPN or Tailscale?

**OpenVPN** works but it's slower (userspace, TCP/UDP overhead, TLS handshake) and the config is way more complex. WireGuard is faster, simpler, and in the kernel.

**Tailscale** is excellent and I actually recommend it for non-technical users. But it routes through their coordination servers (DERP) when direct connections fail, and the free tier has limits. For a homelab where you control both ends, raw WireGuard is simpler and has zero external dependencies.

If you hit any snags getting WireGuard connected, feel free to email me at chris@chrisputer.tech.
