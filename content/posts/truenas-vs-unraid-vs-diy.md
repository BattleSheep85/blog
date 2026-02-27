+++
title = "TrueNAS Scale vs Unraid vs DIY Linux NAS"
date = 2026-01-31
draft = false
tags = ['nas', 'storage', 'homelab']
categories = ['Homelab']
description = "Comparing TrueNAS Scale, Unraid, and a DIY Linux NAS for homelab storage. ZFS vs mixed drives vs full control."
+++

You need network storage for your homelab. The question is whether to use a turnkey NAS OS or build it yourself. TrueNAS Scale, Unraid, and a DIY Linux NAS each take a different approach to the same problem, and the right choice depends on what you value.

<!--more-->

## TrueNAS Scale

TrueNAS Scale is iXsystems' Linux-based NAS platform. It's built on Debian with ZFS as the storage backend and has native Docker (and Kubernetes) support for running apps.

**What it does well:**

- **ZFS everything.** Pools, datasets, snapshots, replication, scrubs, all managed through the web UI. You get enterprise-grade storage without touching the CLI (though you can).
- **Free.** The full-featured version is completely free. No license tiers, no paid unlock for features.
- **Native Docker/Kubernetes.** Run containers directly on the NAS. TrueNAS Scale uses a Kubernetes backend for its app catalog, but you can also run straight Docker Compose.
- **SMB/NFS/iSCSI.** All the sharing protocols you need, properly configured through the UI.
- **Replication.** Automated ZFS send/receive to another TrueNAS box or any ZFS target.

**What it doesn't do well:**

- **RAM hungry.** ZFS wants 1GB of RAM per TB of storage as a rough guideline, plus whatever your containers need. 16GB is a realistic minimum, 32GB+ is comfortable.
- **All drives must match in a vdev.** You can't just throw random drives into a RAIDZ and have it work well. Drives in a vdev should be the same size.
- **Updates can be rough.** The Cobia-to-Dragonfish-to-Electric Eel upgrade path has had its bumps. Test updates on non-critical data first.

## Unraid

Unraid is a paid NAS OS ($59 Basic, $89 Plus, $129 Pro) that takes a fundamentally different approach to storage.

**What it does well:**

- **Mixed drive sizes.** This is Unraid's killer feature. Throw a 2TB, a 4TB, and an 8TB drive into an array and Unraid uses them all. The parity drive must be as large as the biggest data drive, but data drives can be any size.
- **Docker and VMs built in.** The Community Applications plugin gives you a one-click app store with hundreds of containers. VM support with GPU passthrough is solid.
- **Individual drive access.** Unlike RAID or ZFS where the array is one logical unit, Unraid stores complete files on individual drives. If two drives fail but the parity drive is one of them, you only lose the data on the one failed data drive, not everything.
- **Low barrier to entry.** The UI is approachable, the community is huge, and there are YouTube tutorials for everything.

**What it doesn't do well:**

- **No checksums on data drives.** Unraid uses XFS or BTRFS on individual data drives with a parity drive for redundancy. But there's no block-level checksumming like ZFS. Bit rot is a real risk over time.
- **Parity rebuild is slow.** Rebuilding parity after a drive change or failure takes hours to days depending on array size.
- **Write speed.** Writes to the array go through the parity calculation, which limits write speed to roughly one drive's sequential speed. The cache pool helps (writes land on fast SSD, then get moved to the array), but it's still a limitation.
- **Paid.** Not expensive, but it's not free.

## DIY Linux NAS

Build your own. Install CachyOS (or Debian, or whatever you like), set up ZFS or MergerFS + SnapRAID, configure Samba/NFS, and run Docker for services.

**What it does well:**

- **Maximum flexibility.** You control everything. Choice of filesystem, kernel, packages, update schedule, init system, everything.
- **MergerFS + SnapRAID for mixed drives.** MergerFS pools drives into a single mount point. SnapRAID provides snapshot-based parity (not real-time, runs on a schedule). This gives you Unraid-like mixed-drive flexibility with the full Linux ecosystem.
- **No artificial limitations.** No license tiers, no locked features, no vendor decisions you disagree with.
- **Learning.** You learn more building from scratch than clicking through a web UI.

**What it doesn't do well:**

- **Setup time.** You're writing config files, setting up systemd services, configuring Samba shares by hand. It takes longer than installing TrueNAS or Unraid.
- **No unified management UI.** You can bolt on Cockpit or Webmin, but it's never as integrated as TrueNAS's web UI.
- **You own the maintenance.** Updates, troubleshooting, and monitoring are all on you.

### MergerFS + SnapRAID example

```bash
# Install on CachyOS
paru -S mergerfs snapraid

# /etc/fstab entries for individual drives
/dev/disk/by-id/ata-drive1-part1  /mnt/disk1  xfs  defaults  0  0
/dev/disk/by-id/ata-drive2-part1  /mnt/disk2  xfs  defaults  0  0
/dev/disk/by-id/ata-drive3-part1  /mnt/disk3  xfs  defaults  0  0
/dev/disk/by-id/ata-parity1-part1 /mnt/parity1 xfs defaults  0  0

# MergerFS pool
/mnt/disk1:/mnt/disk2:/mnt/disk3  /mnt/storage  fuse.mergerfs  defaults,allow_other,use_ino,category.create=mfs,moveonenospc=true,dropcacheonclose=true  0  0
```

```ini
# /etc/snapraid.conf
parity /mnt/parity1/snapraid.parity
data d1 /mnt/disk1/
data d2 /mnt/disk2/
data d3 /mnt/disk3/
content /var/snapraid/content
```

```bash
# Run SnapRAID sync nightly via cron or systemd timer
sudo snapraid sync
sudo snapraid scrub
```

## The comparison table

| Feature | TrueNAS Scale | Unraid | DIY Linux |
|---------|--------------|--------|-----------|
| Price | Free | $59-129 | Free |
| Filesystem | ZFS | XFS/BTRFS + parity | Your choice |
| Checksums | Yes | No (data drives) | Yes (ZFS) or No |
| Mixed drives | No (per vdev) | Yes | Yes (MergerFS) |
| Docker | Yes | Yes | Yes |
| VMs | Yes (limited) | Yes (KVM) | Yes |
| Web UI | Excellent | Excellent | Cockpit/DIY |
| Setup difficulty | Easy | Easy | Moderate |
| RAM needs | 16GB+ | 4GB+ | Depends |

## My recommendation

**Pick TrueNAS Scale if:**
- Data integrity is your top priority.
- You have drives of the same size (or are willing to buy matching).
- You have 16-32GB+ RAM.
- You want ZFS without managing it from the CLI.

**Pick Unraid if:**
- You have a pile of mixed-size drives.
- You want the easiest setup and the biggest community app ecosystem.
- Write speed isn't critical (media server, backups, file shares).
- You're okay with the license cost.

**Pick DIY if:**
- You want full control over everything.
- You enjoy (or want to learn) Linux system administration.
- You have specific requirements that the other two can't meet.
- You already have a Linux distro preference and don't want to run a dedicated NAS OS.

**What I run:** DIY with ZFS on a dedicated server. I like the control, I already manage Linux systems daily, and ZFS gives me the data integrity guarantees I want. But I've recommended TrueNAS Scale to plenty of people who just want reliable storage without the hands-on management.

If you're weighing NAS options and want a second opinion, email me at chris@chrisputer.tech.
