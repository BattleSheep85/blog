+++
title = "Windows 10 is dead: here's your upgrade plan"
date = 2026-01-01
draft = false
description = "Windows 10 reached end of life on October 14, 2025. No more security updates. Here's what to do about it, including the math on extended support vs replacement."
tags = ['windows', 'small-business', 'security']
categories = ['Small Business IT']
+++

Windows 10 reached end of life on October 14, 2025. That means no more security updates, no more bug fixes, and no more patches for newly discovered vulnerabilities. Every Windows 10 machine in your office is now a growing security liability, and it gets worse with every month that passes.

If you're reading this in 2026 and still running Windows 10, here's your upgrade plan.

<!--more-->

## What "end of life" actually means

When Microsoft ends support for an operating system, they stop releasing security patches. That's the critical piece. New vulnerabilities are discovered in Windows constantly. After October 2025, Microsoft is no longer fixing them for Windows 10.

This matters because:

- Every new vulnerability in Windows 10 is now permanent. Attackers know the holes will never be patched.
- Cyber insurance policies are starting to exclude claims involving unsupported operating systems.
- Compliance frameworks (HIPAA, PCI-DSS, CMMC) require supported software. Running Windows 10 puts you out of compliance.
- Eventually, third-party software will stop supporting Windows 10 too. Chrome, Office, antivirus products: they'll all drop Windows 10 support over the next 1-2 years.

## Option 1: Upgrade to Windows 11 (free, if hardware qualifies)

The upgrade from Windows 10 to Windows 11 is free. Microsoft provides the upgrade through Windows Update if your hardware meets the requirements. The key hardware requirement that trips people up is TPM 2.0.

**Windows 11 requirements:**
- 1 GHz+ processor with 2+ cores (64-bit)
- 4GB RAM (8GB+ recommended for real-world use)
- 64GB storage
- TPM 2.0
- UEFI firmware with Secure Boot
- DirectX 12 compatible graphics

**TPM 2.0 is the gatekeeper.** Most PCs built after 2018 have it. Many PCs from 2016-2017 have it too, but it might be disabled in BIOS/UEFI. Check by pressing Win+R, typing `tpm.msc`, and hitting Enter. If it says "TPM 2.0" under Specification Version, you're good.

**The upgrade process:**
1. Back up everything first (seriously)
2. Go to Settings > Update & Security > Windows Update
3. If Windows 11 is available, it'll show as an optional update
4. Click download and install
5. The process takes 30-60 minutes per machine

For PCs that qualify, this is the obvious first choice. Free, straightforward, and keeps you on supported software.

## Option 2: Extended Security Updates (ESU) - buy time

Microsoft offers Extended Security Updates for Windows 10 through the ESU program. This gives you continued security patches for Windows 10, but at a cost that escalates every year:

- Year 1 (Oct 2025 - Oct 2026): $61 per device
- Year 2 (Oct 2026 - Oct 2027): $122 per device
- Year 3 (Oct 2027 - Oct 2028): $244 per device

That's $427 per device over three years. For a single PC that can't run Windows 11, buying one year of ESU while you plan a replacement makes sense. For a fleet of machines, the math gets ugly fast.

**The real cost for a small office:**
10 PCs x 2 years of ESU = 10 x ($61 + $122) = $1,830

For that same $1,830, you could buy 1-2 new PCs that ship with Windows 11 and start rotating out the oldest machines. Which brings us to option 3.

## Option 3: Replace the hardware

If the PC doesn't have TPM 2.0 and can't be upgraded, it's time to replace it. A decent business-class desktop (Dell OptiPlex, HP ProDesk, Lenovo ThinkCentre) runs $500-800. A business laptop (Dell Latitude, HP EliteBook, Lenovo ThinkPad) runs $700-1,200.

These machines ship with Windows 11, have TPM 2.0, come with a 3-year warranty, and will be supported through the entire Windows 11 lifecycle (expected through at least 2032).

**Budget approach: stagger replacements.** You don't have to replace everything at once. Replace the oldest 25% of your fleet each year. After four years, everything is current, and the cost is spread out.

## How to make the decision for each PC

Here's the flowchart I use with every client:

1. **Does it have TPM 2.0?** If yes, upgrade to Windows 11 for free. Done.
2. **No TPM 2.0, but hardware is otherwise fine?** Check the BIOS. TPM might be disabled. Some PCs (especially Dells) ship with the TPM turned off by default. Enable it and try the upgrade again.
3. **No TPM 2.0, can't enable it?** How old is the PC? If it's 5+ years old, replace it. If it's 3-4 years old and otherwise healthy, buy one year of ESU to bridge the gap while you budget for a replacement.
4. **Custom hardware or specialized equipment?** Some PCs run specific software (medical devices, manufacturing, CNC machines) that can't be upgraded easily. These need ESU and a careful migration plan.

## The bypass trick (and why I don't recommend it)

Yes, you can bypass the TPM 2.0 requirement and force-install Windows 11 on unsupported hardware. Microsoft even documented how to do it via registry edits. But:

- Microsoft says they "won't guarantee" updates on unsupported hardware
- Some updates have failed to install on bypassed machines
- You won't get the full security benefit of TPM-backed features like BitLocker and Windows Hello
- If something breaks, you're on your own

For a home PC, maybe. For a business PC that you depend on, I wouldn't risk it.

## The action plan

1. **This week:** Inventory every PC. Check Windows version and TPM status on each one. A simple PowerShell one-liner: `Get-CimInstance -ClassName Win32_Tpm -Namespace "root\cimv2\Security\MicrosoftTpm"` will tell you the TPM version.
2. **This month:** Upgrade every TPM 2.0 machine to Windows 11.
3. **This quarter:** Replace or ESU the remaining Windows 10 machines.
4. **Ongoing:** Budget for replacing 20-25% of your PC fleet each year so you never face this cliff again.

## What to do next

If you're not sure where your PCs stand or need help planning the migration, I can do an inventory and give you a clear upgrade plan with costs. No surprises, just a list of what needs to happen and when.

Reach out at chris@chrisputer.tech or visit [my services page](/services/) to get started.
