+++
title = "OpenShift and OKD for VMware refugees: an honest assessment"
date = 2025-11-22
description = "OpenShift Virtualization runs VMs and containers on the same platform. OKD is the free upstream. Here's when it makes sense as a VMware replacement and when it doesn't."
draft = false
tags = ['openshift', 'okd', 'vmware', 'virtualization']
categories = ['Small Business IT']
+++

With VMware pricing going through the roof post-Broadcom, a lot of businesses are asking "what else is out there?" One option that doesn't get enough attention in the SMB space is OpenShift, specifically its virtualization capabilities. I know what you're thinking: "Kubernetes? For my small business?" Hear me out, because the technology has matured a lot, and there's a free version.

<!--more-->

## What OpenShift Virtualization actually is

OpenShift is Red Hat's Kubernetes platform. You probably know it for running containers. What you might not know is that OpenShift Virtualization (built on KubeVirt) lets you run traditional VMs alongside containers on the same cluster.

That means your Windows Server VM, your Linux file server, and your containerized web application can all run on the same infrastructure, managed through the same interface. You're not choosing between VMs and containers. You get both.

The VM experience is surprisingly polished. You can run Windows VMs with VirtIO drivers, do live migration between hosts, attach persistent storage, and manage networking just like you would on any other hypervisor. It's not a toy.

## OKD: the free version

OKD is the community upstream of OpenShift. Think of the relationship like CentOS Stream to Red Hat Enterprise Linux, or Fedora to RHEL. Same codebase, same features, no licensing cost.

OKD is licensed under Apache 2.0. You can run it in production. You can modify it. You don't owe anyone a dime. The tradeoff is that you don't get Red Hat support, and updates move faster (which means more testing on your end).

Red Hat OpenShift (the paid product) adds:

- Commercial support with SLAs
- Longer lifecycle and stability guarantees
- Certified operators and partner integrations
- Automated cluster updates with rollback

For a small business, OKD is a legitimate option if you have Linux and Kubernetes experience on your team (or your consultant does). For businesses that need a support contract for compliance or peace of mind, OpenShift licensing starts around $30,000 per year for a small cluster, still potentially cheaper than VMware VCF.

## When OpenShift/OKD makes sense

This platform is a good fit when:

- **You have 5 or more hosts.** The Kubernetes overhead (control plane nodes) makes less sense on 1 to 2 servers. At 5+ hosts, the management benefits start paying for themselves.
- **You run a mix of VMs and containers.** If you're already containerizing some workloads or plan to, running both on one platform eliminates the need for separate infrastructure.
- **Your team is willing to learn Kubernetes.** This is the big one. Kubernetes has a learning curve. It's not vCenter. But if your team is technically curious and willing to invest in the skillset, the long-term benefits are significant.
- **You want to future-proof.** The industry is moving toward Kubernetes. VMs aren't going away, but the management plane is increasingly Kubernetes-native. Getting on this train now means you're not migrating again in five years.

## When it doesn't make sense

I'm not going to pretend this is the right answer for everyone. OpenShift/OKD is a poor fit when:

- **You have 1 to 2 hosts.** The Kubernetes control plane needs 3 nodes minimum for high availability (or a compact 3-node cluster where masters also run workloads). If you only have one or two servers, Proxmox or Hyper-V is a much simpler answer.
- **You have zero Linux or Kubernetes experience.** Deploying and managing OKD requires solid Linux fundamentals and a willingness to learn kubectl, YAML manifests, and Kubernetes networking concepts. If your entire team is Windows-only, the learning investment is steep.
- **You're a pure Windows shop.** Windows VMs run fine on OpenShift Virtualization, but the platform itself is Linux. If nobody on your team touches Linux, the day-to-day management will be painful.
- **You need it running next week.** A proper OpenShift/OKD deployment takes planning. Network design, storage backend selection, DNS configuration, certificate management. This isn't a "download the ISO and click next" situation.

## The migration path from VMware

If you're coming from VMware, the migration typically looks like this:

1. **Deploy an OKD or OpenShift cluster** on new or existing hardware. Bare metal is preferred for best VM performance.
2. **Use MTV (Migration Toolkit for Virtualization)** to migrate VMs from vSphere to OpenShift Virtualization. This tool handles the conversion of VMDKs to appropriate disk images and preserves VM configurations.
3. **Test migrated VMs** in the new environment. Networking, storage, application functionality.
4. **Cut over** once testing is complete.

The MTV tool makes this less painful than it sounds, but plan for a few weeks of testing for any environment with more than a handful of VMs.

## My honest opinion

I recommend OpenShift/OKD over Proxmox for production SMB environments that have the technical chops to support it. The platform is more capable, the ecosystem is larger, and the convergence of VMs and containers on a single platform is genuinely valuable.

But I'm not going to recommend it to a 15-person accounting firm with no Linux experience and two servers. That's a Proxmox or Hyper-V job. Right tool for the right situation.

## What to do next

If you're evaluating VMware alternatives and want to know whether OpenShift or OKD fits your environment, I can help you assess the technical requirements, skill gaps, and migration path. This is one of those decisions where getting it right the first time saves you a lot of pain.

Email me at chris@chrisputer.tech or visit [/services/](/services/) to talk it through.
