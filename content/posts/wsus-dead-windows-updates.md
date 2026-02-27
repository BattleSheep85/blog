+++
title = "WSUS is dead: how to handle Windows updates without it"
date = 2025-12-20
draft = false
description = "Microsoft deprecated WSUS in September 2024. Here's what to use instead for patching Windows machines in a small business, including free options."
tags = ['windows', 'updates', 'small-business', 'automation']
categories = ['Small Business IT']
+++

Microsoft officially deprecated WSUS (Windows Server Update Services) in September 2024. It's not getting new features, it's not getting improvements, and it's on the slow road to removal. If you're still running a WSUS server, it works today, but you're building on a dead-end platform.

The bigger problem is that most small businesses I work with either have a WSUS server nobody maintains, or they have no patch management at all. Machines just grab updates from Microsoft whenever Windows feels like it. Both approaches leave you exposed.

<!--more-->

## Why WSUS got killed

WSUS was designed in an era when every office had a Windows server, every PC was on the domain, and internet bandwidth was expensive. It made sense to download updates once and distribute them locally.

That world doesn't exist anymore. Remote workers, cloud-first environments, and laptops that spend more time off the network than on it made WSUS increasingly irrelevant. Microsoft had been neglecting it for years before making the deprecation official.

## Your replacement options

### Option 1: Windows Update for Business (free)

Windows Update for Business (WUfB) is built into Windows 10 Pro and Windows 11 Pro. You configure it through Group Policy or Intune, and machines pull updates directly from Microsoft's CDN.

What you can control:

- Deferral periods (delay feature updates up to 365 days, quality updates up to 30 days)
- Deadline enforcement (force restart after X days)
- Pause updates temporarily
- Choose between update channels (General Availability, preview)

For a small office of 10-30 PCs on the same network, this is genuinely the right answer. You set a Group Policy that defers feature updates by 60 days and quality updates by 7 days, set a restart deadline of 3 days, and you're done. Updates are tested by the broader Windows user base before they hit your machines, and they install on a predictable schedule.

**Cost:** Free. Built into Windows Pro.

### Option 2: Microsoft Intune

If you're already paying for M365 Business Premium ($22/user/month), you have Intune included. Intune gives you everything WUfB does, plus:

- Update compliance reporting (which machines are up to date, which aren't)
- Update rings (test group gets updates first, production gets them a week later)
- Expedited updates (push critical patches immediately)
- Windows Autopatch (automated update management, requires specific licensing)

Intune is the natural choice if you're already in the M365 ecosystem and want a management console instead of Group Policy. The reporting alone is worth it because you can actually prove that your machines are patched, which matters for compliance and cyber insurance.

**Cost:** Included with Business Premium, or $8/user/month standalone.

### Option 3: Action1 (free for up to 200 endpoints)

Action1 is a cloud-based patch management tool that handles Windows updates, plus third-party application patching. This is the option I recommend most often for small businesses that don't have M365 Premium.

Why Action1 stands out:

- Free for up to 200 endpoints (that covers most small businesses entirely)
- Patches third-party apps (Chrome, Zoom, Adobe, 7-Zip, and hundreds more)
- Cloud console, no on-prem server needed
- Compliance reporting
- Remote script execution

**Cost:** Free for up to 200 endpoints. Paid plans start at $3/endpoint/month.

### Option 4: Other third-party tools

- **NinjaOne:** Full RMM platform with patch management. Excellent, but priced for MSPs.
- **PDQ Deploy + PDQ Inventory:** Great for on-prem environments, but requires a Windows server. Starts at about $500/year.
- **Automox:** Cloud-native, cross-platform patching. Around $4/endpoint/month.

## The critical gap: third-party patching

Here's something most people miss. Windows Update (and WUfB, and even basic Intune) only patches Windows and Microsoft products. It does not patch:

- Google Chrome
- Mozilla Firefox
- Zoom
- Adobe Acrobat Reader
- 7-Zip
- Java
- Any other third-party application

These applications have their own vulnerabilities, and attackers exploit them constantly. Chrome alone had 8 zero-day vulnerabilities patched in 2024. If you're only patching Windows, you're leaving the front door locked while the side window is wide open.

This is why I push Action1 or a similar tool that handles third-party patching. Windows updates are table stakes. Third-party patching is where most small businesses have the biggest gap.

## My recommendation by company size

**Under 10 PCs, no IT staff:** WUfB via Group Policy, plus enable auto-updates in Chrome, Firefox, and Adobe. It's not perfect, but it's free and gets you 80% of the way there.

**10-50 PCs, part-time IT or MSP:** Action1 free tier. Covers Windows and third-party patching, gives you reporting, and costs nothing up to 200 endpoints.

**50+ PCs or compliance requirements:** Intune (if on M365 Premium) or NinjaOne/Automox for cross-platform management and audit-ready reporting.

## What to do next

If you're still running WSUS, or worse, running nothing at all, it's time to put a real patching strategy in place. I can help you evaluate the right tool for your environment and get it configured properly.

Reach out at chris@chrisputer.tech or visit [my services page](/services/) to get started.
