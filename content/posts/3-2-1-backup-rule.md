+++
title = "The 3-2-1 backup rule for a 20-person office"
date = 2025-11-10
description = "The 3-2-1 backup rule is the minimum standard. Here's how to implement it in a real small office, what it costs, and why 3-2-1-1-0 is the new baseline."
draft = false
tags = ['backup', 'small-business', 'disaster-recovery']
categories = ['Small Business IT']
+++

The 3-2-1 backup rule has been around for decades, and it's still the foundation of every solid backup strategy. Three copies of your data, on two different types of media, with one copy offsite. Simple to explain. Harder to actually implement correctly.

<!--more-->

## What 3-2-1 looks like in practice

For a typical 20-person office with a couple of servers, here's what I build:

**Copy 1: Production data.** This is your live servers, your file shares, your databases. It's the data your people use every day. This isn't really a "backup" per se, it's just the first copy.

**Copy 2: Local NAS.** A Synology DS925+ (around $640 for the unit) loaded with drives. For most small offices, four 8TB drives in a RAID configuration gives you roughly 24TB usable. Total cost with drives runs $1,000 to $1,600 depending on drive choice. Veeam backs up to this NAS on a schedule, typically every night for file servers and every few hours for critical applications.

**Copy 3: Cloud object storage.** Backblaze B2 at $6 per terabyte per month. For 2TB of backup data, that's $12 a month. This copy protects you from the thing that local backups can't handle: the building is gone. Fire, tornado, flood, theft. If your only backups are sitting next to the servers they're protecting, you don't have a real backup strategy.

Total cost for this setup: roughly $1,000 to $1,600 one-time for the NAS hardware, plus $12 a month or so for cloud storage. That's it.

## Why 3-2-1 isn't enough anymore

Ransomware changed the game. 87% of ransomware attacks encrypt data, and modern ransomware specifically targets backup infrastructure. The attackers know that if they can encrypt your backups along with your production data, you have no choice but to pay.

A standard 3-2-1 setup where your backups sit on a Windows share accessible from the network? Those backups get encrypted right along with everything else. I've seen it happen.

## The 3-2-1-1-0 rule

The updated framework adds two more requirements:

**1 immutable or air-gapped copy.** At least one of your backup copies must be immutable, meaning it cannot be modified or deleted for a set retention period, even by an administrator. A Veeam Hardened Linux Repository does this locally. Backblaze B2 with Object Lock does this in the cloud. An air-gapped copy (like a rotated USB drive stored offsite) also counts, though it's more manual.

**0 errors on verified restores.** Your backups must be tested regularly, and those tests must complete with zero errors. A backup you've never restored from is a hope, not a plan. Veeam's SureBackup feature automates this by spinning up VMs from backup in an isolated sandbox and running verification checks.

## Breaking down the costs

Here's a realistic budget for 3-2-1-1-0 in a 20-person office:

| Component | Cost |
|-----------|------|
| Synology DS925+ (diskless) | ~$640 |
| 4x 8TB NAS drives | $400-$960 |
| Backblaze B2 (2TB) | ~$12/month |
| Hardened Linux Repo (refurb Dell OptiPlex) | ~$500 |
| Veeam Community Edition | Free (up to 10 workloads) |

One-time hardware: roughly $1,500 to $2,100. Monthly cloud: around $12. That's your entire enterprise-grade backup infrastructure for less than the cost of one ransomware incident's downtime.

## Common mistakes I see

**Backing up to the same server.** A second hard drive in the same machine is not a backup. It's a convenience for hardware failure and nothing else.

**"The cloud is our backup."** If you're using Microsoft 365 and assuming Microsoft backs up your data, read my post on M365 backup. They don't, at least not in any way that would actually save you.

**Offsite that isn't really offsite.** I've seen businesses with their "offsite" backup at the owner's house two miles away. A tornado doesn't care about your two-mile radius. Offsite means a different geographic region.

**Never testing restores.** 23% of backup recoveries fail. If you've never tested yours, you're rolling the dice.

## What to do next

If your backup strategy is "I think we have something" or "the IT guy set it up a while ago," that's a red flag. I can assess your current setup, identify the gaps, and build out a proper 3-2-1-1-0 implementation.

Email me at chris@chrisputer.tech or visit [/services/](/services/) to get started.
