+++
title = "RPO and RTO: the money conversation about your backups"
date = 2025-11-12
description = "RPO and RTO aren't technical jargon. They're business decisions about how much downtime and data loss you can afford. Here's how to figure out your numbers."
draft = false
tags = ['backup', 'disaster-recovery', 'small-business']
categories = ['Small Business IT']
+++

Every backup conversation eventually comes down to two questions. How long can you be down? And how much data can you afford to lose? Those questions have names: RTO and RPO. They sound like technical jargon, but they're really business decisions with dollar signs attached.

<!--more-->

## RTO: Recovery Time Objective

RTO is how long it takes to get back up and running after something goes wrong. Not how long you'd like it to take. How long it actually takes with your current setup.

If your server dies at 8 AM and your team can't work until it's restored, every hour of downtime has a cost. For a 20-person office, figure $1,000 to $5,000 per hour depending on what you do. Accounting firm during tax season? Way more. Warehouse with manual workarounds? Maybe less.

Your RTO is the maximum downtime the business can absorb before it starts causing real damage, lost revenue, missed deadlines, angry clients, compliance violations.

## RPO: Recovery Point Objective

RPO is how much data you can afford to lose, measured in time. If your last backup was at midnight and your server crashes at 4 PM, you've lost 16 hours of work. Every invoice entered, every email sent, every file saved between midnight and 4 PM is gone.

RPO answers the question: if we had to roll back to the last good backup, how far back is acceptable?

For some data, the answer is "not even one minute." For other data, losing a full day might be annoying but survivable.

## The tiered approach

Not all your systems are created equal. I use a three-tier framework with clients:

**Tier 1: Critical.** Email, ERP, line-of-business applications, anything that stops revenue if it's down. Target: 1-hour RTO, 15-minute RPO. This means near-continuous backup and a fast recovery method like Veeam Instant VM Recovery, which can spin up a VM directly from the backup file in minutes.

**Tier 2: Important.** File shares, internal tools, secondary databases. The business can function without these for a few hours using workarounds. Target: 4-hour RTO, 1-hour RPO.

**Tier 3: Nice to have.** Development environments, archive data, non-critical internal apps. Target: 24-hour RTO, daily RPO. A nightly backup is fine here.

## The gap between belief and reality

Here's the uncomfortable part. Surveys consistently show that about 60% of businesses believe they can recover from a major outage in hours. When those same businesses actually face a real incident, only about 35% meet that target.

The gap comes from assumptions that were never tested. "We have backups" is not the same as "we've verified we can restore from those backups within our RTO." Those are two very different statements.

Common reasons the gap exists:

- Backups run nightly but the business assumed they ran hourly
- Nobody calculated how long a full restore from cloud actually takes over the office internet connection
- The backup covers the data but not the application configuration, so rebuilding the server takes an extra day
- The restore was never tested, and the first real attempt reveals corrupted backups

## How to figure out your numbers

Sit down with whoever runs each department and ask these questions:

1. If this system went down right now, what happens?
2. How long before it starts costing us money or clients?
3. If we had to go back to yesterday's data, what would we lose?
4. What's the dollar impact of that lost data?

You'll get a range. The CFO's answer will be different from the warehouse manager's answer. That's fine. The point is to have the conversation and document the numbers.

Then compare those numbers to what your backup infrastructure can actually deliver. If your RTO target for email is 1 hour but your current restore process takes 6 hours, you have a gap. That gap needs to be closed with better technology, better processes, or a revised expectation.

## What this costs

Tighter RPO and RTO targets cost more money. That's the tradeoff.

- **Daily backups** (24hr RPO): cheapest, simplest. A NAS and Veeam Community Edition.
- **Hourly backups** (1hr RPO): moderate. Requires more storage and more backup jobs, but still within reach of most small businesses.
- **Near-continuous** (15min RPO): requires Veeam with CDP (Continuous Data Protection) or similar. More licensing cost, more storage throughput.
- **Instant recovery** (minutes RTO): requires Veeam Instant VM Recovery and enough hardware to run VMs directly from the backup repository. Hardware investment goes up.

The sweet spot for most 20-person offices is hourly backups for critical systems and nightly for everything else, combined with tested restore procedures. That gets you a realistic 2 to 4 hour RTO and a 1-hour RPO for the stuff that matters most.

## What to do next

If you don't know your RPO and RTO numbers, you're not alone, but you need to fix that. I can help you map out your systems, define realistic targets, and make sure your backup infrastructure actually meets them.

Email me at chris@chrisputer.tech or check out [/services/](/services/) to get the conversation started.
