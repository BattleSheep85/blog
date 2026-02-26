+++
title = "What to do when your Kansas business gets a cyber insurance questionnaire"
date = 2026-02-26T10:30:00-06:00
draft = false
tags = ['cybersecurity', 'insurance', 'small-business', 'wichita', 'compliance']
categories = ['Small Business IT']
description = "Got a cyber insurance questionnaire and don't know how to answer it? Here's what the questions actually mean and how to avoid the mistakes that get Wichita businesses denied coverage."
+++

You're renewing your business insurance and the carrier sends over a "cyber liability supplemental questionnaire." Twenty pages of questions about multi-factor authentication, endpoint detection and response, privileged access management, and network segmentation. You run a dental office in Wichita with twelve employees and one IT closet. You have no idea what half of this means.

You're not alone. I get calls about these questionnaires all the time from small businesses around the Wichita area. Here's how to handle it without panicking or lying on the form.

<!--more-->

## Why these questionnaires exist

Insurance carriers started losing money on cyber claims. Ransomware hit small businesses hard -- dental offices, law firms, school districts, small manufacturers. The carriers realized they were insuring networks they'd never inspected, so now they're asking questions before writing policies.

The questionnaires are essentially an IT audit in checkbox form. The carrier wants to know if you have basic security controls in place. If you don't, they'll either raise your premium, add exclusions, or decline coverage entirely.

## The questions that trip up small businesses

### "Do you require multi-factor authentication for all remote access?"

This is asking: when someone logs in from outside the office (VPN, email, cloud apps), do they need something beyond a password? A text code, an authenticator app, a hardware key?

If your employees access Microsoft 365 email from home with just a password, the answer is no. And that's a problem. MFA is the single control most carriers care about. Some will decline coverage outright if you don't have it.

The fix is straightforward. Microsoft 365 has MFA built in. Turning it on takes an afternoon, and the disruption is a few days of employees grumbling about the extra step. After that it's invisible.

### "Do you use endpoint detection and response (EDR)?"

They're asking if you have antivirus that actually works. Not the free Windows Defender (though Defender has gotten better), but something that actively monitors for suspicious behavior and can isolate a compromised machine.

If you don't know whether you have EDR, you probably don't. Options like SentinelOne, CrowdStrike, or Microsoft Defender for Business work well for small offices and cost $3-8/device/month.

### "Do you perform regular backups and are they stored offline?"

They want to know two things: are you backing up, and can ransomware reach your backups? If your only backup is a USB drive plugged into the server 24/7, ransomware will encrypt that too. If your backups are only in the cloud with the same credentials as everything else, same problem.

A good backup strategy for a small office: automated daily backups to a cloud service that uses separate credentials, with at least 30 days of retention. Test the restore process at least once a year.

### "Do you have a written incident response plan?"

This one sounds more intimidating than it is. They want to know: if something bad happens, does someone know what to do? Who to call, what to disconnect, how to notify affected parties.

For a small business, this doesn't need to be a 50-page document. A two-page plan that says "if we think we've been hacked, call [IT person], disconnect affected computers from the network, don't turn anything off, and contact our insurance carrier" covers the basics.

### "Do you perform vulnerability scanning?"

They're asking if anyone periodically checks your network for known security holes. Unpatched software, open ports, default passwords on devices, that kind of thing.

Most small businesses have never had a vulnerability scan. It's not difficult or expensive to do -- it just hasn't been on anyone's radar.

## The biggest mistake: guessing

I've seen business owners check "yes" on questions they don't understand because they assume their IT person or MSP is handling it. Then a breach happens, the carrier investigates, and discovers that MFA was never turned on, or the "backups" were just a folder on the same server that got encrypted.

If the questionnaire doesn't match reality, the carrier can deny your claim. Answer honestly. If the honest answer is "no" or "I don't know," that's what you need to fix, not what you need to hide.

## How to get your answers to "yes" honestly

Most of the controls these questionnaires ask about are achievable for a small business without a massive budget:

- MFA on Microsoft 365 and VPN: free to enable, takes a few hours
- EDR/antivirus: $3-8/device/month
- Offsite backups: $50-200/month depending on data volume
- Vulnerability scan: a few hundred dollars, done quarterly or annually
- Incident response plan: a few hours to write
- Firewall that's not a home router: $300-800 one-time for the hardware

The total cost of getting to "yes" on the important questions is almost always less than the premium increase or claim denial from answering "no."

## What to do next

If you've got one of these questionnaires sitting on your desk and you're not sure how to answer it, I can help. I work with small businesses in Wichita and Sedgwick County. I'll go through the questionnaire with you and give you an honest assessment of where you stand and what needs fixing. No scare tactics, just the facts.

**Email me at chris@chrisputer.tech** or visit my [services page](/services/).
