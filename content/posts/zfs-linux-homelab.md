+++
title = "ZFS on Linux: the practical homelab guide"
date = 2026-01-29
draft = false
tags = ['zfs', 'storage', 'homelab', 'linux']
categories = ['Homelab']
description = "A practical guide to ZFS on Linux for homelab use. Covers pools, datasets, snapshots, RAIDZ expansion, send/receive backups, and installing on CachyOS."
+++

ZFS is the filesystem I trust with data I can't afford to lose. Copy-on-write, built-in checksums, snapshots, compression, send/receive replication, and now (finally) RAIDZ expansion. It's been rock solid on Linux for years, and 2026 is a great time to start using it in your homelab.

<!--more-->

## Why ZFS?

Most filesystems trust the hardware to store data correctly. ZFS doesn't. It checksums every block and verifies integrity on every read. If a bit flips (and bits do flip), ZFS catches it. With redundancy (mirror or RAIDZ), it automatically repairs the corruption from the good copy.

The key features for homelab use:

- **Copy-on-write.** Data is never overwritten in place. This is what makes snapshots free and atomic.
- **Checksums on everything.** Detects and repairs silent data corruption (bit rot).
- **Snapshots.** Instant, zero-cost point-in-time copies. Roll back a VM, undo a bad update, recover deleted files.
- **Send/receive.** Stream a snapshot to another pool, another machine, or an offsite backup. Incremental sends only transfer what changed.
- **Compression.** LZ4 by default, nearly zero CPU overhead, 1.3-1.5x compression on typical data.
- **RAIDZ.** ZFS's version of RAID 5/6. RAIDZ1 (single parity), RAIDZ2 (double parity), RAIDZ3 (triple parity).

## Installing ZFS on CachyOS

CachyOS has ZFS packages in its repos:

```bash
sudo pacman -S zfs-dkms zfs-utils

# Load the module
sudo modprobe zfs

# Enable auto-import of pools at boot
sudo systemctl enable zfs-import-cache
sudo systemctl enable zfs-mount
sudo systemctl enable zfs.target
```

On Debian/Ubuntu, use the OpenZFS PPA:

```bash
sudo apt install zfsutils-linux
```

## Creating a pool

Identify your drives:

```bash
# List drives by ID (use these, not /dev/sdX which can change)
ls -la /dev/disk/by-id/
```

### Mirror (2 drives, like RAID 1)

```bash
sudo zpool create tank mirror \
  /dev/disk/by-id/ata-WDC_WD40EFRX-68N32N0_WD-WCC7K0001111 \
  /dev/disk/by-id/ata-WDC_WD40EFRX-68N32N0_WD-WCC7K0002222
```

### RAIDZ1 (3+ drives, single parity)

```bash
sudo zpool create tank raidz1 \
  /dev/disk/by-id/ata-drive1 \
  /dev/disk/by-id/ata-drive2 \
  /dev/disk/by-id/ata-drive3
```

### RAIDZ2 (4+ drives, double parity, recommended)

```bash
sudo zpool create tank raidz2 \
  /dev/disk/by-id/ata-drive1 \
  /dev/disk/by-id/ata-drive2 \
  /dev/disk/by-id/ata-drive3 \
  /dev/disk/by-id/ata-drive4
```

RAIDZ2 survives two simultaneous drive failures. For homelab use with consumer drives, I always recommend RAIDZ2 over RAIDZ1. Drives bought at the same time tend to fail around the same time.

## Datasets

Datasets are like directories with their own properties. Use them to organize data with different compression, quota, and snapshot policies.

```bash
# Create datasets
sudo zfs create tank/documents
sudo zfs create tank/media
sudo zfs create tank/vms
sudo zfs create tank/backups

# Set properties per dataset
sudo zfs set compression=zstd tank/documents
sudo zfs set compression=lz4 tank/media
sudo zfs set compression=off tank/vms

# Set a quota
sudo zfs set quota=500G tank/media

# Check space usage
zfs list
```

