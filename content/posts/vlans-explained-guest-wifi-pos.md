+++
title = "VLANs explained: why your guest WiFi shouldn't touch your POS system"
date = 2025-10-15
draft = false
description = "VLANs keep your payment terminals, guest devices, and business computers on separate networks. Here's why that matters and how it works."
tags = ['vlans', 'networking', 'security', 'small-business', 'pci']
categories = ['Small Business IT']
+++

If your credit card terminal, guest WiFi, and office computers are all on the same network, you have a problem. Not a theoretical, "maybe someday" problem. A real, right now, compliance-failing, breach-waiting-to-happen problem. VLANs fix it, and they're not nearly as complicated as they sound.

<!--more-->

## What's a VLAN, actually?

VLAN stands for Virtual Local Area Network. In plain terms, it lets you take one physical network (your switches, your cables, your access points) and split it into multiple separate networks that can't talk to each other unless you explicitly allow it.

Think of it like having three separate buildings with three separate internet connections, except it's all running on the same hardware. A device on VLAN 10 can't see or reach a device on VLAN 20. They're completely isolated at the network level.

This matters because flat networks (where everything is on one subnet, one broadcast domain, one big happy family) are incredibly easy to attack. If someone compromises one device, they can see everything else. A malware-infected laptop on your guest WiFi can reach your payment terminal, your file server, your accounting software.

## PCI DSS 4.0 made this mandatory

If your business accepts credit cards, you fall under PCI DSS (Payment Card Industry Data Security Standard). Version 4.0 became mandatory in March 2025, and it's very clear about network segmentation.

Requirement 1.3.2 specifically mandates that the cardholder data environment (CDE), which includes your payment terminals, must be isolated from all other network segments. This isn't a suggestion. Failing a PCI audit can mean fines of $5,000 to $100,000 per month and potentially losing your ability to accept credit cards entirely.

Even if you're a small shop using a standalone terminal, your acquiring bank or payment processor can ask you to demonstrate segmentation. "Everything is on one network" is a failing answer.

## The numbers on why segmentation matters

Network segmentation isn't just about compliance. It's one of the most effective security controls you can implement.

Proper segmentation blocks about 71% of lateral movement attempts. That means when an attacker gets a foothold on one device, they can't easily jump to others. For ransomware specifically, segmented networks see an 89% reduction in spread compared to flat networks. That's the difference between one infected workstation and your entire business being encrypted.

## The three-VLAN starter setup

For most small businesses, you don't need 15 VLANs. Start with three:

**VLAN 10: Corporate**
This is where your business computers, file servers, printers, and VoIP phones live. Only company-owned and managed devices belong here.

**VLAN 20: Guest**
Your customer WiFi, personal phones, vendor laptops. This VLAN gets internet access and nothing else. It can't reach anything on VLAN 10 or VLAN 30. Period.

**VLAN 30: POS/Payments**
Your credit card terminals, payment processing equipment, and anything that touches cardholder data. This VLAN only talks to the payment processor's servers over the internet. It can't reach your corporate network or your guest network.

Each VLAN gets its own subnet, its own DHCP scope, and firewall rules that control exactly what traffic is allowed between them (which should be almost nothing).

## What you need to make this work

VLANs require managed network equipment. Your consumer router and unmanaged switch from Best Buy can't do this.

Here's what a basic VLAN setup requires:

1. **A router that supports VLANs.** MikroTik RouterOS, pfSense, OPNsense, or any enterprise router. The router handles inter-VLAN routing (if you allow any) and firewall rules.
2. **A managed switch.** This is where VLANs are actually implemented on the wired side. The switch tags traffic on each port with a VLAN ID. A MikroTik CSS610 or CRS326 handles this perfectly for a small office.
3. **Access points that support multiple SSIDs with VLAN tagging.** Each SSID maps to a different VLAN. Your "OfficeWiFi" SSID puts devices on VLAN 10, your "GuestWiFi" SSID puts devices on VLAN 20.

The configuration isn't plug-and-play, but it's not rocket science either. A competent network admin can set up a three-VLAN network in an afternoon.

## Common mistakes I see

**Guest WiFi on the same VLAN as corporate.** This is the most common one. People set up a separate SSID and think that's enough. It's not. Without VLAN tagging, both SSIDs dump traffic onto the same network.

**No firewall rules between VLANs.** Setting up VLANs but allowing all traffic between them defeats the purpose. The default should be deny everything, then allow only the specific traffic you need.

**Forgetting about printers.** If your printer is on the corporate VLAN but your POS system needs to print receipts, you need a specific firewall rule allowing that traffic. Or better yet, put receipt printers on the POS VLAN.

**Not testing isolation.** After setting up VLANs, grab a phone, connect to the guest WiFi, and try to ping your file server or POS terminal. If you can reach them, something is wrong.

## What to do next

If you're running a flat network with payment terminals, you're out of PCI compliance and your business data is one compromised device away from a bad day. VLAN segmentation is one of the most impactful upgrades you can make, and it doesn't require ripping out all your cabling.

I set up VLAN-segmented networks for small businesses using MikroTik gear that costs a fraction of enterprise pricing. Reach out at [chris@chrisputer.tech](mailto:chris@chrisputer.tech) or visit [/services/](/services/) and let's get your network properly segmented.
