+++
title = "VPN for remote workers: what your small business actually needs"
date = 2025-10-29
draft = false
description = "Consumer VPNs like NordVPN won't connect your remote workers to the office. Here's what actually works and what it costs."
tags = ['vpn', 'networking', 'small-business', 'remote-work']
categories = ['Small Business IT']
+++

Remote work is here to stay, and your people need to access files, applications, and systems at the office from wherever they are. Somebody Googles "best VPN for business" and comes back with NordVPN or ExpressVPN. That's not what you need. Those are privacy VPNs designed to hide your browsing from your ISP. They don't connect you to your office network. The VPN your business needs is a completely different thing.

<!--more-->

## What a business VPN actually does

A business VPN creates an encrypted tunnel between a remote worker's computer and your office network. Once connected, their computer acts like it's physically plugged into the office. They can access the file server, print to the office printer, use internal applications, and reach anything else on the local network.

This is fundamentally different from NordVPN, which routes your internet traffic through their servers to mask your IP address. NordVPN is for privacy. A site-to-site or remote-access VPN is for connectivity.

## Option 1: Tailscale (the easy button)

If you want remote access working in 15 minutes with zero networking knowledge required, Tailscale is the answer. It's built on WireGuard (the fastest, most modern VPN protocol) and creates a mesh network between your devices.

**How it works:** Install Tailscale on each device (computer, phone, server). Every device gets a Tailscale IP address. Devices can reach each other directly, no matter where they are, no port forwarding, no firewall rules, no configuration headaches. It uses a technique called NAT traversal to punch through firewalls automatically.

**Pricing:** Free for personal use with up to 100 devices and 3 users. Their Starter plan is $5/user/month for up to 50 users. The Personal plan (free) works fine for very small businesses.

**Why it's great for small business:**
- No networking expertise required. Seriously, anyone can set this up.
- Works on Windows, Mac, Linux, iOS, and Android.
- Zero configuration on your router or firewall.
- Built-in access controls so you can limit who reaches what.
- MagicDNS lets you use device names instead of IP addresses.

**The trade-off:** You're depending on Tailscale's coordination servers (though traffic flows directly between devices, not through Tailscale). If you want everything self-hosted, look at Headscale, which is an open-source Tailscale control server.

## Option 2: WireGuard on MikroTik (full control, no subscription)

If you're already running a MikroTik router (or you're about to deploy one), WireGuard is built into RouterOS 7. No additional software, no licensing, no monthly fees.

**How it works:** You configure WireGuard on the MikroTik router as a VPN server. Each remote worker gets a WireGuard config file (or QR code for mobile). They import it into the WireGuard client on their device, click connect, and they're on the office network.

**What you get:**
- Blazing fast. WireGuard is significantly faster than IPsec or OpenVPN with lower overhead and better latency.
- Split tunneling support. You can configure it so only office-bound traffic goes through the VPN, while internet browsing goes direct. This saves bandwidth and keeps things snappy.
- Native RouterOS support. It integrates with MikroTik's firewall rules, so you can control exactly what VPN users can access.
- No subscription. Configure it once, add and remove users as needed, and it runs forever.

**The setup:** This requires someone comfortable with MikroTik RouterOS. You need to generate keys, configure the WireGuard interface, set up firewall rules, and handle the client configurations. It's not hard if you know RouterOS, but it's not point-and-click either.

For a typical small office, the setup takes about an hour, and adding new users takes about five minutes each.

## Option 3: OpenVPN (the old reliable)

OpenVPN has been the standard for small business VPN for years. It works, it's well-understood, and every platform supports it. MikroTik supports it natively, and you can also run an OpenVPN server on pfSense, OPNsense, or a dedicated Linux box.

**Why you might still use it:** Compatibility. OpenVPN works in situations where WireGuard might not, especially in restrictive network environments (hotels, airports) because OpenVPN can run over TCP port 443, which looks like regular HTTPS traffic. Some older devices and setups only support OpenVPN.

**Why I'm moving away from it:** WireGuard is faster, simpler, and more modern. OpenVPN is more complex to configure, has higher overhead, and uses more battery on mobile devices. For new deployments, I default to WireGuard unless there's a specific reason to use OpenVPN.

## What NOT to do

**Don't use PPTP.** It's ancient, it's broken, and it's been crackable since the late 2000s. If your current VPN is PPTP, replace it immediately.

**Don't use a consumer VPN for business access.** NordVPN, ExpressVPN, Surfshark. These are privacy tools. They encrypt your traffic to the internet but they don't connect you to your office network. They're great for protecting yourself on public WiFi. They're useless for accessing your file server.

**Don't expose RDP to the internet.** Some businesses skip VPN entirely and just forward Remote Desktop Protocol (port 3389) through their firewall. This is extremely dangerous. RDP is one of the most targeted attack vectors for ransomware. Always put RDP behind a VPN.

## My recommendation for most small businesses

For a business with 2 to 5 remote workers and no in-house IT: **Tailscale.** It's fast, it's free for small teams, and it works out of the box. You'll be up and running in 15 minutes.

For a business with 5 to 25 remote workers and a MikroTik router: **WireGuard on MikroTik.** No subscription fees, full control, and excellent performance. Have your IT consultant set it up once, and it runs indefinitely.

For larger or multi-site deployments: **WireGuard or IPsec site-to-site tunnels** between locations, with WireGuard or Tailscale for individual remote workers.

## What to do next

If your remote workers are using workarounds like emailing files to themselves or using personal cloud storage because they can't access the office network, you need a VPN. If your current VPN is slow, flaky, or running PPTP, you need a better one.

I set up VPN solutions for small businesses all the time. Reach out at [chris@chrisputer.tech](mailto:chris@chrisputer.tech) or visit [/services/](/services/) and let's get your remote access sorted out properly.
