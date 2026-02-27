+++
title = "Your cyber insurance application is now an audit"
date = 2025-09-11
draft = false
tags = ['insurance', 'cybersecurity', 'compliance', 'small-business']
categories = ['Small Business IT']
description = "Cyber insurance applications have become full technical audits. Carriers are scanning networks, demanding MFA proof, and rejecting 1 in 4 claims. Here's what small businesses need to know before renewal."
+++

Five years ago, getting cyber insurance was a one-page form. Check some boxes, pay the premium, done. That era is over. The cyber insurance market hit $16.3 billion in 2025, and carriers lost enough money on claims that they completely changed how they underwrite policies. Your application is now an audit.

I help small businesses in the Wichita area get through these applications, and the gap between what carriers expect and what most small businesses have in place is significant. But it's fixable.

<!--more-->

## What changed

Ransomware and BEC claims hammered the insurance industry for several years straight. Carriers figured out they were writing policies for businesses that had no meaningful security controls. So they raised the bar.

Premiums actually dropped about 6% in 2025 as competition increased and some loss ratios improved. But don't get comfortable. Industry analysts are forecasting 15-20% premium increases in 2026, driven by the surge in ransomware and the growing sophistication of attacks.

Here's the number that matters most to small businesses: only about 10% of small and mid-size enterprises have cyber insurance, compared to 80% of large corporations. That gap means most small businesses either haven't dealt with these new requirements yet, or they tried and got sticker shock.

## It's not a questionnaire anymore

The old questionnaires asked things like "Do you have a firewall?" and "Do you back up your data?" and took your word for it.

The new process looks more like this:

**Technical scanning before binding.** Many carriers now run external vulnerability scans on your network before they'll write a policy. They're checking for exposed RDP, unpatched VPN appliances, missing email authentication records, and known vulnerabilities. If they find problems, you fix them before you get coverage.

**Detailed evidence requirements.** "Do you have MFA?" isn't enough anymore. Some carriers want screenshots of your MFA configuration, logs showing it's enforced, or attestation from your IT provider. They've been burned by businesses that checked "yes" and didn't actually have it.

**Continuous monitoring.** Some carriers partner with security rating firms to continuously monitor your external attack surface throughout the policy period. If your security posture degrades, they'll notify you and may adjust terms at renewal.

## Why claims get rejected

About one in four cyber insurance claims gets rejected for failing to meet policy requirements. The most common reasons I've seen:

**MFA wasn't actually enforced.** The business said they had MFA on the application, but when the breach happened, the compromised account didn't have it enabled. Maybe it was turned on for some users but not all, or it was configured but not enforced.

**Backups were connected to the network.** The application said backups were "offsite," but they were on a NAS that was accessible from the same network the ransomware encrypted. The carrier calls that on-site.

**Incident response was delayed.** The policy required notification within 24-72 hours. The business didn't realize they'd been breached for weeks, or they tried to handle it internally before calling the carrier.

**Security controls lapsed.** The EDR subscription expired. The firewall firmware hadn't been updated since installation. The former IT guy set things up and nobody maintained them.

## What carriers want to see

The specific requirements vary, but here's what's showing up on nearly every application I work through:

**MFA on everything remote-accessible.** Email, VPN, RDP, cloud applications. This is non-negotiable for most carriers. Some will decline coverage outright without it.

**Endpoint detection and response.** Not just antivirus. EDR that actively monitors for suspicious behavior and can isolate compromised machines.

**Tested backups with offline or immutable storage.** They want to know ransomware can't reach your backups, and they want proof you've tested restoring from them.

**Email security.** SPF, DKIM, and DMARC configured. Anti-phishing policies enabled. Many carriers now check these directly.

**Patch management.** A process for keeping systems and software updated, especially internet-facing devices like firewalls and VPN appliances.

**Incident response plan.** A documented plan that includes who to contact (including the carrier), containment steps, and communication procedures.

**Security awareness training.** Evidence that employees receive regular training on phishing and social engineering.

## How to get ready for your renewal

If your renewal is coming up, or you've been meaning to get cyber insurance but haven't started, here's the practical path:

**Start with MFA.** If you're on Microsoft 365, you can enable MFA for all users in an afternoon. This single control satisfies the requirement carriers care most about.

**Get your email authentication set up.** SPF, DKIM, and DMARC are DNS records that take an hour to configure properly. Carriers are checking these now.

**Deploy EDR.** Microsoft Defender for Business is $3/user/month and is usually sufficient for small businesses. SentinelOne and CrowdStrike are solid alternatives.

**Fix your backups.** Make sure they're automated, they go to a location that ransomware can't reach (cloud with separate credentials, or immutable storage), and test a restore at least once.

**Document what you have.** Carriers want to see evidence. Screenshot your MFA enforcement settings. Keep records of your backup test results. Save your training completion reports. Having this documentation ready makes the application process much smoother.

## The cost of getting it right vs. getting denied

Here's the math. Getting your security controls to a point where carriers are happy to write your policy costs most small businesses somewhere between $500 and $2,000 per month for the tools (EDR, backups, email security), plus some one-time setup costs. The alternative is either paying significantly higher premiums, getting coverage with exclusions that gut the policy, or having a claim denied when you need it most.

## What to do next

If you've got a cyber insurance application or renewal coming up and you're not sure where you stand, I can help. I work with small businesses around Wichita to assess their current security posture, close the gaps carriers care about, and get through the application process honestly. No BS, no scare tactics. Just get you to the point where your answers are true and your coverage is solid.

**Email me at chris@chrisputer.tech** or check out my [services page](/services/).
