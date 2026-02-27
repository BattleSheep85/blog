+++
title = "It's not the internet: 7 internal problems that look like 'it's slow'"
date = 2025-10-31
draft = false
description = "When everyone says the internet is slow, the real problem is usually inside your building. Here are the 7 most common culprits."
tags = ['networking', 'troubleshooting', 'small-business']
categories = ['Small Business IT']
+++

"The internet is slow." I hear this from small business owners at least once a week. They've already called their ISP, the ISP ran a test, and the connection looks fine. Because it is fine. The problem isn't the internet. It's something inside the building that's making everything feel slow. Here are the seven internal problems I find most often, and every single one of them looks like "the internet is slow" to the people suffering through it.

<!--more-->

## 1. Duplex mismatch

This is old-school and it still happens all the time. When a network device (computer, switch, printer) negotiates its connection speed and duplex mode, both sides need to agree. If one side is set to full duplex and the other is at half duplex, you get a duplex mismatch. The connection technically works but runs at a fraction of its speed, drops packets constantly, and causes everything to feel sluggish.

**How to spot it:** Check the link status on your switch. If a gigabit port shows 100 Mbps half duplex, something is wrong. Late collisions and FCS errors on the port stats are dead giveaways.

**How to fix it:** Set both ends to auto-negotiate (which is the default and works 99% of the time) or manually set both to the same speed and duplex. Usually the culprit is an old printer or device with a bad NIC that's not negotiating correctly.

## 2. DNS delays

When DNS is slow, everything feels slow. Every time you open a website, check email, or connect to a cloud service, your computer does a DNS lookup first. If that lookup takes three seconds instead of 30 milliseconds, every single action has a three-second lag before it even starts.

**How to spot it:** Open a command prompt and run `nslookup google.com`. If it takes more than a second to respond, your DNS is the problem.

**How to fix it:** Switch to a faster DNS provider. If your router is handling DNS, make sure it's forwarding to a fast upstream resolver (Cloudflare 1.1.1.1, Google 8.8.8.8, or a filtering provider like Cloudflare Gateway). If you're using your ISP's DNS servers, that's often the bottleneck since ISP DNS is notoriously slow and unreliable.

## 3. WiFi channel congestion

Your office WiFi shares radio spectrum with every other WiFi network in range. If you're in a strip mall, office building, or anywhere with neighbors, there are probably 10 to 30 other WiFi networks competing for the same channels. When multiple networks use the same channel, they all slow down because they're taking turns transmitting (that's how WiFi works at the protocol level).

**How to spot it:** Use a WiFi analyzer app (WiFi Analyzer for Android, or the built-in wireless diagnostics on macOS). Look at which channels are crowded. On 2.4 GHz, you want to be on channel 1, 6, or 11, and you want to pick whichever one has the least competition. On 5 GHz, there are many more channels, but they have shorter range.

**How to fix it:** Manually set your access point to the least congested channel instead of letting it auto-select (auto-select doesn't always choose well). If 2.4 GHz is hopelessly congested, push as many devices as possible to 5 GHz. Consider lowering the 2.4 GHz transmit power to reduce interference with neighbors.

## 4. A bandwidth hog

One person or one device is eating all the bandwidth, and everyone else suffers. This could be someone streaming 4K video, running a massive cloud backup, uploading a huge file to Google Drive, or (more than once) someone's kid on the guest WiFi streaming Netflix.

**How to spot it:** If you have a managed switch, check which ports are pushing the most traffic. On a MikroTik router, the Torch tool shows real-time traffic by source and destination. PRTG or LibreNMS can show you bandwidth usage per port over time.

**How to fix it:** QoS (Quality of Service) on your router. Prioritize business-critical traffic (VoIP, your line-of-business application) over bulk traffic (streaming, large file transfers). On MikroTik, simple queues or queue trees can cap non-essential traffic and guarantee bandwidth for the important stuff.

## 5. Dying or bad cables

Ethernet cables degrade. Cables that were run through ceiling tiles get kinked, crushed by furniture, chewed on by mice, or terminated poorly in the first place. A bad cable might still pass traffic but with constant CRC errors and retransmissions that tank performance.

**How to spot it:** Check port error counters on your managed switch. High numbers of CRC errors, input errors, or frame errors on a specific port point to a cable problem. You can also test cables with a cable tester or certifier, but the switch stats usually tell you enough.

**How to fix it:** Replace the cable or re-terminate the ends. If it's a cable in the wall, test both patch cables first (the ones between the wall jack and the device, and between the patch panel and the switch). Those are the easiest to swap and the most common failure points.

## 6. DHCP exhaustion

Your router's DHCP server hands out IP addresses from a pool. If that pool is too small, or if devices are holding onto addresses too long, new devices can't get an IP and can't connect to the network. This often shows up as "WiFi connected but no internet" on phones and laptops.

**How to spot it:** Check your DHCP lease table. If your pool is 192.168.1.100 to 192.168.1.200 (100 addresses) and you've got 95 active leases, you're almost out. Phones, tablets, laptops, printers, IoT devices, and guest devices all need addresses.

**How to fix it:** Expand the DHCP pool. Shorten lease times for guest networks (2 to 4 hours instead of 24) so addresses get recycled faster. Use a /23 subnet if you're regularly hitting the limits of a /24 (254 addresses). And assign static IPs to devices that don't need DHCP (servers, printers, APs, switches) so they're not consuming pool addresses.

## 7. Broadcast storms

On a flat network (no VLANs), every broadcast packet goes to every single device. This is normal at low levels, but certain conditions can cause broadcast storms where the network gets flooded with broadcast traffic that overwhelms everything.

**How to spot it:** If everything suddenly gets incredibly slow and your switch LEDs are all blinking frantically, you might have a broadcast storm. Common causes include a network loop (someone plugged both ends of a cable into the same switch), a misconfigured device spamming broadcasts, or a virus/worm flooding the network.

**How to fix it:** If it's a loop, enable Spanning Tree Protocol (STP) on your managed switches. STP detects loops and blocks redundant paths. On unmanaged switches, STP doesn't exist, and loops will bring down your entire network until you physically find and disconnect the offending cable. This alone is a reason to use managed switches.

For general broadcast traffic reduction, implement VLANs. Smaller broadcast domains mean less broadcast traffic per segment.

## What to do next

"The internet is slow" is almost never the internet. It's something in your building that nobody has diagnosed because nobody has the tools or expertise to look. If you're dealing with chronic slowness, dropped connections, or intermittent issues that your ISP swears aren't on their end, let me take a look at what's actually happening inside your network.

Email me at [chris@chrisputer.tech](mailto:chris@chrisputer.tech) or head to [/services/](/services/). I'll find the actual problem and fix it.
