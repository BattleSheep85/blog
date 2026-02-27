+++
title = "Choosing a hypervisor for your small business"
date = 2025-11-28
description = "ESXi, Proxmox, Hyper-V, OpenShift, or bare metal? Here's a practical framework for picking the right hypervisor based on your team, budget, and workloads."
draft = false
tags = ['virtualization', 'small-business', 'vmware']
categories = ['Small Business IT']
+++

With VMware pricing pushing small businesses to re-evaluate, I'm getting this question every week: "What hypervisor should we use?" The answer depends on four things. Your team's expertise, your budget, what you're running, and how many hosts you have. Let me walk through a decision framework that cuts through the marketing noise.

<!--more-->

## The four factors

### 1. Team expertise

This is the most important factor and the one most people skip. A hypervisor is infrastructure. It needs to be installed, configured, patched, troubleshot, and maintained. If nobody on your team (or your consultant's team) can do that competently, the software doesn't matter.

- **Windows-heavy team, no Linux experience:** Hyper-V
- **Strong Linux skills, comfortable with CLI:** Proxmox or OKD
- **Kubernetes experience or willingness to learn:** OpenShift/OKD
- **Existing VMware expertise and budget to match:** VMware VCF

### 2. Budget

Let's be real about costs:

- **Proxmox VE:** Free. Optional support subscription $110 to $510 per socket per year.
- **Hyper-V:** "Free" if you're already paying for Windows Server Standard ($1,176 per 16-core pack). The Hyper-V role is included.
- **OKD:** Free. No licensing cost. Hardware and your time are the investment.
- **OpenShift (paid):** Starts around $30,000/year for a small cluster. Includes Red Hat support.
- **VMware VCF:** Varies widely, but SMBs are reporting $15,000 to $25,000+ per year for what used to cost $3,000 to $5,000.

### 3. Workload type

What are you actually running?

- **Pure Windows workloads** (AD, SQL Server, file shares, Windows LOB apps): Hyper-V is the natural fit. Same vendor, best integration, no extra licensing.
- **Mixed Windows and Linux VMs:** Any hypervisor handles this fine. Choose based on the other factors.
- **Containers and VMs:** OpenShift/OKD is purpose-built for this combination. Running Kubernetes alongside traditional VMs on a single platform eliminates infrastructure sprawl.
- **Simple VMs only:** Proxmox gives you the most capability for the least money.

### 4. Host count

This matters more than people think.

- **1 host:** Seriously consider bare metal. If you're running one server with one workload, a hypervisor adds complexity with minimal benefit. Install the OS directly on the hardware.
- **2 hosts:** Proxmox or Hyper-V. Simple cluster, basic HA, straightforward management.
- **3 to 4 hosts:** All options are on the table. Proxmox clusters nicely at this scale. Hyper-V with Failover Clustering works well. OKD becomes viable with a compact 3-node deployment.
- **5+ hosts:** OpenShift/OKD starts to shine here. The management overhead of Kubernetes is offset by the operational benefits of a unified platform.

## ESXi in 2026

Let me address the elephant in the room. VMware ESXi is still technically excellent. The hypervisor itself is rock solid. But the business model around it has changed dramatically.

There's no free ESXi tier anymore. The affordable Essentials Plus bundle is gone. The minimum buy-in is VCF, which includes a lot of features most small businesses don't need and a price tag that reflects it.

For new small business deployments in 2026, I can't justify recommending VMware unless the business has specific technical requirements that only VMware can meet (certain HCL-certified hardware configurations, specific ISV requirements, or existing deep VMware investment that makes migration more expensive than staying).

If you're already on VMware and your renewal isn't until 2027, you have time to plan. Use it.

## The "none of the above" option

Sometimes the right answer is no hypervisor at all. If you have:

- One physical server
- One primary workload (file server, or a single LOB application)
- No need for VM-level HA or snapshots

Just install Windows Server or Linux directly on the hardware. Bare metal is simpler, performs better (no hypervisor overhead), and has fewer things that can break. Not everything needs to be virtualized.

I see small businesses virtualize a single server just because "that's what you're supposed to do." If you're running one VM on one host, the hypervisor is adding complexity without adding value.

## My decision flowchart

Here's the quick version:

1. **One server, one workload?** Go bare metal.
2. **Windows-only shop, 2 to 4 hosts?** Hyper-V.
3. **Budget-conscious, Linux admin available?** Proxmox.
4. **5+ hosts, want containers and VMs, team can learn K8s?** OKD.
5. **Need enterprise support contract and containers?** OpenShift.
6. **Deep VMware investment, budget allows it?** Stay on VMware VCF.

## What to do next

The hypervisor decision affects everything else in your infrastructure: backup strategy, networking, storage, disaster recovery. Getting it wrong means an expensive re-migration later. I can evaluate your current environment, your team's skills, and your budget to recommend the right fit.

Email me at chris@chrisputer.tech or visit [/services/](/services/) to schedule a consultation.
