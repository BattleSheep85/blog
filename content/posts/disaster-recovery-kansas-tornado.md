+++
title = "Disaster recovery for Kansas businesses (tornado alley edition)"
date = 2025-12-04
description = "Kansas averages 86 tornadoes per year. If your disaster recovery plan is 'we have a backup drive at the owner's house,' you need a real plan. Here's how to build one."
draft = false
tags = ['disaster-recovery', 'backup', 'kansas', 'wichita']
categories = ['Small Business IT']
+++

I live in Wichita. I've seen what storms do to buildings. And I've seen what happens to businesses that thought they had a disaster recovery plan but actually had a backup drive sitting in the same building as their servers. Kansas averages 86 tornadoes per year. Since 1980, there have been 102 billion-dollar weather events in the US, and the central plains take more than its share. If you run a business in Kansas, disaster recovery isn't hypothetical. It's a matter of when.

<!--more-->

## What disaster recovery actually means

Disaster recovery (DR) is not the same thing as backup. Backup is a copy of your data. DR is a plan for getting your entire business operational again after a catastrophic event.

A good DR plan answers these questions:

- Where is our data, and can we access it if this building is gone?
- How do we get our applications running again, and on what hardware?
- How long will it take, and what's the cost of that downtime?
- Who does what, and in what order?
- How do we communicate with staff, clients, and vendors during the outage?

If you can't answer all of those today, you don't have a DR plan. You have a backup, maybe.

## The Kansas-specific problem

Tornadoes don't care about your two-mile offsite strategy. I've seen businesses with their "offsite" backup at the owner's house across town. An EF3 tornado cuts a path five miles wide. Your office and the owner's house can both be in the damage zone.

Other Kansas weather threats:

- **Severe thunderstorms with large hail.** A hailstorm can destroy exterior HVAC units that cool your server room.
- **Ice storms.** Multi-day power outages are common. Your UPS gives you 15 minutes. Your generator (if you have one) runs until the propane runs out.
- **Flooding.** Flash flooding from heavy rain events. If your server room is in a basement, you're at risk.

Then there's the non-weather stuff that applies everywhere: fire, burst pipes, theft, vandalism, and the universal favorite, someone unplugging the wrong thing.

## The three pillars of DR for small businesses

### 1. Truly offsite backup

"Offsite" means a different geographic region. Not across town. Not at another office 20 miles away. A different region entirely.

Backblaze B2 stores your data in their data centers in Sacramento or Phoenix. AWS stores it in whatever region you choose. The point is that a tornado in Wichita doesn't affect your backup data in California.

For a small business, this means:

- Local NAS for fast day-to-day restores
- Cloud backup (Backblaze B2) for geographic separation
- Both copies running on automated schedules, not manual processes

Cost: $12 to $50 per month for the cloud storage, depending on data volume.

### 2. Cloud-ready recovery

When your physical office is damaged, you can't just restore to new hardware in the same building. You might not have a building. You need a way to get critical systems running in the cloud while you figure out the physical situation.

Options for small businesses:

- **Veeam Cloud Connect:** Restore VMs directly to a service provider's cloud infrastructure. Many Veeam Cloud & Service Providers (VCSPs) offer this with pre-negotiated pricing so you're not scrambling to set up AWS during a disaster.
- **Azure Site Recovery:** Replicate your critical VMs to Azure. When disaster hits, fail over to Azure VMs. Monthly cost for a few VMs in standby is surprisingly affordable ($25 to $50 per VM per month for the replication, plus compute costs during actual failover).
- **Manual cloud rebuild:** Least automated, most effort. Keep documented build procedures and application installers in your cloud backup. Spin up cloud VMs manually and rebuild. Slower, but costs nothing until you actually need it.

For most 20-person offices, I recommend having at least one critical server (email, LOB application) replicable to cloud infrastructure. The rest can be rebuilt from backup at a more relaxed pace.

### 3. A documented, tested plan

A DR plan that exists only in someone's head is not a plan. It needs to be written down and stored somewhere accessible even if the office is gone (cloud document, printed copy in a safe deposit box, both).

The plan should include:

- **Contact list:** All employees, key vendors, insurance agent, internet provider, landlord. Phone numbers, not just email (email might be down).
- **Priority list:** Which systems come back first? In what order?
- **Credentials:** Where are the admin passwords stored? (Use a cloud-based password manager like 1Password or Bitwarden, not a spreadsheet on the file server that just got destroyed.)
- **Recovery procedures:** Step-by-step instructions for restoring each critical system.
- **Roles and responsibilities:** Who calls the insurance company? Who handles communication with clients? Who manages the technical recovery?

Test the plan at least once a year. A tabletop exercise (walk through the scenario verbally with your team) takes two hours and costs nothing. It will reveal gaps you didn't know existed.

## SBA disaster loans

If a major disaster hits, the Small Business Administration offers disaster loans:

- Up to $2 million for physical damage and economic injury
- Interest rate around 4% (varies)
- Terms up to 30 years
- Available after a presidential or SBA disaster declaration

These loans can help you rebuild, but they take weeks to process and fund. They're not going to get you back up and running next week. That's why having your own DR plan and insurance matters.

## Cyber insurance and DR

Most cyber insurance policies now require documented backup and DR procedures. If you file a claim and can't demonstrate that you had reasonable safeguards in place, the claim may be denied. Having a tested DR plan isn't just good practice. It might be a policy requirement.

## What to do next

If your disaster recovery plan is "we'll figure it out" or "the IT guy knows what to do," you're not ready for a Kansas storm season. I can build a DR plan tailored to your business, set up the backup infrastructure, and run a tabletop test so you know it works before you need it.

Email me at chris@chrisputer.tech or visit [/services/](/services/) before the next storm season arrives.
