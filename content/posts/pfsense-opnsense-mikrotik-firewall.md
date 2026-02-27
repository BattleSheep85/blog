+++
title = "pfSense vs OPNsense vs MikroTik: homelab firewall shootout"
date = 2026-01-17
draft = false
tags = ['firewall', 'homelab', 'networking', 'opnsense', 'mikrotik']
categories = ['Homelab']
description = "Comparing pfSense, OPNsense, and MikroTik RouterOS for homelab firewalls. Features, licensing, performance, and which one to actually pick."
+++

Picking a firewall for your homelab is one of those decisions that spawns 200-comment forum threads. Everyone has an opinion. Here's mine, based on running all three in production and homelab environments over the past several years.

<!--more-->

## The three contenders

**pfSense** is the veteran. BSD-based, battle-tested, huge community. But Netgate's licensing shift toward pfSense Plus (their commercial product) and the CE edition lagging behind has pushed a lot of people toward alternatives.

**OPNsense** forked from pfSense in 2015. Also BSD-based, but with faster development cycles, a modern UI, and better plugin support. It's become the community favorite for good reason.

**MikroTik RouterOS** is the wildcard. It's not a firewall appliance in the traditional sense. It's a router that happens to have a very capable firewall. Different philosophy, different trade-offs.

## OPNsense: the community favorite

OPNsense is what I recommend to most homelabbers who want a dedicated firewall box. Here's why:

- **Weekly security updates, monthly feature releases.** The development pace is significantly faster than pfSense CE.
- **Suricata IDS/IPS built in.** Inline intrusion detection and prevention with ET Open rules. Enable it, tune the ruleset, done.
- **WireGuard native.** Built into the kernel, not bolted on as a plugin.
- **Modern UI.** Responsive web interface that doesn't feel like it's from 2008.
- **Plugins.** Crowdsec, Zenarmor (DPI), HAProxy, Nginx, Unbound with DNS-over-TLS, and dozens more.
- **No licensing drama.** BSD licensed, truly open source, no commercial edition competing with the free version.

Hardware requirements: any x86 box with 2+ NICs. A Protectli vault, a used Dell OptiPlex with a dual-port Intel NIC, or a mini PC with two Ethernet ports. 4GB RAM minimum, 8GB recommended if you're running Suricata.

```
# OPNsense install is straightforward:
# 1. Download the ISO from opnsense.org
# 2. Flash to USB with dd or Rufus
# 3. Boot, follow the installer
# 4. Access web UI at https://192.168.1.1
# Default creds: root / opnsense
```

Basic setup after install:

1. Change the default password.
2. Configure WAN and LAN interfaces.
3. Set up DNS (Unbound is built in).
4. Enable Suricata IDS/IPS on the WAN interface.
5. Create firewall rules for your VLANs.

## pfSense: the veteran with baggage

pfSense CE is still functional and still gets updates. The core routing and firewalling work fine. The issue is the trajectory.

Netgate has been pushing pfSense Plus as their primary product. That's the version that gets features first. CE gets them later, sometimes much later. The Wireguard saga (removed, re-added, arguments about kernel vs userspace) didn't inspire confidence either.

If you're already running pfSense and it works, there's no urgent reason to migrate. But if you're starting fresh in 2026, OPNsense is the better bet. The community is larger, the development is more active, and you won't wonder if the free version is going to get deprioritized further.

## MikroTik: the router that firewalls

MikroTik RouterOS approaches firewalling differently. It's a routing platform with firewall capabilities baked in, not a firewall appliance that also routes.

The firewall in RouterOS is chain-based, similar to iptables/nftables:

```
# Basic firewall ruleset on MikroTik
/ip firewall filter

# Accept established and related
add chain=input action=accept connection-state=established,related
add chain=forward action=accept connection-state=established,related

# Drop invalid
add chain=input action=drop connection-state=invalid
add chain=forward action=drop connection-state=invalid

# Accept input from LAN
add chain=input action=accept in-interface-list=LAN

# Drop everything else to the router
add chain=input action=drop

# NAT for internet access
/ip firewall nat add chain=srcnat action=masquerade out-interface-list=WAN
```

MikroTik's firewall strengths:

- **Raw packet throughput.** Hardware-accelerated on many models. The RB5009 can push near wire speed with basic firewall rules.
- **Connection tracking is solid.** Stateful firewalling works well.
- **Integrated with everything else.** VLANs, routing, VPN, QoS, and firewall all in one config.

MikroTik's firewall weaknesses:

- **No IDS/IPS.** There's no Suricata, no Snort, no deep packet inspection. If you want intrusion detection, you need something else.
- **No web filtering.** No URL categorization, no application-level blocking beyond basic Layer 3/4 rules.
- **Rule management at scale.** With complex rulesets, the CLI and WinBox get tedious compared to OPNsense's web UI.

## "Router that firewalls" vs "firewall that routes"

This is the core distinction:

**OPNsense/pfSense** are firewalls first. They inspect traffic, run IDS/IPS, do deep packet inspection, and handle complex security policies. Routing is secondary (though perfectly capable for a homelab).

**MikroTik** is a router first. It moves packets insanely fast, handles complex routing topologies (BGP, OSPF, MPLS), and has a firewall that handles stateful packet filtering. But it won't inspect application-layer traffic.

## Which one should you pick?

**Pick OPNsense if:**
- You want IDS/IPS (Suricata).
- You want a web UI for firewall management.
- Security inspection matters more than raw throughput.
- You have spare x86 hardware or want to buy a Protectli/similar box.

**Pick MikroTik if:**
- You want the firewall and router in one box.
- You're already running MikroTik for routing/VLANs.
- You don't need IDS/IPS.
- You value simplicity (one device, one config, one management interface).

**Pick pfSense if:**
- You're already running it and it works.

**The "both" option:** Run MikroTik as your router and OPNsense as a transparent bridge/IDS inline. This gives you MikroTik's routing performance with OPNsense's security inspection. It's more complex, but it's what I'd do for a serious homelab.

## My setup

I run a MikroTik RB5009 as the core router with VLANs, inter-VLAN firewall rules, and WireGuard VPN. For my homelab VLAN, I have OPNsense running as a VM handling IDS/IPS for traffic that enters and leaves that segment. It's overkill for a homelab, but it's a good learning setup and mirrors what you'd see in a real network.

If you're trying to decide and want to talk through your setup, reach out at chris@chrisputer.tech.