## Snapshots

Snapshots are instant and practically free. Take them liberally.

```bash
# Take a snapshot
sudo zfs snapshot tank/documents@2026-07-12

# List snapshots
zfs list -t snapshot

# Roll back to a snapshot (destroys everything after it)
sudo zfs rollback tank/documents@2026-07-12

# Access snapshot contents without rolling back
ls /tank/documents/.zfs/snapshot/2026-07-12/
```

### Automated snapshots

Use `zfs-auto-snapshot` or `sanoid` to automate snapshot creation and retention:

```bash
# Install sanoid on Arch
paru -S sanoid

# /etc/sanoid/sanoid.conf
# [tank/documents]
#   use_template = production
#   autosnap = yes
#   autoprune = yes
#
# [template_production]
#   hourly = 24
#   daily = 30
#   monthly = 12
#   yearly = 2
#   autosnap = yes
#   autoprune = yes

sudo systemctl enable --now sanoid.timer
```

This keeps 24 hourly, 30 daily, 12 monthly, and 2 yearly snapshots, automatically pruning old ones.

## Send/receive for backups

This is ZFS's killer feature for backups. You can stream a snapshot to another pool, another machine, or offsite storage.

```bash
# Full send to another pool on the same machine
sudo zfs send tank/documents@2026-07-12 | sudo zfs receive backup/documents

# Incremental send (only what changed since the last snapshot)
sudo zfs send -i tank/documents@2026-07-11 tank/documents@2026-07-12 | sudo zfs receive backup/documents

# Send to a remote machine over SSH
sudo zfs send -i tank/documents@2026-07-11 tank/documents@2026-07-12 | ssh backup-server sudo zfs receive backup/documents
```

For automated replication, `syncoid` (part of the sanoid package) handles the incremental logic for you:

```bash
# Replicate a dataset to a remote machine
sudo syncoid tank/documents backup-server:backup/documents
```

Run that on a cron or systemd timer and you've got continuous offsite backups with minimal bandwidth.

## RAIDZ expansion (the 2026 big deal)

For years, the biggest complaint about ZFS was that you couldn't add a single drive to an existing RAIDZ vdev. You had to add a whole new vdev. That changed with OpenZFS 2.3, which landed RAIDZ expansion support.

```bash
# Check your OpenZFS version
zfs version

# Add a drive to an existing RAIDZ vdev
sudo zpool attach tank raidz1-0 /dev/disk/by-id/ata-new-drive
```

The pool rebalances data across the new drive in the background. This is a huge deal for homelabbers who start with 3 drives and want to grow to 4 without rebuilding the pool.

**Note:** This feature is still relatively new. I'd make sure your backups are solid before expanding a production pool. But the feature works, and it removes one of ZFS's biggest limitations.

## ECC RAM: do you need it?

The ZFS community has debated this for years. The short answer: ECC RAM is nice to have but not strictly required.

ZFS checksums catch corruption wherever it happens, including in RAM. Without ECC, a RAM bit flip could theoretically corrupt data before ZFS checksums it. But this risk applies to every filesystem, not just ZFS. ZFS is actually better at detecting the resulting corruption than ext4 or XFS, which would silently write bad data.

If you're buying new hardware for a NAS, get ECC if you can. Used servers with ECC RAM are cheap. But don't avoid ZFS because your mini PC has non-ECC RAM. The checksum protection alone is still a massive improvement over any non-checksumming filesystem.

## My homelab ZFS setup

I run a RAIDZ2 pool across four 4TB drives in a used Dell T340 with 32GB ECC RAM. Sanoid handles automated snapshots, and syncoid replicates to a secondary pool on a different machine nightly. Total usable space is about 8TB after parity and overhead.

For the data on that pool, I have datasets for documents, media, VM images, and backups, each with appropriate compression and snapshot policies.

If you're planning a ZFS setup for your homelab, email me at chris@chrisputer.tech. I'm always happy to talk storage.
