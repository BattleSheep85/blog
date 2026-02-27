+++
title = "Cloud backup vs local backup vs both"
date = 2025-11-14
description = "Local backup is fast but vulnerable. Cloud backup is safe but slow. Here's why hybrid is the right answer for most small businesses, and what it actually costs."
draft = false
tags = ['backup', 'cloud', 'small-business']
categories = ['Small Business IT']
+++

I get this question constantly. "Should we back up to the cloud or keep it local?" The answer is both. Every single time. But since that answer requires some explaining, let me break down why each approach has serious weaknesses on its own.

<!--more-->

## Local backup: fast but fragile

Local backup means your backup data lives on hardware in your office. A NAS, an external drive, a second server. The advantages are real:

- **Fast restores.** Pulling 500GB from a local NAS over gigabit Ethernet takes about an hour. That same restore from the cloud could take days.
- **No internet dependency.** If your ISP goes down (and it will), your local backups are still accessible.
- **No monthly fees.** Once you buy the hardware, the ongoing cost is just electricity and eventual drive replacement.

The problem is obvious: if something happens to your office, your backups go with it. Fire, flood, tornado, theft, a burst pipe above the server closet. I've seen all of these. A business in Wichita with both their servers and their backup NAS in the same room lost everything to a roof leak on a long weekend.

Local backups also get encrypted by ransomware if they're on network-accessible storage. More on that in my ransomware post.

## Cloud backup: safe but slow

Cloud backup means your data is stored at a provider's data center in another geographic region. The advantages:

- **Geographic separation.** A tornado can't take out your office and your cloud backups.
- **No hardware to maintain.** No drives to replace, no NAS to rack.
- **Scales easily.** Need more storage? Just pay for it.

The problem is speed, specifically your internet connection. Let me do some math that sobers people up fast.

Say you have 2TB of backup data and a 100 Mbps upload speed (which is generous for most small office connections). That initial full backup takes approximately 44 hours of sustained uploading. And that's theoretical maximum. Real-world throughput is typically 60 to 70% of the rated speed, so you're looking at 60+ hours.

Now imagine you need to do a full restore. Even with a fast download, pulling 2TB back down is a multi-day process. If your server is dead and your business is stopped, "wait three days" is not an acceptable answer.

## The egress fee trap

Not all cloud storage is priced the same, and the biggest gotcha is egress fees, what the provider charges you to download your own data.

**Backblaze B2:** $6 per TB per month for storage, free egress up to 3x your stored amount. This is the most small-business-friendly pricing out there.

**AWS S3:** Cheap storage, but egress runs $0.09 per GB. Restoring 2TB from S3 costs about $180 just in transfer fees. During a disaster. When you're already having a bad day.

**Wasabi:** No egress fees, but requires a 90-day minimum retention and has a minimum storage charge. Good for large datasets you don't churn through.

For small businesses, I recommend Backblaze B2 almost exclusively. The pricing is transparent and the egress policy is generous.

## Hybrid: the right answer

A hybrid approach gives you the best of both worlds:

- **Local NAS for fast restores.** Your most recent backups are right there on the local network. Server goes down? You can have it back in minutes to hours using Veeam Instant VM Recovery.
- **Cloud for disaster protection.** Your backup copies replicate to Backblaze B2 overnight. If the building is gone, your data isn't.

Here's what this costs for a typical 20-person office:

| Component | Cost |
|-----------|------|
| Synology DS925+ (diskless) | ~$640 |
| 4x 8TB NAS drives | $400-$960 |
| Backblaze B2 (2TB stored) | ~$12/month |
| Veeam Community Edition | Free |

**One-time hardware: ~$1,040 to $1,600. Monthly cloud: ~$12.**

Compare that to pure cloud backup services that charge $50 to $150 per server per month with slow restores and egress fees, and hybrid wins on both cost and capability.

## How the data flows

Here's the typical schedule I set up:

1. **Every night (or more frequently for Tier 1 systems):** Veeam backs up all VMs and physical servers to the local NAS.
2. **After the local backup completes:** A backup copy job replicates that data to Backblaze B2.
3. **Weekly:** An integrity check runs on both local and cloud copies.
4. **Monthly:** A test restore verifies everything actually works.

The local NAS holds 30 days of restore points. The cloud holds 90 days. If you need to go back further, the cloud has you covered. If you need a fast restore from last night, the local NAS handles it.

## When cloud-only makes sense

There are a few scenarios where cloud-only backup is reasonable:

- Fully remote business with no physical office
- All workloads already run in the cloud (Azure VMs, AWS instances)
- Very small data footprint (under 100GB)

Even then, I'd argue for keeping a local copy somewhere. An encrypted external drive at someone's house is better than nothing for fast restores.

## What to do next

If you're running purely local backups, you're one disaster away from losing everything. If you're running purely cloud backups, your restore time might shock you. Hybrid fixes both problems for surprisingly little money.

I can assess your current setup and build out a hybrid backup strategy that fits your budget. Email me at chris@chrisputer.tech or visit [/services/](/services/).
