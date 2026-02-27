+++
title = "Two ISPs, one network: internet failover for businesses that can't go down"
date = 2025-10-19
draft = false
description = "When your internet goes down, your business stops. Here's how to set up automatic failover with a second connection so that doesn't happen."
tags = ['networking', 'small-business', 'failover', 'mikrotik']
categories = ['Small Business IT']
+++

Your internet goes down. Phones stop ringing. Credit cards can't process. Cloud apps are gone. Email is gone. Your staff sits around waiting. This happens to every business eventually. The question is whether you lose five hours of revenue or five seconds. Automatic internet failover is how businesses that can't afford downtime make sure they don't have any.

<!--more-->

## How much downtime actually costs

Gartner pegs average downtime costs at $5,600 per minute. That's an enterprise number, but even for a small business, the math is ugly. If you've got 10 employees at $25/hour sitting idle, that's $250/hour in payroll alone. Add lost sales, missed calls, and the scramble to catch up once things come back, and a four-hour outage easily costs a small business $2,000 to $5,000.

And it's not just catastrophic outages. ISPs have maintenance windows, regional issues, and good old-fashioned equipment failures. Cox, AT&T, whoever you have. They all go down. The average business ISP connection has 99.5% to 99.9% uptime, which sounds great until you realize that's 4 to 44 hours of downtime per year.

LTE and 5G failover now accounts for about 42% of backup internet deployments for businesses. It's cheap, it's fast to deploy, and it works.

## Tier 1: LTE/5G failover ($50-100/month)

This is the simplest and cheapest option. You add a cellular modem to your network, and when your primary ISP goes down, traffic automatically routes over the cellular connection.

**What you need:**
- An LTE/5G modem. Something like a MikroTik LtAP or a standalone unit like a Cradlepoint or Peplink.
- A data plan. T-Mobile and Verizon both offer business data plans in the $50 to $100/month range for 100GB to unlimited.
- A router that supports failover. MikroTik RouterOS has a feature called Netwatch that pings a target (like 8.8.8.8) and automatically switches your default route to the backup connection when the primary goes down.

**How it works with MikroTik:**
Netwatch monitors your primary gateway by pinging an external IP. When the pings fail (primary ISP is down), a script activates the cellular route. When pings succeed again, it switches back. The failover happens in 10 to 30 seconds depending on your ping interval settings. Your staff might notice a brief hiccup, but they won't lose their VoIP calls for hours.

**Best for:** Businesses that can tolerate a few seconds of switchover and don't need the full bandwidth of their primary connection during an outage. Cellular is usually 25 to 100 Mbps, which is enough for email, cloud apps, VoIP, and credit card processing.

## Tier 2: Dual ISP with automatic failover ($150-300/month)

If your business needs more bandwidth during a failover than cellular can provide, or if you want to load-balance across two connections during normal operation, dual ISP is the way to go.

**What you need:**
- Two separate ISP connections, ideally from different providers using different infrastructure (fiber from one, cable from another). If both come in on the same cable plant, a single backhoe can take out both.
- A router with multi-WAN support. MikroTik handles this natively. So do pfSense, OPNsense, and most enterprise routers.

**How it works:**
Your router has two WAN interfaces, each connected to a different ISP. You configure failover so that if the primary link drops, all traffic shifts to the secondary. You can also configure load balancing to use both connections simultaneously, splitting traffic across them for better total throughput.

MikroTik's recursive routing with Netwatch makes this clean. You set up route distances so the primary is preferred, and Netwatch handles the switchover when the primary health check fails.

**Best for:** Businesses with 20+ employees, heavy cloud usage, or VoIP systems that need consistent bandwidth even during a failover event.

## Tier 3: SD-WAN ($500+/month)

SD-WAN (Software-Defined Wide Area Network) is the premium option. It's what you see in businesses with multiple locations, heavy SaaS usage, and zero tolerance for any disruption.

**What you get:**
- Automatic failover across multiple connections (fiber, cable, LTE, whatever you have)
- Per-application traffic steering (VoIP goes over the best-quality link, file transfers go over the cheapest)
- Centralized management across multiple sites
- Built-in encryption and security features

**Vendors:** Meraki SD-WAN, Fortinet, Cradlepoint, VMware VeloCloud. These all come with hardware costs plus monthly licensing.

**Best for:** Multi-location businesses, organizations with strict uptime SLAs, and companies already spending $500+/month on networking that want to consolidate and optimize.

## What I recommend for most small businesses

For a single-location small business with 5 to 25 employees, Tier 1 is the sweet spot. A MikroTik router you probably already need for other reasons, plus a $50 to $100/month cellular data plan, gives you automatic failover for under $1,200/year. That's cheap insurance against outages that can cost you thousands in a single afternoon.

If you're processing a lot of transactions or running a call center, bump up to Tier 2 with dual ISP. The extra $100 to $200/month pays for itself the first time your primary ISP has a bad day.

## One thing people forget

Failover only works if you test it. Once it's set up, pull the ethernet cable on your primary ISP and make sure everything actually switches over. Verify that your VoIP works, your credit card terminals process, and your cloud apps load. Do this quarterly. The worst time to find out your failover doesn't work is during an actual outage.

## What to do next

If your business goes dead when the internet goes down, that's a solvable problem. I set up failover configurations for small businesses using MikroTik, and the whole project usually takes a few hours from start to finish.

Reach out at [chris@chrisputer.tech](mailto:chris@chrisputer.tech) or visit [/services/](/services/) to get started.
