+++
title = "Zero trust on a small business budget"
date = 2025-10-01
draft = false
tags = ['zero-trust', 'cybersecurity', 'small-business', 'networking']
categories = ['Small Business IT']
description = "Zero trust isn't just for enterprises. Here's how small businesses can adopt zero trust principles without a massive budget, starting with what you probably already have."
+++

"Zero trust" sounds like an enterprise buzzword, and the way most vendors talk about it, that's exactly what it is. They want to sell you a platform with a six-figure price tag that takes a team of engineers to deploy. That's not what this post is about.

Zero trust is a set of principles, not a product. And most of those principles can be applied to a small business network with tools that cost little or nothing. About 60% of organizations were embracing zero trust principles by 2025, but only about 10% expect to have a mature implementation by 2026. The gap is mostly about execution, not budget.

<!--more-->

## What zero trust actually means

The old model of network security was "castle and moat." Everything inside the network is trusted. Everything outside is not. Your firewall is the moat. Once you're past it, you can access anything.

Zero trust flips that. Nothing is trusted by default, regardless of where it is. Every access request is verified, every session is monitored, and every user only gets access to what they specifically need. The assumption is that a breach has already happened and you're limiting the damage.

For a small business, this sounds academic. But the principles translate into very practical decisions.

## Why it matters for small businesses

Organizations with a mature zero trust implementation see breach costs about $1 million lower than those without. That's across all organization sizes. For a small business where a breach might be a survival event, the impact is proportionally even larger.

The traditional small business network is the opposite of zero trust. Everyone is on the same flat network. The office manager, the security cameras, the guest Wi-Fi, and the server are all on the same subnet. One compromised device has line-of-sight to everything else. That's the layout ransomware is designed to exploit.

## How to start (without spending a fortune)

You don't implement zero trust all at once. You start with the highest-impact changes and build from there. Here's a realistic roadmap for a small business.

### 1. MFA everywhere

This is step one of any zero trust approach. Every account that can be accessed remotely needs multi-factor authentication. Microsoft 365, VPN, cloud apps, remote desktop, anything that accepts a login from the internet.

**Cost:** Free. It's included in Microsoft 365, Google Workspace, and most SaaS platforms.

I covered this in detail in my [MFA post](/posts/mfa-compromised-accounts/). If you haven't done this yet, start here before anything else.

### 2. Least privilege access

Every user should have the minimum access they need to do their job. The receptionist doesn't need access to the financial share. The warehouse staff don't need domain admin rights. Your personal email account should not be a Global Admin on your Microsoft 365 tenant.

This one is free and it's the principle most small businesses violate most often. When something is hard to access, someone gives everyone admin rights "to make it easier." That convenience is the thing an attacker exploits.

**How to do it:** Audit your Microsoft 365 admin roles. Check who has access to file shares and cloud storage. Review who has admin access to your line-of-business applications. Remove access that isn't needed for someone's actual job. This is an afternoon of work, not a project.

### 3. Device trust

Zero trust says you shouldn't just verify the user, you should verify the device. Is it managed? Is it patched? Does it have endpoint protection?

For small businesses on Microsoft 365 Business Premium, this is built into Conditional Access and Microsoft Intune. You can create policies that only allow access from devices that meet your security requirements (enrolled in management, current on updates, running EDR).

**Cost:** Included in Microsoft 365 Business Premium ($22/user/month). If you're already on this plan, you're paying for it and not using it.

For businesses not on Business Premium, you can still make progress here. Require that all work computers run current Windows updates and have endpoint protection installed. Block personal devices from accessing company data unless they meet minimum requirements.

### 4. Network segmentation

This is the one that requires actual networking work, but it makes the biggest difference for preventing lateral movement (an attacker going from one compromised device to everything else on the network).

At minimum, separate these into different network segments:

- **Employee workstations** on their own VLAN
- **Servers and infrastructure** on a separate VLAN
- **IoT devices** (cameras, printers, badge readers) on a separate VLAN
- **Guest Wi-Fi** on its own VLAN with internet-only access

A decent managed switch and a proper firewall can handle this. If you have a MikroTik or UniFi setup, VLANs are straightforward to configure. Even a pfSense box can handle VLAN routing for a small office.

**Cost:** If you already have a managed switch and a real firewall, the cost is configuration time. If you need hardware, a MikroTik switch runs $50-200 and a pfSense or MikroTik router capable of inter-VLAN routing starts around $100-300.

### 5. Micro-segmentation for critical assets

Once you have basic VLANs in place, you can get more granular. Your server that holds financial data shouldn't accept connections from every workstation. Your backup server should only be accessible from the management VLAN.

Firewall rules between VLANs let you restrict traffic so that compromising one device doesn't give access to everything. The accounting workstation can reach the accounting server but not the domain controller directly. The security cameras can reach the NVR but nothing else.

This takes more planning and testing, but it dramatically limits what an attacker can do after getting initial access.

### 6. Verify, then keep verifying

Zero trust isn't a one-time setup. It's ongoing. Review access quarterly. Check audit logs for anomalies. Make sure MFA is still enforced (people find ways to get exceptions). Confirm that network segmentation rules haven't been relaxed for troubleshooting and left that way.

Set a calendar reminder to review these things quarterly. It takes an hour. It's worth it.

## What this looks like when it's done

A small business with zero trust principles applied doesn't look dramatically different from the outside. People log in with MFA. They access what they need. The network works.

The difference is underneath. When (not if) someone's credentials get stolen, the attacker hits MFA and stops. If malware gets onto a workstation, it can't reach the server because the network is segmented. If someone's account gets compromised, the damage is limited to what that account had access to, which isn't much because you applied least privilege.

None of this required a vendor platform or a dedicated security team. It required intention.

## What to do next

If you want to start applying zero trust principles to your small business but aren't sure where to begin, I can help. I work with businesses in the Wichita area on network design, Microsoft 365 security, and practical implementations that actually get finished. Not a 200-page framework. Just security that works.

**Email me at chris@chrisputer.tech** or check out my [services page](/services/).
