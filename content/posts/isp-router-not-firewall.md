+++
title = "Your ISP's router is not a firewall"
date = 2025-10-17
draft = false
description = "That box from Cox or AT&T does NAT, not security. Here's why it's leaving your business wide open and what to put behind it."
tags = ['firewall', 'networking', 'small-business', 'security']
categories = ['Small Business IT']
+++

When I ask small business owners about their firewall, they almost always point to the box from their ISP. "Cox gave us that," or "AT&T set it up when they installed the internet." I get it. It's the thing between your network and the internet, so it must be protecting you, right? Not really. That box is a modem with basic routing, and it's doing the bare minimum to get your traffic where it needs to go. Security is an afterthought, if it's a thought at all.

<!--more-->

## NAT is not a firewall

The ISP router does something called NAT (Network Address Translation). NAT takes your internal IP addresses (192.168.1.x) and translates them to your public IP when traffic goes out to the internet. As a side effect, unsolicited inbound traffic gets dropped because the router doesn't know which internal device to send it to.

People see that inbound traffic gets blocked and think, "Great, it's a firewall." But NAT is a routing function, not a security function. Here's what NAT doesn't do:

- **Stateful packet inspection.** A real firewall tracks the state of every connection and can detect abnormal traffic patterns. NAT just translates addresses.
- **IDS/IPS.** Intrusion detection and prevention systems analyze traffic for known attack signatures. Your ISP router doesn't have this.
- **Application-layer filtering.** A real firewall can inspect HTTP, DNS, and other protocols for malicious content. NAT operates at Layer 3 and 4 only.
- **Meaningful logging.** When something happens on your network, you need logs. ISP routers either don't log at all or keep a tiny buffer that overwrites itself every few hours.
- **Outbound filtering.** NAT lets everything out. If a machine on your network is infected and phoning home to a command-and-control server, NAT happily sends that traffic along.

## ISP firmware is a liability

ISP-provided routers run firmware that your ISP controls. Updates are rare, pushed on their schedule (if ever), and you usually can't update it yourself. This means known vulnerabilities sit unpatched for months or years.

There's a long history of ISP router vulnerabilities. Default credentials that never get changed. UPnP enabled by default, punching holes in your NAT without asking. TR-069 remote management protocols that give your ISP (and potentially attackers who exploit those protocols) a backdoor into your router.

In 2023, researchers found vulnerabilities in ISP-provided routers from multiple manufacturers that allowed remote code execution. These devices were deployed to millions of customers and many never received patches.

You're trusting your business network security to a device that costs your ISP $30 wholesale, runs outdated firmware, and was configured by an installer who needed to get to three more houses before lunch.

## What you should actually do

The fix is straightforward. Put the ISP router into bridge mode (or get a standalone modem) and put a real router/firewall behind it.

**Bridge mode** turns the ISP router into a dumb modem. It passes your public IP directly to whatever device is behind it, and you handle all routing, firewall, DHCP, and DNS yourself.

Here are your options for the device that goes behind it:

**MikroTik RouterOS ($130-$180)**
A MikroTik hAP ax3 or RB5009 gives you a stateful firewall, VLANs, VPN, proper DNS handling, and detailed logging. RouterOS's firewall is comparable to what you'd find on a Cisco device, with full chain-based rules for input, forward, and output traffic. For most small businesses, this is my go-to recommendation.

**pfSense or OPNsense (free software, $200-$500 for hardware)**
If you want an open-source firewall with a web GUI, pfSense and OPNsense are excellent. You can run them on a small appliance like a Protectli Vault or a refurbished thin client. You get IDS/IPS (via Suricata or Snort), DNS filtering, VPN, and extensive logging. The trade-off is more complexity and another piece of hardware to maintain.

**Cisco or Juniper ($1,000+)**
For businesses with compliance requirements and bigger budgets, Cisco ASA/Firepower or Juniper SRX are the gold standard. Enterprise support, extensive feature sets, and the ecosystem that enterprise IT departments are trained on. Overkill for a 10-person office, but exactly right for a 50+ person environment with strict compliance needs.

## The minimum firewall rules every business needs

Whatever device you put in place, here's the baseline configuration:

1. **Default deny inbound.** Block all unsolicited inbound traffic. Only allow specific ports you've intentionally opened (and know why they're open).
2. **Outbound filtering.** Yes, you should filter outbound traffic too. Block unnecessary ports going out. If your business doesn't need IRC or Tor, block those ports.
3. **DNS filtering.** Point your DNS to a filtering provider like Cloudflare Gateway or Cisco Umbrella to block known malicious domains.
4. **Logging enabled.** Log all dropped traffic at minimum. Log allowed traffic if you have the storage. When something goes wrong, logs are how you figure out what happened.
5. **Disable UPnP.** Nothing should be able to poke holes in your firewall automatically.
6. **Regular updates.** Whatever device you deploy, keep its firmware current. Set a calendar reminder to check monthly.

## What to do next

If your business is sitting behind an ISP router with no real firewall, you're running without a seatbelt. It might be fine right up until it isn't, and when it isn't, you'll wish you'd spent the $150 on a proper router.

I can assess your current setup, put the ISP gear into bridge mode, and deploy a real firewall that actually protects your network. Email me at [chris@chrisputer.tech](mailto:chris@chrisputer.tech) or head to [/services/](/services/) to learn more.
