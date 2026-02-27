+++
title = "PoE switches: one cable replaces three"
date = 2025-11-04
draft = false
description = "Power over Ethernet eliminates the need for power outlets near access points, phones, and cameras. Here's how it works and what to buy."
tags = ['poe', 'switches', 'networking', 'small-business']
categories = ['Small Business IT']
+++

Every time I install an access point on a ceiling or a security camera in a warehouse, someone asks about power. "Do we need to run an outlet up there?" No. A single ethernet cable carries both the data and the power. That's PoE, Power over Ethernet, and it's one of those technologies that sounds minor until you realize it saves you hundreds of dollars per device in electrical work and makes your whole deployment cleaner and simpler.

<!--more-->

## What PoE actually does

PoE sends electrical power along the same ethernet cable that carries your data. A PoE switch (or PoE injector) puts power on the cable, and the device at the other end draws what it needs. The device needs to be PoE-compatible, but most access points, IP cameras, VoIP phones, and some small network appliances are.

Without PoE, every access point on a ceiling needs a power outlet. That means hiring an electrician to run power to the ceiling, which costs $200 to $500 per outlet depending on your building. With PoE, you run one ethernet cable and you're done. The AP gets power and data from the same cable.

## The PoE standards

There are three main PoE standards, and the differences are about how much power they deliver:

**802.3af (PoE): 15.4 watts per port**
The original standard. Enough for VoIP phones, basic access points, and small IP cameras. Most office devices fall into this category. A VoIP phone typically draws 5 to 10 watts, and a basic AP draws 10 to 13 watts.

**802.3at (PoE+): 30 watts per port**
The most common standard for business deployments. Handles higher-power access points (especially those with multiple radios or WiFi 6/6E), PTZ cameras, and some thin clients. This is what I recommend for most new deployments because it gives you headroom.

**802.3bt (PoE++): up to 90 watts per port**
The heavy-duty standard. Powers devices like pan-tilt-zoom cameras with heaters, high-power outdoor APs, digital signage displays, and even some small laptops. You don't need this for most office deployments, but it's nice to have if you're powering outdoor cameras or heavy-duty equipment.

## The important detail: power budget

Every PoE switch has a total power budget. This is the maximum amount of power it can deliver across all PoE ports combined. This matters more than the per-port maximum.

For example, a 24-port PoE switch might support 30W per port (PoE+), but the total power budget might be 250W. If all 24 ports need PoE, that's only about 10W per port. So you need to plan how many PoE devices you're actually connecting and make sure the total power budget covers them.

A typical deployment might look like:
- 3 access points at 15W each = 45W
- 10 VoIP phones at 7W each = 70W
- 2 IP cameras at 12W each = 24W
- Total: 139W

A switch with a 150W budget handles that fine. But add a few more cameras or upgrade to higher-power APs, and you need a bigger budget. Always buy more power budget than you think you need today.

## The switches I recommend

**MikroTik RB5009UPr+S+IN (~$250)**

This isn't a traditional switch. It's a router with 8 PoE-out ports and a total PoE budget of 25W per port (200W total). For a small office where the router also needs to power a few APs and cameras, this is an elegant all-in-one solution. It handles routing, firewall, VPN, and PoE in a single device.

**MikroTik CRS328-24P-4S+RM (~$350-400)**

Twenty-four gigabit PoE ports with a 500W total power budget. Four SFP+ uplinks for 10G connectivity. Rack-mountable. This is the workhorse switch for a small to medium business that needs to power a bunch of phones, APs, and cameras. 500W is enough for a full deployment of phones on every port plus several high-power APs and cameras.

**For comparison: Cisco CBS250-24P-4G (~$550)**

Cisco's equivalent small business PoE switch. Good hardware, well-supported, but roughly $150 to $200 more than the MikroTik for the same port count and similar power budget.

## PoE injectors: the alternative to a PoE switch

If you only need to power one or two PoE devices and you don't want to replace your entire switch, a PoE injector works. It's a small box that sits between the switch and the device. Plug your ethernet into one side, plug the cable to the device into the other, and plug the injector into a power outlet. The injector adds power to the cable.

Injectors cost $15 to $50 each. They're fine for one or two devices, but once you need three or more, a PoE switch is cleaner and usually cheaper overall. With injectors, you end up with a mess of wall warts and extra cables cluttering your rack or closet.

## Where PoE saves real money

**Access points.** Mounting an AP on a ceiling is simple when you only need one cable. Without PoE, you need a power outlet on the ceiling, which means an electrician, permits, and $200 to $500. With PoE, you run a cable from the switch, mount the AP, and plug in. Done.

**VoIP phones.** Each desk phone needs power and data. Without PoE, that's a power adapter at every desk (more clutter, more failure points). With PoE, one cable to each phone, and many PoE phones have a passthrough port so the desk computer can plug into the phone and share the single cable run.

**IP cameras.** Security cameras often go in locations where power isn't convenient: corners of warehouses, parking lot overhangs, above doorways. Running power to those locations is expensive. PoE means one ethernet cable does everything.

**Flexibility.** PoE devices can be moved easily. Need to relocate an access point? Move the cable. No electrician needed.

## Common mistakes

**Ignoring the power budget.** Buying a PoE switch without adding up your total power requirements. Then wondering why the last few devices don't get power.

**Using bad cables.** PoE is more sensitive to cable quality than data alone. Bad cables or poorly terminated connections can cause power delivery to fail or be unreliable. Use Cat5e or better, and make sure terminations are solid.

**Mixing PoE standards.** Plugging a PoE++ device into a PoE port. The device either won't power on or will run in a degraded mode. Check what your devices require before buying the switch.

## What to do next

If you're planning to deploy access points, cameras, or VoIP phones, PoE should be part of the conversation from the start. It simplifies installation, reduces costs, and makes future changes easier.

I spec and install PoE networks for small businesses, including the switches, APs, cameras, and cabling. Email me at [chris@chrisputer.tech](mailto:chris@chrisputer.tech) or visit [/services/](/services/) and let's plan your deployment.
