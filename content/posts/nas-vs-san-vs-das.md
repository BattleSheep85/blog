+++
title = "NAS vs SAN vs DAS: what your small business actually needs"
date = 2025-11-30
description = "NAS, SAN, and DAS all store data, but they work very differently. Here's which one fits your small business and what it actually costs."
draft = false
tags = ['storage', 'nas', 'small-business']
categories = ['Small Business IT']
+++

Storage gets complicated fast. NAS, SAN, DAS, iSCSI, NFS, SMB. The acronyms pile up and the vendor pitches get thick. But for most small businesses, the answer is much simpler than the storage industry wants you to believe. Let me break down the three main options and tell you which one you probably need.

<!--more-->

## DAS: Direct Attached Storage

DAS is exactly what it sounds like. Storage that's directly connected to a single server. The hard drives inside your server are DAS. An external drive bay connected via USB or SAS is DAS.

**Advantages:**
- Simplest to set up. Plug it in, format it, done.
- Cheapest option. No network hardware, no special configuration.
- Fastest possible performance since there's no network between the server and the storage.

**Limitations:**
- Only one server can access it. If you have two servers that need to share the same data, DAS doesn't work.
- If the server dies, the storage is offline until you connect it to a different machine.
- No built-in redundancy unless you configure RAID within the server.

**Best for:** Single-server environments, dedicated database servers that need raw performance, backup targets attached to a specific machine.

## NAS: Network Attached Storage

A NAS is a dedicated storage device on your network that shares files over standard protocols like SMB (Windows file sharing) and NFS (Linux/Unix file sharing). It's essentially a specialized file server.

**Advantages:**
- Multiple servers and workstations can access the same files simultaneously.
- Built-in RAID, snapshots, replication, and often backup features.
- Easy to manage through a web interface.
- Separates storage from compute, so your server dying doesn't take your files with it.

**Limitations:**
- Performance is limited by your network speed. Gigabit Ethernet caps you around 110 MB/s. 10GbE gets you up to about 1,000 MB/s.
- Not ideal for database workloads or anything that needs block-level storage access.
- Another device to power, cool, and maintain.

**Best for:** Shared file storage, backup targets, media storage, general-purpose storage for offices. About 80% of small businesses with under 50 employees need a NAS and nothing more.

## SAN: Storage Area Network

A SAN provides block-level storage over a dedicated network. Instead of sharing files, it presents raw disk volumes to servers. From the server's perspective, a SAN volume looks like a local hard drive.

**Advantages:**
- High performance for database workloads, VMs, and anything I/O-intensive.
- Multiple servers can access the same storage backend (important for clustered hypervisors).
- Advanced features like thin provisioning, deduplication, and storage tiering.

**Limitations:**
- Expensive. A basic SAN starts at $10,000 to $20,000 for the hardware alone.
- Complex to set up and maintain. iSCSI is more accessible, but Fibre Channel SANs require dedicated switches, HBAs, and specialized knowledge.
- Overkill for most businesses with fewer than 50 employees.

**Best for:** Virtualization clusters that need shared storage, high-performance database environments, businesses with heavy I/O requirements.

## What your small business actually needs

For a typical 20-person office, here's my recommendation: **a NAS.**

Specifically, I recommend the **Synology DS925+**. It's a 4-bay NAS that runs about $640 for the diskless unit. Add four drives and you're looking at $1,000 to $1,600 total depending on drive capacity.

What you get for that money:

- **RAID protection.** Run SHR (Synology Hybrid RAID) for single-drive fault tolerance, or SHR-2 for dual-drive protection.
- **Snapshot and replication.** Point-in-time snapshots of shared folders for instant file recovery. Replication to a remote NAS for offsite protection.
- **Built-in backup targets.** Works natively with Veeam as a backup repository. Also has Hyper Backup for replicating data to Backblaze B2.
- **Active Backup for Business.** Synology's own backup software for PCs, VMs, and M365. Free with the NAS hardware.
- **Surveillance Station.** If you need security cameras, the NAS doubles as an NVR.
- **10GbE upgrade path.** The DS925+ has an expansion slot for a 10GbE network card if you need more throughput down the road.

## "But what about a SAN for our VMs?"

If you're running a hypervisor cluster (Proxmox, Hyper-V, VMware) and need shared storage for live migration, you don't necessarily need a SAN. A Synology NAS with NFS or iSCSI can provide shared storage for a small VM cluster at a fraction of the cost.

Is it as fast as a dedicated SAN? No. But for a 2 to 3 host cluster running 10 to 15 VMs in a small business, the Synology is more than adequate. I've deployed this configuration many times and the performance is fine for typical office workloads.

If your VM workloads are genuinely I/O-intensive (large databases, heavy transactional processing), then yes, you might need something beefier. But that's unusual in a sub-50 employee business.

## When you need something more

A NAS stops being sufficient when:

- You're running 50+ VMs with demanding I/O profiles
- Database query performance is bottlenecked by storage
- You need sub-millisecond latency for financial or scientific applications
- You're running a Ceph or vSAN cluster that needs direct disk access

At that point, you're looking at a SAN or distributed storage solution. But you'll know when you need it because the NAS performance will be the obvious bottleneck. Don't buy a SAN because you think you might need one someday.

## What to do next

If you're not sure what storage setup fits your business, I can assess your current environment and recommend the right approach. Most of the time, the answer is simpler and cheaper than you expect.

Email me at chris@chrisputer.tech or visit [/services/](/services/) to get started.
