+++
title = "Your office WiFi is a consumer router on a shelf"
date = 2025-10-11
draft = false
description = "That Netgear or TP-Link from Best Buy was never meant to run a business. Here's why it's costing you more than you think."
tags = ['wifi', 'networking', 'small-business']
categories = ['Small Business IT']
+++

I walk into small offices all the time and find the same thing: a Netgear Nighthawk or TP-Link Archer sitting on a shelf in a back closet, blinking away, trying to serve 20 people and 50 devices. It was probably $200 at Best Buy, set up by whoever was "good with computers," and nobody has touched it since. That router is silently wrecking your business every single day.

<!--more-->

## Consumer routers have consumer limits

There's nothing wrong with consumer routers in a house. They're designed for a family of four streaming Netflix and doing homework. But an office is a completely different animal.

A consumer router is built to handle 10 to 15 devices comfortably. Some advertise support for more, but the processor and RAM can't actually keep up. Once you start counting laptops, phones, tablets, printers, VoIP phones, security cameras, and that smart TV in the break room, you're well past that number in most offices.

Here's what consumer routers don't do:

- **VLANs.** You can't separate your guest WiFi from your payment systems or business network. Everything is flat, which means a compromised guest device can see your file server.
- **Logging.** When something goes wrong, there's no meaningful record of what happened. Good luck figuring out why the network dropped at 2pm on Tuesday.
- **QoS that actually works.** VoIP calls break up because someone in accounting is uploading a 2GB file to Google Drive, and the router can't prioritize traffic.
- **Remote management.** If something breaks, someone has to physically go to the router, plug in, and hope the admin password is still on that sticky note.

## Thermal throttling is real

Consumer routers are built with cheap plastic enclosures and minimal cooling. In a climate-controlled home office, that's fine. Sitting on a shelf in a dusty server closet or above a drop ceiling, the router heats up and starts throttling its own performance to avoid cooking itself. You'll see random slowdowns, dropped connections, and devices that just can't stay connected. Nobody thinks to blame the router, so they call the ISP, who says the line is fine, and the cycle repeats.

## The math that should bother you

Let's talk about what that "cheap" router actually costs.

A $200 consumer router in a business environment lasts about 18 to 24 months before it starts flaking out. That's generous. Over five years, you're buying two or three of them. So $400 to $600 in hardware alone.

Now add the soft costs. Every time the WiFi drops, your staff sits around waiting. If you've got 10 people at $25/hour and the WiFi goes down for 30 minutes twice a month, that's $250/month in lost productivity. Over a year, that's $3,000. Over five years? You don't want to do that math.

Compare that to a MikroTik hAP ax3. It runs about $130 to $150, it's built for continuous duty, supports VLANs, has proper firewall rules, and will run for five or more years without breaking a sweat. Add a managed switch for another $75 to $200 and you've got a proper network for under $500 total.

## What a proper setup looks like

For a 10 to 20 person office, here's what I typically deploy:

1. **Router/firewall:** MikroTik hAP ax3 or RB5009 ($130-$180). Handles routing, firewall, VPN, DHCP, and DNS.
2. **Managed switch:** MikroTik CSS610 or CRS326 ($75-$200). Gives you VLANs, port monitoring, and room to grow.
3. **Access points:** Dedicated WiFi APs mounted on the ceiling where they belong, not on a shelf behind a stack of paper.

Total cost: $500 to $700. That's less than one year of replacing consumer gear and dealing with the downtime.

## The signs your router is the problem

If any of this sounds familiar, your consumer router is probably the bottleneck:

- WiFi drops out for a few minutes, then comes back on its own
- Certain areas of the office have terrible signal
- VoIP calls sound choppy or cut out
- The network gets noticeably slower in the afternoon when everyone's connected
- You've rebooted the router more than twice in the last month
- Your "fix" for WiFi issues is unplugging the router and plugging it back in

Every one of these is a symptom of consumer hardware being asked to do a job it wasn't designed for.

## What to do next

If you're running your office on a consumer router and any of this resonated, it's worth getting a proper assessment. I can take a look at your current setup, tell you exactly where the problems are, and put together a plan to fix it without blowing your budget.

Reach out at [chris@chrisputer.tech](mailto:chris@chrisputer.tech) or check out what I offer at [/services/](/services/). A proper network doesn't have to be expensive. It just has to be done right.
