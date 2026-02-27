+++
title = "Tornado season IT checklist for Wichita businesses"
date = 2025-09-13
draft = false
description = "Kansas averages 86 tornadoes a year and Wichita is right in the path. Here's your IT checklist for tornado season: backups, power protection, cloud failover, and insurance alignment."
tags = ["disaster-recovery", "wichita", "small-business", "backup"]
categories = ["Small Business IT"]
+++

Kansas averages 86 tornadoes per year, and Wichita sits in one of the most active corridors in the state. In June 2025, storms brought 101 mph winds through the metro area and knocked out power for 66,000 Evergy customers. Some businesses were dark for days. If a tornado takes out your building, your servers, or just your power for a week, can your business survive?

Most Wichita business owners have a plan for their people (shelter, go home, etc.) but no plan at all for their data and systems. That's a problem, because you can replace a roof a lot faster than you can recreate five years of financial records.

<!--more-->

## Offsite backups (outside the tornado path)

This is the big one. If your only backup is a hard drive sitting in the same building as your server, a tornado takes them both out at the same time. That's not a backup. That's a copy sitting in the same blast radius.

Your offsite backup should be:

- **Geographically separated.** A data center in Dallas, Denver, or Kansas City. Not in the same county, and ideally not in the same tornado risk zone.
- **Automated.** Backups that depend on someone remembering to plug in a drive don't happen consistently. Cloud backup tools like Veeam, Datto, or even Backblaze B2 run on a schedule without human intervention.
- **Encrypted.** Your data should be encrypted in transit and at rest. If you're backing up to the cloud, make sure you control the encryption keys.
- **Tested.** When was the last time you actually tried restoring from your backup? If the answer is "never" or "I don't remember," schedule a test restore this month. A backup you can't restore from is worthless.

A solid cloud backup solution for a small business runs $100 to $500/month depending on data volume. Compare that to the cost of losing everything.

## UPS and power protection

Evergy does their best, but the Wichita power grid takes a beating every spring. A UPS (uninterruptible power supply) on your server and networking equipment buys you time to shut down gracefully during an outage. It doesn't keep you running for hours, but it prevents the hard crash that corrupts databases and damages hardware.

For a small business server room, you want:

- **A rack-mount or tower UPS rated for your load.** An APC Smart-UPS 1500VA handles a single server and a switch. Bigger setups need bigger units. Do the math on your actual wattage.
- **UPS on your network equipment too.** Your firewall, switch, and access points should be on battery backup. It doesn't help to have a server running if nobody can reach it because the switch died.
- **Surge protection everywhere.** Not just power strips with a "surge" sticker. Real surge protectors with a meaningful joule rating and connected equipment warranty. Better yet, a whole-building surge protector installed at the electrical panel.
- **Replace UPS batteries on schedule.** Most UPS batteries last 3 to 5 years. If yours is older than that, the battery is probably dead and you have an expensive power strip. Check or replace them before storm season starts.

## Cloud failover and remote work readiness

If your office is without power or physically damaged, can your team keep working? If everything runs on a server under someone's desk, the answer is no. But if your critical applications are in the cloud or you have a plan to fail over to cloud infrastructure, a building outage doesn't have to mean a business outage.

**Move what you can to SaaS.** Email (Microsoft 365 or Google Workspace), accounting (QuickBooks Online), file storage (SharePoint, Google Drive), and line-of-business apps. If the application runs in a browser, your team can work from anywhere with an internet connection.

**For on-premises systems you can't move,** set up replication to a cloud VM. Services like Azure Site Recovery or AWS Elastic Disaster Recovery can replicate your on-prem servers to the cloud and spin them up in minutes during a disaster. It's not free, but it's a fraction of the cost of extended downtime.

**VPN or zero-trust access.** Make sure your team can securely access business resources from home or a temporary location. Test this before you need it.

## Cellular backup for internet

When the power goes out, your Cox or AT&T connection usually goes with it (even if their network is up, your modem and ONT need power). A cellular failover connection on a separate carrier gives you basic internet connectivity during extended outages.

A Cradlepoint or Peplink device with a Verizon or T-Mobile SIM can keep email flowing, VoIP phones working (if you use a cloud phone system), and critical cloud apps accessible. Pair it with a UPS and you can ride out a multi-hour power outage without missing a beat.

## Insurance alignment

Here's one most people skip: does your business insurance actually cover your IT assets and the cost of data recovery?

- **Check your policy for electronic data coverage.** Many standard commercial property policies exclude or severely limit coverage for data loss and restoration.
- **Verify your business interruption coverage.** If a tornado puts you offline for two weeks, does your policy cover the lost revenue? What's the waiting period?
- **Document everything.** Keep an updated inventory of your IT equipment, serial numbers, purchase dates, and costs. Store this inventory offsite (cloud document, emailed to yourself, whatever). If you have to file a claim, you need to prove what you had.

Also worth knowing: the SBA offers disaster loans up to $2 million at 4% interest with 30-year terms for businesses affected by declared disasters. It's not free money, but it's low-cost capital to get back on your feet.

## Your pre-season checklist

Do these before tornado season hits:

1. Verify offsite backups are running and test a restore
2. Check all UPS batteries and replace any over 3 years old
3. Confirm surge protection on all critical equipment
4. Test remote access (VPN, cloud apps) from a non-office location
5. Review and update your IT asset inventory
6. Check your insurance policy for data and interruption coverage
7. Make sure your team knows the plan: where to go, how to connect, who to contact

## What to do next

If you're not sure whether your backups would survive a tornado, or you don't have a disaster recovery plan at all, let's fix that before storm season. I help Wichita businesses set up proper backup, failover, and recovery systems so a bad storm doesn't become a business-ending event.

Reach out at [chris@chrisputer.tech](mailto:chris@chrisputer.tech) or visit my [services page](/services/) to get started. Spring is coming fast.
