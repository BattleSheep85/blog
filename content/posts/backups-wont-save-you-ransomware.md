+++
title = "Your backups won't save you from ransomware (unless you do this)"
date = 2025-11-16
description = "96% of ransomware attacks target backup infrastructure. If your backups sit on a Windows share, they're getting encrypted too. Here's how to fix that."
draft = false
tags = ['backup', 'ransomware', 'cybersecurity', 'small-business']
categories = ['Small Business IT']
+++

Here's a scenario I've seen play out more than once. A business gets hit with ransomware. They stay calm because they have backups. Then they check the backups and discover those are encrypted too. Every single backup file, gone. Now the only option is paying the ransom or starting from scratch.

This happens because 96% of ransomware attacks specifically target backup infrastructure. The attackers know what they're doing. Before they encrypt your production data, they find and destroy your ability to recover.

<!--more-->

## How attackers get your backups

Modern ransomware groups don't just run an encryption script and hope for the best. They spend days or weeks inside your network before detonating. During that time, they:

1. **Map your backup infrastructure.** They look for Veeam servers, backup agents, NAS devices, anything that stores backup data.
2. **Steal credentials.** If your backup admin account uses the same domain credentials as everything else (and it usually does), they already have the keys.
3. **Delete or encrypt backup files.** Shadow copies, backup repositories, tape catalogs. All of it.
4. **Then encrypt production.** Once the backups are neutralized, they pull the trigger.

## The failure scenario

Here's the most common bad setup I see in small businesses:

- Veeam or Windows Server Backup is installed on a domain-joined server
- Backups write to a Windows file share on a NAS or another server
- That share is accessible via SMB with domain credentials
- There's no offsite copy

When ransomware hits, it encrypts the production servers AND the backup share. Both are accessible from the same compromised domain. The backup software itself might still be running, happily writing encrypted data on top of your last good backup.

Game over.

## The fix: three layers of protection

Surviving ransomware with your backups intact requires making those backups unreachable from the attack path. Here's what I build for clients:

### Layer 1: Local NAS with restricted access

Your local backup target should not be a standard Windows file share. Use a Synology NAS with:

- A dedicated local admin account (not domain-joined)
- SMB access restricted to the Veeam service account only
- Snapshots enabled on the backup volume (Synology's built-in snapshot feature creates point-in-time copies that SMB-level encryption can't touch)

This isn't bulletproof on its own, a sophisticated attacker who compromises the Veeam server can still reach the NAS. But it stops the opportunistic attacks that account for the majority of incidents.

### Layer 2: Hardened Linux Repository (immutable)

This is the real defense. A Veeam Hardened Linux Repository is a Linux server running Ubuntu that stores backups with immutability flags. Here's what makes it different:

- **No SSH access after setup.** The only way to interact with it is through the Veeam console.
- **Single-use credentials.** Veeam connects using temporary, scoped credentials for each backup job.
- **XFS immutability.** Once a backup file is written, it cannot be modified or deleted until the immutability period expires. Not by root, not by Veeam, not by anyone.

The hardware is nothing special. A refurbished Dell OptiPlex for around $500 with enough internal storage for your retention needs. The setup takes a few hours. The protection it provides is worth more than everything else in your server room combined.

Even if an attacker gets domain admin, compromises your Veeam server, and encrypts your NAS, the immutable backups on the Linux repo survive. They physically cannot be altered.

### Layer 3: Cloud with Object Lock

Your offsite copy should use object storage with immutability features. Backblaze B2 supports Object Lock, which prevents deletion or modification of backup files for a specified retention period.

This means even if someone gets your B2 API keys (which they shouldn't, but defense in depth), they still can't delete your backups until the lock period expires.

Set the lock period to match your retention needs. 30 days is a good starting point. This guarantees that even in a worst-case scenario where every other layer is compromised, you have 30 days of immutable backup copies in the cloud.

## What about air gapping?

Air gapping means physically disconnecting backup media from the network. Rotating USB drives or RDX cartridges stored in a safe or taken offsite. It works, but it's manual. Someone has to swap the drive, take it offsite, bring last week's drive back. In practice, the process breaks down within a few months because humans are humans.

I prefer the immutable approach because it's automated and doesn't rely on someone remembering to rotate a drive every week. But if you want belt and suspenders, a weekly air-gapped copy on top of the three layers above is a solid addition.

## The cost of getting this wrong

The average ransomware payment for small businesses ranges from $100,000 to $500,000. Downtime costs add another $10,000 to $50,000 per day. Some businesses never reopen.

The entire three-layer backup defense I described above costs:

- NAS: $1,000 to $1,600 (one-time)
- Hardened Linux Repo: $500 (one-time)
- Backblaze B2 with Object Lock: ~$12/month

Under $2,500 to protect against a six-figure catastrophe. That math is easy.

## What to do next

If your backups are sitting on a Windows share that's accessible from your domain, you are exposed. It's not a matter of if, it's when. I can assess your backup infrastructure, identify the weak points, and build out an immutable, ransomware-proof backup strategy.

Email me at chris@chrisputer.tech or visit [/services/](/services/) to get started.
