+++
title = "Managed vs unmanaged switches: when $50 more saves you thousands"
date = 2025-10-27
draft = false
description = "Unmanaged switches work fine until they don't. Here's when you need a managed switch and which ones are worth buying."
tags = ['switches', 'networking', 'small-business']
categories = ['Small Business IT']
+++

An unmanaged switch is a box with ethernet ports. You plug things in and they can talk to each other. That's it. No configuration, no management, no visibility into what's happening. For a lot of small businesses, that's all they've ever had, and it works fine right up until it doesn't. The difference between a $30 unmanaged switch and a $75 managed switch is the difference between flying blind and actually being able to see and control what's on your network.

<!--more-->

## When unmanaged is genuinely fine

I'm not going to tell you every office needs managed switches. If all of these are true, an unmanaged switch is perfectly adequate:

- **Fewer than 10 devices.** A handful of computers, a printer, and a router.
- **No VLANs needed.** Everything can be on one flat network. No guest WiFi separation, no POS isolation, no compliance requirements.
- **No VoIP phones.** If you're using cell phones or a cloud phone system that runs over WiFi, you don't need QoS.
- **No compliance requirements.** No PCI, no HIPAA, no cyber insurance questionnaire asking about network segmentation.
- **You don't care about visibility.** If a port goes bad or a device starts flooding the network, you're fine with unplugging things until you find the problem.

That describes a very small office, maybe a solo practice or a two-person shop. Once you grow past that, the limitations start costing you.

## When you need managed

**VLANs.** This is the biggest one. If you need to separate your guest WiFi, POS systems, security cameras, or IoT devices from your corporate network (and you do, if any of those things exist on your network), you need VLAN support. Unmanaged switches can't do VLANs. Every port on an unmanaged switch is on the same network, period.

**QoS for VoIP.** Voice over IP is extremely sensitive to latency and jitter. If someone starts a large file transfer while you're on a VoIP call, an unmanaged switch treats all traffic equally and your call quality tanks. A managed switch with QoS (Quality of Service) can prioritize voice traffic so calls stay clear regardless of what else is happening on the network.

**802.1X port authentication.** If you want to control which devices can connect to your network at the port level (plug in an unauthorized device and the port stays dead), you need 802.1X. This is increasingly required by cyber insurance policies and compliance frameworks.

**Port mirroring.** Need to troubleshoot network issues by capturing traffic? A managed switch can mirror traffic from one port to another where you've got a packet capture running. With an unmanaged switch, you're stuck guessing.

**SNMP monitoring.** Want to know how much bandwidth each port is using, which ports are up or down, and get alerts when something changes? That's SNMP, and unmanaged switches don't support it. You're blind to what's happening inside the switch.

**Link aggregation.** Need more bandwidth between two switches or between a switch and a server? Managed switches support LACP (Link Aggregation Control Protocol) to bond multiple ports together.

## The switches I recommend

**MikroTik CSS610-8G-2S+IN (~$75)**

Eight gigabit ports, two SFP+ cages for 10G uplink, full VLAN support, SNMP, and a web interface for management. For a small office that needs basic managed switching, this is hard to beat. It's $75. A comparable Cisco or Aruba switch runs $300 to $500.

This is a Layer 2 switch, which means it handles switching and VLANs but doesn't do routing. That's fine for most deployments since your router handles routing.

**MikroTik CRS326-24G-2S+RM (~$200)**

When you need more ports. Twenty-four gigabit ports, two SFP+ uplinks, rack-mountable, full VLAN support, and SwOS or RouterOS for management. This is the switch I deploy most often in small business racks. It handles everything from a 10-person office to a 50-person office depending on how your cabling is laid out.

**For comparison: Cisco CBS250-24T-4G (~$400)**

If you want Cisco and the support that comes with it, the CBS250 series is their small business line. Good switches, well-supported, but roughly double the price of the equivalent MikroTik for similar features.

## The real-world scenario where $50 matters

Here's a situation I've walked into more than once. An office has VoIP phones and computers all plugged into an unmanaged switch. Calls drop, audio cuts out, and the VoIP provider says the network is the problem. The business owner has already replaced the router, upgraded the internet, and is ready to throw the phone system out the window.

The actual fix: replace the $30 unmanaged switch with a $75 managed switch, configure QoS to prioritize voice traffic, and the problem disappears. That $50 difference in switch cost could have saved months of frustration and hundreds of dollars in troubleshooting.

Or this one: a business gets hit with ransomware. Everything on the network is encrypted because the entire office was on a flat network with an unmanaged switch. If they'd had a managed switch with VLANs, the damage could have been limited to one network segment instead of everything.

## What to do next

If you're running unmanaged switches and you have VoIP, guest WiFi, payment terminals, or any kind of compliance requirement, it's time to upgrade. The cost difference is minimal, and the capabilities you gain are significant.

I can assess your current switching setup and recommend the right gear for your office. Email me at [chris@chrisputer.tech](mailto:chris@chrisputer.tech) or visit [/services/](/services/) to get started.
