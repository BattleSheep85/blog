+++
title = "Windows Server 2025 licensing decoded"
date = 2025-11-26
description = "Windows Server 2025 licensing is confusing on purpose. Here's a plain-English breakdown of Standard vs Datacenter vs Essentials, what CALs cost, and the new pay-as-you-go option."
draft = false
tags = ['windows-server', 'licensing', 'small-business']
categories = ['Small Business IT']
+++

Microsoft licensing has always been confusing, and Windows Server 2025 keeps that tradition alive. There are three editions, two licensing models, and a new pay-as-you-go option that might or might not save you money. Let me break it down in plain English so you can figure out what you actually need to buy.

<!--more-->

## The three editions

**Windows Server 2025 Standard: $1,176 (16-core pack)**

This is what most small businesses need. Standard edition licenses the physical server based on core count, with a 16-core minimum. If your server has a 16-core CPU, one license covers it. If it has a 32-core CPU, you need two.

Standard gives you the right to run two virtual machines on that licensed host. If you need more VMs, you buy additional Standard licenses and stack them (each additional license grants two more VM rights).

**Windows Server 2025 Datacenter: $6,771 (16-core pack)**

Datacenter is the same software as Standard, but with unlimited VM rights per licensed host. If you're running 10 or more Windows VMs on a single host, Datacenter often works out cheaper than stacking Standard licenses.

Most small businesses with 1 to 3 hosts and a handful of VMs don't need Datacenter. The math usually favors Standard until you're running 8+ Windows VMs per host.

**Windows Server 2025 Essentials: OEM only, 25 users / 50 devices**

Essentials is the entry-level option, but it's only available through OEM channels (meaning you buy it pre-installed on a server from Dell, HPE, Lenovo, etc.). It supports up to 25 users and 50 devices with no CAL requirement.

If your office has 25 or fewer people and you're buying a new server, Essentials is the simplest and cheapest option. The limitations: no Hyper-V role (you can't run VMs), and you're capped at that 25-user mark.

## CALs: the licensing tax

Standard and Datacenter both require Client Access Licenses (CALs). Every user or device that accesses the server needs a CAL. There are two types:

- **User CAL: ~$44.** Covers one named user across all their devices. Best for offices where people use multiple devices.
- **Device CAL: ~$44.** Covers one device regardless of who uses it. Best for shared workstations or kiosks.

These are perpetual (buy once, use forever on that version), but you need new CALs when you move to a new server version. Your Windows Server 2022 CALs don't cover Windows Server 2025.

For a 20-person office, 20 User CALs cost about $880. Add that to your server license.

## The real cost for a 20-person office

Let me do the math for a typical scenario: one physical server running Windows Server 2025 Standard with 20 users.

| Item | Cost |
|------|------|
| Windows Server 2025 Standard (16-core) | $1,176 |
| 20 User CALs ($44 each) | $880 |
| **Total** | **~$2,056** |

That's a one-time cost for perpetual licenses. Not bad for what you get.

If you need a second server (domain controller, separate application server), add another $1,176 for the Standard license. The CALs cover you across all your servers since they're user-based.

## The new Pay-As-You-Go option

Windows Server 2025 introduces a Pay-As-You-Go (PAYG) model at $33.58 per physical core per month. For a 16-core server, that's $537.28 per month, or $6,447.36 per year.

Compare that to the perpetual license at $1,176 (plus ~$880 in CALs). PAYG breaks even in about 4 months. After that, you're paying more.

PAYG makes sense in specific scenarios:

- Short-term projects (spin up a server for 6 months, shut it down)
- Testing and development environments
- Situations where you can't get capital expenditure approval but can do operational expenditure

For a server you plan to run for 3 to 5 years? Buy the perpetual license. It's not even close.

## Hyper-V is NOT dead

There's been confusion about this, so let me be clear. Microsoft deprecated the free standalone Hyper-V Server SKU (the one that was just the hypervisor with no GUI). That product is gone.

The Hyper-V role within Windows Server is very much alive in Windows Server 2025. If you buy Standard or Datacenter, you can enable Hyper-V and run virtual machines just like always. Microsoft even added some new features to the Hyper-V role in 2025, including GPU partitioning and improved live migration.

So if someone tells you "Microsoft killed Hyper-V," they're wrong. They killed the free standalone product. The full feature set is still there in Windows Server.

## RDS and Remote Desktop CALs

If your users connect to the server via Remote Desktop (RDP) for running applications, you also need RDS CALs (Remote Desktop Services Client Access Licenses). These are separate from regular CALs and cost about $160 per user.

For a 20-person office using RDS: add $3,200 to your licensing costs. This is a common gotcha that catches people at audit time.

## My advice

For most 20-person offices buying a new server:

1. **Check if Essentials works** (25 users or fewer, no VMs needed, buying a new server). Simplest and cheapest.
2. **Standard + User CALs** if you need VMs, more than 25 users, or aren't buying OEM.
3. **Skip PAYG** unless it's a short-term deployment.
4. **Don't forget RDS CALs** if people remote into the server.
5. **Buy through a Microsoft partner** or reseller. You'll get better pricing than MSRP, especially on volume CAL packs.

## What to do next

Microsoft licensing is one of those things that seems straightforward until you get the audit letter. If you're buying a new server or upgrading from 2019/2022 and want to make sure you're licensed correctly without overspending, I can help.

Email me at chris@chrisputer.tech or check out [/services/](/services/).
