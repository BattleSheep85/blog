+++
title = "Network monitoring for small business: what's actually realistic"
date = 2025-10-25
draft = false
description = "You don't need a $50K monitoring platform. Here are free tools that tell you when something breaks before your staff does."
tags = ['monitoring', 'networking', 'small-business']
categories = ['Small Business IT']
+++

Nobody monitors their network until something breaks badly enough that it costs real money. Then everyone asks, "Why didn't we know about this sooner?" The answer is that you didn't have monitoring, and you assumed you'd notice problems when they happened. You won't. By the time someone tells you the internet is down, it's been down for 20 minutes and three customers have already left.

<!--more-->

## Why small businesses don't monitor (and why they should)

The usual objections: "We're too small for that." "Those tools are for big companies." "We'd need someone to watch it all day."

None of that is true anymore. There are free monitoring tools that take an hour to set up, run on hardware you already have, and send you an alert on your phone when something goes wrong. You don't need someone watching a dashboard 24/7. You need an automated system that pokes your critical devices every few minutes and texts you when one of them doesn't respond.

The point of monitoring isn't to create more work. It's to catch problems during the "annoying but manageable" phase instead of the "everything is on fire" phase. A switch port flapping? Fix it before it causes an outage. WAN utilization hitting 95%? Upgrade before your staff starts complaining. An access point dropping offline at 2am? Investigate before Monday morning when everyone can't connect.

## What you should actually monitor

Don't try to monitor everything. Start with the things that, if they fail, stop your business from functioning.

**WAN uptime and bandwidth.** Is your internet connection up? How much bandwidth are you using? This catches ISP outages, saturation, and the start of problems before they become full outages.

**Gateway ping.** Ping your router every 60 seconds. If it stops responding, either the router is down or the monitoring system has lost connectivity, and both are worth investigating immediately.

**Switch port status.** Monitor the uplink ports on your switches. If a trunk port between switches goes down, half your office might lose connectivity.

**Access point client count.** If an AP normally serves 20 clients and suddenly shows zero, it's probably down. If it shows 40, something is wrong with another AP and clients are all falling back to this one.

**Critical server/service availability.** If you have an on-premise server, file share, or application, monitor it. Ping it, check that its ports are responding, make sure services are running.

That's it to start. Five to ten monitoring checks cover the critical stuff for a small office.

## Free tools that actually work

**PRTG Network Monitor (free for 100 sensors)**

PRTG is my go-to recommendation for small businesses. The free tier gives you 100 sensors, which is enough to monitor a small office comprehensively. A "sensor" is one check, so pinging a device is one sensor, checking a port is another, and monitoring bandwidth on an interface is another. For a 15-person office with a router, two switches, and three APs, 100 sensors is plenty.

PRTG runs on Windows. The web interface is clean and intuitive. Alerting via email, push notification, or SMS works out of the box. It also auto-discovers devices on your network, which makes initial setup fast.

**LibreNMS (fully free and open-source)**

If you want zero licensing restrictions and you're comfortable with Linux, LibreNMS is excellent. It monitors via SNMP, supports auto-discovery, has good alerting, and creates beautiful bandwidth graphs. It runs on any Linux server or VM.

The setup is more involved than PRTG, and it helps to understand SNMP. But once it's running, LibreNMS handles networks of any size. I've seen it monitoring thousands of devices without issues.

**Uptime Kuma (fully free and open-source)**

Uptime Kuma is the simplest option. It's a lightweight monitoring tool focused on uptime checks: ping, HTTP, TCP port, DNS. It runs in Docker, has a clean web UI, and supports notifications via Slack, Telegram, email, and dozens of other services.

It doesn't do SNMP or deep network monitoring, but for basic "is this device up?" monitoring, it's perfect. You can have it running in 10 minutes.

**MikroTik The Dude (free)**

If you're running MikroTik gear, The Dude is MikroTik's own monitoring tool. It auto-discovers your network, draws a map, and monitors everything via SNMP and other protocols. It runs on a MikroTik router (using a CHR or RouterOS container) or on Windows.

It's quirky and the interface is dated, but it's free, it understands MikroTik devices natively, and it works well for small networks.

## Setting up alerts that aren't annoying

The biggest mistake with monitoring is alerting on everything. If your phone buzzes every time a sensor fluctuates, you'll start ignoring alerts within a week. That's worse than no monitoring at all, because now you think you have monitoring but you're ignoring it.

Set up alerts for things that require action:

- Device down for more than 2 minutes (not 10 seconds; brief blips happen)
- WAN bandwidth sustained above 90% for more than 5 minutes
- Switch port down on a trunk/uplink
- AP client count drops to zero

Don't alert on: normal traffic fluctuations, brief ping timeouts, individual workstations going offline (people turn their computers off).

## What to do next

Monitoring doesn't have to be complicated or expensive. Pick one of the tools above, set it up to watch your router, switch, and APs, and configure alerts to your phone. You'll catch problems before they become emergencies, and you'll finally have data when something goes wrong instead of guessing.

If you want help setting up monitoring for your business network, or if you want a full network assessment, reach out at [chris@chrisputer.tech](mailto:chris@chrisputer.tech) or visit [/services/](/services/).
