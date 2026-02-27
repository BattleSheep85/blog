+++
title = "Business email compromise: the $90,000 email"
date = 2025-09-07
draft = false
tags = ['email', 'cybersecurity', 'small-business', 'phishing']
categories = ['Small Business IT']
description = "Business email compromise accounted for 73% of all reported cyber incidents in 2024. Here's how these attacks work, what they look like, and how to stop them before someone wires money to the wrong account."
+++

A construction company I know got an email from their concrete supplier. The invoice looked exactly right. Same logo, same formatting, same contact name. The only difference was the bank routing number at the bottom. Someone in accounting paid it. $90,000 went to a bank account in another state and was gone before anyone noticed.

That's business email compromise, or BEC. It's not the kind of attack that makes headlines, but it's responsible for more financial damage to small businesses than ransomware.

<!--more-->

## How big is the problem

BEC accounted for 73% of all reported cyber incidents in 2024, and those numbers climbed another 15% in 2025. Small and mid-size businesses get hit disproportionately hard. One study found that SMBs receive 350% more social engineering attacks per employee than large enterprises.

The reason is simple: big companies have email filtering, security awareness training, and approval processes for payments. Small businesses have Janet in accounting who trusts an email because it looks like it came from the boss.

## How these attacks actually work

There are a few common patterns, and once you see them, you'll start to recognize them everywhere.

### The gift card scam

An employee gets an email that appears to come from the company owner or CEO. "Hey, I need you to grab some gift cards for a client meeting. Get 5 Amazon cards, $200 each, and send me the codes. I'll reimburse you." The email comes from a look-alike domain (maybe chrisputer.com instead of chrisputer.tech, or with one letter swapped) or from a compromised personal email account.

This one sounds stupid, but it works constantly. The amounts are small enough that people don't question it. By the time anyone figures it out, the gift card codes have been redeemed.

### The invoice redirect

This is the $90,000 example. The attacker either compromises your vendor's email account or creates a convincing fake. They send an invoice that matches a real transaction, but with updated payment details. "We've changed banks, please use these new wire instructions."

Sometimes the attacker has been sitting in your email (or your vendor's email) for weeks, reading conversations, learning who approves payments, understanding the cadence of invoices. They time the fake invoice to land exactly when you'd expect a real one.

### The contact details swap

Subtler than a fake invoice. The attacker compromises an email account and quietly changes the reply-to address, phone number, or bank details in the email signature. When someone replies or uses those contact details, they're reaching the attacker instead of the real person. This can go unnoticed for weeks.

## AI is making it worse

By mid-2024, about 40% of BEC lures were AI-generated. That means the awkward grammar and weird phrasing that used to be red flags are disappearing. AI can write a convincing email in the voice and style of your actual business contacts, in any language. It can generate fake invoices, contracts, and supporting documents that look professional.

The barrier to entry for running a BEC campaign has dropped to basically zero. Anyone with access to a large language model can create convincing phishing emails at scale.

## What to do about it

### Verify payment changes out of band

This is the single most important rule. If anyone requests a change to payment details, bank information, or wire instructions via email, verify it by phone using a number you already have on file. Don't call the number in the email. Call the number you've been using for years.

This one rule would prevent most BEC losses. Write it down. Make it policy. Tape it to the wall in accounting.

### Set up email authentication

SPF, DKIM, and DMARC records make it significantly harder for someone to send emails pretending to be your domain. If you haven't configured these, your domain can be spoofed. I wrote a whole separate post on [SPF, DKIM, and DMARC](/posts/spf-dkim-dmarc-business-email/) if you want the details.

### Turn on MFA for email

If an attacker gets your email password, MFA is the thing that stops them from logging in. Without it, one phished password gives them full access to read your conversations, set up forwarding rules, and impersonate you to your contacts.

### Train your people

Not with a boring annual video. Show them real examples. The gift card email. The invoice redirect. Walk through what the fake email looked like versus the real one. People are much better at spotting these once they've seen specific examples.

### Enable Microsoft 365 anti-phishing policies

If you're on Microsoft 365 Business Premium or any plan with Defender for Office 365, there are built-in anti-phishing policies that detect impersonation of your users and domains. They're not turned on by default. It takes about 15 minutes to configure, and they catch a surprising amount.

### Set up mail flow rules for external senders

A simple rule that tags external emails with "[EXTERNAL]" in the subject line or a banner at the top of the message makes it much harder for someone to impersonate an internal sender. If the CEO's name is on an email but it has the external banner, that's a red flag.

## The real cost of BEC

The FBI's Internet Crime Complaint Center reported that BEC losses dwarfed ransomware losses in every year they've tracked the data. It's not even close. The average BEC loss is enough to seriously hurt a small business, and unlike ransomware, there's usually no recovery. Once the wire transfer clears, the money is gone.

The fixes I listed above are either free or cheap. The phone verification policy costs nothing. Email authentication is a DNS change. MFA is built into every major email platform. There's no reason not to do this.

## What to do next

If you're not sure whether your email is properly configured, or you want help setting up verification policies and training for your team, I work with small businesses in the Wichita area on exactly this. No pressure, no scare tactics, just practical security that actually gets implemented.

**Email me at chris@chrisputer.tech** or visit my [services page](/services/).
