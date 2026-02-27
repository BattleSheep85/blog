+++
title = "Microsoft won't save your M365 data (and what to do about it)"
date = 2025-12-02
description = "Microsoft 365 backs up your data every 12 hours, keeps it for 14 days, and can only do a full restore. 81% of IT pros have experienced M365 data loss. Here's how to protect yourself."
draft = false
tags = ['microsoft-365', 'backup', 'small-business']
categories = ['Small Business IT']
+++

There's a dangerous assumption I run into constantly. "We use Microsoft 365, so our data is backed up." It's not. At least not in any way that would actually save you when something goes wrong. Microsoft's own service agreement makes this clear, but almost nobody reads it.

<!--more-->

## What Microsoft actually provides

Microsoft runs their infrastructure with high availability and geographic redundancy. Your data is replicated across data centers to protect against hardware failure on their end. That's great. That protects you from Microsoft having a bad day.

What it does NOT protect you from:

- A user accidentally deleting a SharePoint site or mailbox folder
- A departing employee wiping their OneDrive
- Ransomware that syncs encrypted files to OneDrive and SharePoint
- A malicious insider deleting critical data
- An admin accidentally purging a mailbox
- A compliance hold that expires, permanently deleting retained data

Microsoft's built-in retention for most M365 data works like this:

- **Exchange Online:** Deleted items recoverable for 14 days (extendable to 30 with configuration). After that, gone.
- **SharePoint/OneDrive:** Version history keeps 500 versions by default, but if a file or library is deleted, you have 93 days in the recycle bin. After that, gone.
- **Teams:** Chat messages are retained per the Exchange policy (since Teams chat is stored in Exchange).

The backup cadence is approximately every 12 hours, and restores are full-account-only. Microsoft cannot restore a single email, a single file, or a single SharePoint list from their side. It's all or nothing, and "all" means overwriting your current data with the backup.

## The shared responsibility model

Microsoft has a concept they call the "shared responsibility model." In plain English:

- **Microsoft is responsible for:** Infrastructure uptime, physical security, application availability, network controls.
- **You are responsible for:** Your data, your access management, your regulatory compliance, your data backup and retention.

It's right there in their service agreement. Your data, your problem.

## The real-world impact

81% of IT professionals report experiencing Microsoft 365 data loss. That's not a fringe issue. It's the majority.

The most common scenarios I see with clients:

**Accidental deletion.** Someone deletes a SharePoint document library or clears out "old" emails. By the time anyone notices, it's past the recovery window. This happens more often than you'd think, especially during organizational changes.

**Departing employees.** An employee leaves, their M365 license gets removed, and 30 days later their mailbox and OneDrive are permanently purged. If nobody exported that data first, it's gone.

**Ransomware via sync.** OneDrive sync is a double-edged sword. If ransomware encrypts files on a user's workstation, those encrypted files sync up to OneDrive and overwrite the good copies. Version history can help here, but only if you catch it within the retention window.

**Malicious deletion.** A disgruntled employee or a compromised account deliberately deletes data. If it's coordinated and thorough, the recycle bin windows might not save you.

## What to do about it

You need a third-party backup solution for M365. Here are the options I recommend:

### Veeam Backup for Microsoft 365

This is my go-to. If you're already running Veeam for your on-premises backup (and you should be), adding M365 backup is a natural extension.

- **Community Edition:** Covers 10 users for free. For a small business just getting started, this might be enough.
- **Paid:** Scales beyond 10 users. Backs up Exchange, SharePoint, OneDrive, and Teams to your own storage (local NAS or cloud).
- **Key advantage:** You control the backup data. It lives on your storage, not in someone else's cloud. You set the retention. You decide how long to keep it.

### Synology Active Backup for M365

If you have a Synology NAS (and I recommend the DS925+ for small businesses), Active Backup for M365 is included at no additional cost. It backs up Exchange, OneDrive, SharePoint, and Teams to your NAS.

- **Cost:** Free with Synology hardware.
- **Limitation:** Backup storage is limited to your NAS capacity.
- **Good for:** Businesses that already own a Synology and want a zero-additional-cost solution.

### Datto SaaS Protection

Datto (now part of Kaseya) offers a cloud-to-cloud backup for M365. The backup data stays in Datto's cloud, not yours.

- **Cost:** Around $4 to $6 per user per month.
- **Good for:** Businesses that don't want to manage any backup infrastructure.
- **Tradeoff:** You're dependent on Datto's cloud and pricing.

## What I recommend

For most small businesses I work with, the recommendation is Veeam Backup for Microsoft 365 writing to a local Synology NAS, with the NAS replicating to Backblaze B2 for offsite protection. This gives you:

- Full control of your M365 backup data
- Fast restores (local NAS)
- Offsite protection (B2)
- Granular recovery (individual emails, files, SharePoint items)
- No per-user monthly fees beyond the initial Veeam license (or free for up to 10 users)

The initial setup takes a few hours. Once configured, it runs automatically and you can restore individual items in minutes.

## What to do next

If you're running Microsoft 365 without a third-party backup, you're exposed. I can set up Veeam M365 backup on your existing infrastructure or recommend the right hardware if you're starting from scratch.

Email me at chris@chrisputer.tech or visit [/services/](/services/) to protect your M365 data before you learn the hard way.
