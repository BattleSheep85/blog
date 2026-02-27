+++
title = "VMware after Broadcom: what it means for your small business"
date = 2025-11-20
description = "Broadcom killed VMware's affordable SMB products, forced subscription licensing, and pushed price increases of 350% or more. Here's what happened and what to do about it."
draft = false
tags = ['vmware', 'virtualization', 'small-business']
categories = ['Small Business IT']
+++

If you're running VMware in your small business, you've probably already felt the pain. Broadcom completed their acquisition of VMware in late 2023 and immediately started making changes that hit small businesses the hardest. Perpetual licenses are gone. The affordable SMB products are discontinued. And the bills are going up, way up.

<!--more-->

## What Broadcom did

Let me walk through the major changes, because the details matter:

**Killed perpetual licenses.** Before Broadcom, you could buy a VMware vSphere license once and use it forever, paying only for optional support renewals. That model is dead. Everything is subscription-only now. When your current support contract expires, you're on the new pricing.

**Discontinued vSphere Essentials Plus.** This was THE VMware product for small businesses. It covered three hosts with vCenter included for a few thousand dollars. It was affordable, it was capable, and it was the reason most 10 to 50 person businesses ran VMware. Broadcom killed it. The replacement is VMware Cloud Foundation (VCF), which bundles everything into a single product at a much higher price point.

**Imposed 16-core minimums per CPU.** Even if your server has an 8-core processor, you're paying for 16 cores. This effectively doubled the licensing cost for many small business servers that were running perfectly fine on lower core counts.

**20% penalty for missed renewal dates.** If your subscription lapses and you want to come back, Broadcom tacks on a 20% surcharge. This is the kind of policy designed to lock you in and punish you for even thinking about leaving.

## The price impact

The numbers coming out of the SMB space are brutal:

- Most small businesses report **350 to 450% cost increases** over their previous VMware licensing.
- Some businesses with specific configurations are seeing **1,000% or higher** increases.
- A setup that cost $3,000 to $5,000 per year under Essentials Plus can now run $15,000 to $25,000 per year under VCF.

For a 20-person business running three VMware hosts, that kind of increase is hard to swallow. For many, it's simply not justifiable.

## The vSphere 8 deadline

Here's the timeline pressure: VMware vSphere 8 reaches End of General Support in **October 2027**. After that, no security patches, no bug fixes, no support.

If you're currently running vSphere 8 with an existing perpetual license, you can keep running it, but the clock is ticking. Once it goes end-of-life, you're running unsupported software. For businesses with any compliance requirements (and that's most of them), that's a non-starter.

Your options at that point are:

1. **Migrate to VCF 9** and accept the new pricing.
2. **Move to a different hypervisor** (Proxmox, Hyper-V, OpenShift/OKD, or others).
3. **Move workloads to the cloud** (Azure, AWS).
4. **Stay on unsupported vSphere 8** and accept the risk.

## Who should stay on VMware

Despite everything, VMware is still excellent technology. If you have:

- A dedicated VMware admin or team
- A large enough environment to justify the cost
- Specific features you depend on (vSAN, NSX, DRS)
- Compliance requirements that mandate enterprise-supported software

Then VCF might still be the right choice. The product didn't get worse. The price did.

## Who should leave

If you're a small business with 1 to 3 hosts, a few VMs, and no dedicated VMware admin, the math probably doesn't work anymore. You were using VMware because Essentials Plus was affordable and easy. With that option gone, there are better fits for your budget.

Options worth evaluating:

- **Proxmox VE:** Free, open-source, KVM-based. Great for simple environments with Linux expertise. See my honest take on Proxmox for production.
- **OpenShift/OKD:** If you're ready to modernize and run containers alongside VMs. Better for forward-looking shops with 5+ hosts.
- **Hyper-V:** Still available as a role in Windows Server 2025. If you're already paying for Windows Server licensing, it's included.
- **Cloud migration:** Move everything to Azure or AWS. Makes sense for some, overkill for others.

## What I tell clients

Don't panic, but don't wait until October 2027 either. Start planning now. The migration from VMware to any other platform takes months of preparation, testing, and execution. Doing it under deadline pressure is how things break.

Here's my general framework:

1. **Inventory everything.** What VMs are you running? What do they depend on? What's their resource usage?
2. **Calculate your current and projected VMware costs.** Get a real quote from your reseller for VCF.
3. **Evaluate alternatives** against your specific workloads, your team's skills, and your budget.
4. **Build a migration timeline** that gives you plenty of room for testing.

## What to do next

If you're staring at a VMware renewal quote that made your eyes water, let's talk. I can assess your current environment, compare the real costs of staying versus migrating, and help you pick the right path forward.

Email me at chris@chrisputer.tech or visit [/services/](/services/) to get started.
