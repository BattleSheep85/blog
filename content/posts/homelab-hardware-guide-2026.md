+++
title = 'Homelab hardware guide for 2026: what to actually buy'
date = 2026-01-13
draft = false
tags = ['homelab', 'hardware']
categories = ['Homelab']
description = "What to actually buy for a homelab in 2026. Mini PCs, used enterprise servers, 10GbE for cheap, and how to pick between them."
+++

Every homelab forum has the same question: "What hardware should I buy?" The answer depends on your goals, your power bill tolerance, and whether you want something quiet enough to sit in your office. Here's what I'd actually recommend in 2026 after building and rebuilding my own lab more times than I want to admit.

<!--more-->

## Mini PCs: the quiet, efficient option

If noise and power draw matter to you (and they should), mini PCs are the move. The two brands worth looking at are Beelink and Minisforum. Both ship models with DDR5, dual NVMe slots, and 2.5GbE networking for $200-500 depending on CPU and RAM.

A Beelink SER7 with a Ryzen 7 7840HS idles at about 15W. That's less than a lightbulb. You can run Proxmox, Docker, K3s, whatever you want, and your power bill barely notices. Stick 64GB of DDR5 in one of these and you've got a surprisingly capable single-node lab.

What I like about mini PCs:

- Dead silent. No fans screaming at 3 AM.
- 15-25W idle. Under $3/month in electricity in most of the US.
- DDR5 and dual NVMe are standard now.
- 2.5GbE onboard. Some models have dual NICs.
- Small enough to velcro to the back of a monitor or stack on a shelf.

The downside is expandability. You get two NVMe slots, one or two SO-DIMM slots, and that's it. No PCIe slots, no room for a RAID card or HBA. If you need lots of local storage, a mini PC isn't your answer.

## Used enterprise: Dell PowerEdge and HP ProLiant

Used enterprise servers are absurdly cheap right now. A Dell PowerEdge T340 or T440 tower goes for $200-400 on eBay with a Xeon, 32-64GB ECC RAM, and iDRAC for remote management. HP ProLiant DL380 Gen10 racks are in the same range with iLO.

The advantages are real:

- ECC RAM. Your data integrity actually matters when you're running ZFS or databases.
- iDRAC/iLO. Full remote management with a virtual console. Reboot, mount ISOs, monitor temps, all from a browser.
- Hot-swap drive bays. Slot in 3.5" drives without shutting down.
- PCIe slots for HBAs, 10GbE cards, GPU passthrough.
- Redundant power supplies on rack models.

The downsides are also real:

- Noise. Rack servers are loud. Tower servers are tolerable but still audible. If this is going in your living room, get a mini PC.
- Power draw. A DL380 Gen10 idles at 80-120W. That's $10-15/month in electricity.
- Size and weight. A 2U rack server is 30 inches deep and 50+ pounds.

My recommendation: if you have a closet, garage, or basement for it, a used tower server is the best bang for the buck. If it needs to live in your office, get a mini PC.

## The hybrid approach

This is what I actually run. A mini PC handles lightweight services (DNS, monitoring, reverse proxy, VPN) at 15W 24/7. A used server handles the heavy stuff (VMs, storage, Kubernetes) and can be powered down when I'm not using it.

This gives you the best of both worlds: low idle power draw for always-on services, and serious compute when you need it.

## 10GbE for $15

Used Mellanox ConnectX-3 cards go for $15-20 on eBay. These are rock-solid 10GbE SFP+ cards with excellent Linux driver support. Pair two of them with a $5 DAC cable and you've got a 10GbE point-to-point link between two machines for under $50.

If you want more than two machines on 10GbE, a used Mellanox SN2100 or similar switch runs $100-200. Or grab a MikroTik CRS305-1G-4S+IN for about $130 new, which gives you four SFP+ ports and a 1GbE management port.

```bash
# Check if your ConnectX-3 is recognized
lspci | grep Mellanox

# The mlx4 driver should load automatically on any modern kernel
ip link show
```

## What about Raspberry Pis?

They're fine for Pi-hole, a small Docker host, or learning Linux basics. But a Pi 5 with 8GB RAM costs $80-100 and has an ARM CPU, SD card storage (unless you add an NVMe HAT), and limited RAM. A used mini PC with an x86 CPU, 16GB RAM, and NVMe storage costs the same or less and runs everything without ARM compatibility headaches.

I'd skip the Pi for homelab use in 2026 unless you specifically need the GPIO pins or the tiny form factor.

## My actual recommendation

For most people starting out:

1. **One mini PC** (Beelink SER7 or Minisforum UM790 Pro, 32-64GB RAM, 1TB NVMe): $300-500
2. **A Mellanox ConnectX-3** if you have a second machine: $15-20
3. **A MikroTik RB5009** for networking: ~$180
4. **A used 8-bay NAS or tower server** when you need storage: $200-400

Total: $500-1,100 for a lab that can run anything.

Start with the mini PC. Add the rest as your needs grow. The worst thing you can do is buy a 42U rack and fill it before you know what you actually want to run.

If you're putting together a homelab and want to bounce ideas off someone, shoot me an email at chris@chrisputer.tech.
