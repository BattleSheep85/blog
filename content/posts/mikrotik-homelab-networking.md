+++
title = "MikroTik for homelabbers: enterprise networking under $200"
date = 2026-01-15
draft = false
tags = ['mikrotik', 'homelab', 'networking']
categories = ['Homelab']
description = "Why MikroTik is the best networking gear for homelabs. The RB5009 gives you enterprise features like BGP, OSPF, VLANs, and 10G SFP+ for under $200."
+++

Most homelabbers default to Ubiquiti for networking. It's fine. The UI is pretty. But if you want actual enterprise features without enterprise pricing, MikroTik is where it's at. The RB5009UG+S+IN gives you more routing features than a $2,000 Cisco box for about $180.

<!--more-->

## Why MikroTik for a homelab?

MikroTik routers run RouterOS, which is a full network operating system with support for BGP, OSPF, MPLS, VLANs, firewall rules, QoS, VPN, DHCP, DNS, and about 50 other features you'd need a Cisco IOS license for. All included. No subscription fees. No cloud account required.

The RB5009UG+S+IN is the sweet spot for homelabs:

- 7x 1GbE ports
- 1x 2.5GbE port
- 1x 10G SFP+ port
- Quad-core ARM CPU, 1GB RAM
- RouterOS v7 with all features unlocked
- ~$180 new

That 10G SFP+ port means you can uplink to a 10GbE switch or connect directly to a server with a Mellanox ConnectX-3. The 2.5GbE port is perfect for a NAS or primary workstation.

## Getting started with RouterOS

RouterOS has three management interfaces: WinBox (GUI), the CLI (SSH or serial), and an API for automation. Most people start with WinBox.

### WinBox

WinBox is MikroTik's native management tool. It runs on Windows, Linux (via Wine), and macOS. You can also use the web interface (WebFig), but WinBox is faster and more capable.

On CachyOS/Arch:

```bash
# Install WinBox from AUR
paru -S winbox
```

Connect to your MikroTik by MAC address or IP. Default credentials are `admin` with no password. Change that immediately.

### Basic secure setup

First things on a new MikroTik:

```
# Set a password
/user set admin password=YourStrongPasswordHere

# Set the hostname
/system identity set name=rb5009-core

# Disable unused services
/ip service disable telnet,ftp,api,api-ssl

# Update RouterOS
/system package update check-for-updates
/system package update install
```

### VLANs

VLANs are where MikroTik really shines for homelabs. You can segment your network properly: a management VLAN, a server VLAN, an IoT VLAN, a guest VLAN, whatever you need.

```
# Create VLANs
/interface vlan add interface=bridge1 name=vlan10-servers vlan-id=10
/interface vlan add interface=bridge1 name=vlan20-iot vlan-id=20
/interface vlan add interface=bridge1 name=vlan30-guest vlan-id=30

# Assign IPs to each VLAN interface
/ip address add address=10.0.10.1/24 interface=vlan10-servers
/ip address add address=10.0.20.1/24 interface=vlan20-iot
/ip address add address=10.0.30.1/24 interface=vlan30-guest

# DHCP server per VLAN
/ip pool add name=pool-servers ranges=10.0.10.100-10.0.10.254
/ip dhcp-server add address-pool=pool-servers interface=vlan10-servers name=dhcp-servers
/ip dhcp-server network add address=10.0.10.0/24 gateway=10.0.10.1 dns-server=10.0.10.1
```

### Firewall basics

RouterOS uses a chain-based firewall similar to iptables. The default config is pretty locked down, but here's a minimal ruleset for inter-VLAN routing with isolation:

```
# Allow established and related connections
/ip firewall filter add chain=forward action=accept connection-state=established,related

# Allow servers VLAN to access everything
/ip firewall filter add chain=forward action=accept src-address=10.0.10.0/24

# Allow IoT VLAN to reach the internet but not other VLANs
/ip firewall filter add chain=forward action=accept src-address=10.0.20.0/24 dst-address=!10.0.0.0/8

# Drop everything else between VLANs
/ip firewall filter add chain=forward action=drop src-address=10.0.0.0/8 dst-address=10.0.0.0/8
```

## RouterOS CLI vs WinBox

I use WinBox for initial setup and visual troubleshooting (the traffic graphs are great), and the CLI for everything repeatable. The CLI is also scriptable:

```
# Export your full config
/export file=rb5009-backup

# Scheduled backup every night at 2 AM
/system scheduler add name=nightly-backup on-event="/export file=rb5009-backup" start-time=02:00:00 interval=1d
```

## Automation with the API

RouterOS has a REST API (v7.1+) that you can hit from Ansible, Python, or anything that speaks HTTP. This is huge for homelabs where you want to manage configs as code.

```bash
# Example: get interface list via REST API
curl -k -u admin:YourPassword https://10.0.0.1/rest/interface
```

There's also a community Python library called `routeros_api` that wraps the older API protocol:

```bash
pip install routeros_api
```

## MikroTik vs Ubiquiti

The comparison comes up constantly. Here's the honest take:

- **Ubiquiti** has a better UI, easier initial setup, and the UniFi ecosystem ties switches/APs/cameras together nicely. If you want pretty dashboards and don't need advanced routing, it's fine.
- **MikroTik** has deeper features, no cloud dependency, no account required, and costs less. If you want to learn real networking (VLANs, routing protocols, firewalling), MikroTik teaches you more.

For a homelab where the goal is learning? MikroTik, every time. The learning curve is steeper, but that's the point.

## What to buy

- **Router:** RB5009UG+S+IN (~$180). The homelab standard.
- **Switch (managed):** CRS326-24G-2S+RM (~$200) for 24-port 1GbE with 2x SFP+. Or the CRS305-1G-4S+IN (~$130) for pure 10GbE switching.
- **Wi-Fi:** MikroTik APs exist but honestly, they're mediocre. Use a TP-Link EAP or Ubiquiti AP for Wi-Fi and let MikroTik handle the routing.

If you're setting up a homelab and want to talk shop about MikroTik configs, email me at chris@chrisputer.tech.
