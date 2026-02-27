+++
title = "SPF, DKIM, and DMARC: why your business emails land in spam"
date = 2025-10-09
draft = false
tags = ['email', 'dns', 'small-business', 'microsoft-365']
categories = ['Small Business IT']
description = "Google, Yahoo, and Microsoft now require SPF, DKIM, and DMARC for email delivery. If you haven't configured these, your invoices and proposals are landing in spam. Here's what they are and how to set them up."
+++

You send a proposal to a potential client. They don't respond. A week later you follow up and they say "I never got it." You check your sent folder. It's there. But it landed in their spam folder, or got rejected entirely, because your email domain doesn't have SPF, DKIM, and DMARC configured.

This isn't hypothetical. I see it with small businesses all the time. They're losing real money because their legitimate emails look suspicious to receiving mail servers.

<!--more-->

## What changed

Google and Yahoo started requiring email authentication in February 2024. If you send email to anyone with a Gmail or Yahoo address (which is a lot of people), your messages need to pass SPF and DKIM checks, and you need a DMARC record published. Microsoft followed with similar requirements in May 2025 for Outlook.com, Hotmail, and Live.com addresses.

Before these requirements, having email authentication was a "nice to have" that improved deliverability. Now it's mandatory. Without it, your emails will be deferred, filtered to spam, or rejected outright by the major email providers.

## What these actually are

I'm going to keep this simple because the technical details can get deep. You need to understand what each one does, not how the cryptography works.

### SPF (Sender Policy Framework)

SPF is a DNS record that lists which mail servers are authorized to send email on behalf of your domain. When someone receives an email from chris@yourbusiness.com, their mail server checks your SPF record to see if the sending server is on your list. If it's not, the email looks suspicious.

Think of it as a guest list. SPF tells the world "these are the servers that are allowed to send email as us."

### DKIM (DomainKeys Identified Mail)

DKIM adds a digital signature to your outgoing emails. The receiving server checks this signature against a public key published in your DNS records. If the signature is valid, the email hasn't been tampered with in transit and it really came from an authorized sender.

Think of it as a wax seal on a letter. It proves the email is authentic and hasn't been altered.

### DMARC (Domain-based Message Authentication, Reporting, and Conformance)

DMARC ties SPF and DKIM together and tells receiving servers what to do when checks fail. Should they reject the message? Quarantine it (send to spam)? Or just let it through and send you a report?

DMARC also gives you reporting. You get data on who's sending email using your domain, including legitimate services you've authorized and attackers trying to spoof you.

## Why your business needs all three

**Your emails reach inboxes instead of spam.** This is the immediate, practical benefit. Invoices, proposals, appointment confirmations, everything you send gets delivered reliably.

**Nobody can easily spoof your domain.** Without these records, anyone can send an email that appears to come from your domain. An attacker can send invoices to your customers that look like they came from you. With proper DMARC enforcement, those spoofed emails get rejected.

**You keep your domain reputation clean.** Email providers track domain reputation. If someone is spoofing your domain and sending spam, your legitimate emails suffer. SPF, DKIM, and DMARC protect your reputation.

**Your cyber insurance carrier may require it.** More insurance applications are asking about email authentication. Some carriers check your DNS records as part of the underwriting process.

## How to set them up

### Step 1: SPF record

Your SPF record is a TXT record in your domain's DNS. For a small business using Microsoft 365, it looks like this:

```
v=spf1 include:spf.protection.outlook.com -all
```

That says: "Microsoft 365 is authorized to send email for our domain. Reject everything else."

If you also use other services that send email as your domain (a CRM, a marketing platform, a helpdesk system), you need to include those too:

```
v=spf1 include:spf.protection.outlook.com include:sendgrid.net -all
```

Important rules: you can only have one SPF record per domain. If you have multiple, combine them into one. And keep the total number of DNS lookups under 10 (each "include" typically counts as one or more lookups).

### Step 2: DKIM

For Microsoft 365, DKIM setup involves creating two CNAME records in your DNS, then enabling DKIM signing in the Microsoft Defender portal.

The CNAME records look like:

```
Host: selector1._domainkey
Points to: selector1-yourdomain-com._domainkey.yourtenant.onmicrosoft.com

Host: selector2._domainkey
Points to: selector2-yourdomain-com._domainkey.yourtenant.onmicrosoft.com
```

(Replace "yourdomain-com" and "yourtenant" with your actual values. Microsoft provides the exact records in the Defender portal under Email & Collaboration > Policies > Threat Policies > Email authentication > DKIM.)

After the DNS records are published, go to the DKIM page in the Defender portal and enable signing for your domain.

### Step 3: DMARC record

Start with a monitoring-only DMARC policy so you can see what's happening without breaking anything:

```
v=DMARC1; p=none; rua=mailto:dmarc-reports@yourbusiness.com
```

This tells receivers: "Don't reject or quarantine anything yet, just send me reports about emails using my domain." The reports come as XML files to the address you specify. They're ugly to read raw, but free tools like DMARC Analyzer or postmark.com's DMARC monitoring can parse them for you.

After a few weeks of monitoring, once you've confirmed all your legitimate email sources are passing SPF and DKIM, move to quarantine:

```
v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@yourbusiness.com
```

This sends failing emails to spam instead of the inbox. After another period of monitoring with no problems, move to reject:

```
v=DMARC1; p=reject; rua=mailto:dmarc-reports@yourbusiness.com
```

This is the end goal. Emails that fail authentication get rejected entirely.

## Common mistakes

**Forgetting a sending service.** Your website contact form, your CRM, your marketing email tool, your invoicing software. If any of these send email using your domain and they're not in your SPF record, those messages will fail authentication. Make a list of everything that sends email as your domain before you set SPF.

**Multiple SPF records.** You can only have one SPF record. If you already have one and add another, both break. Combine them into a single record.

**Going straight to DMARC reject.** Don't skip the monitoring phase. If you go straight to p=reject and you missed a legitimate sending service in your SPF record, those emails get silently rejected. Start with p=none, watch the reports, then escalate.

**Setting it up and never checking.** DMARC reports tell you when something changes. If a new service starts sending email as your domain (or an attacker starts trying to), the reports show it. Check them at least monthly.

## How to test your setup

After making DNS changes, give them a few hours to propagate, then test:

**MX Toolbox** (mxtoolbox.com) has free SPF, DKIM, and DMARC lookup tools. Enter your domain and it tells you if your records are valid and configured correctly.

**Mail Tester** (mail-tester.com) lets you send an email to a test address and gives you a score with specific feedback on authentication, spam triggers, and deliverability issues.

**Google's Check MX** tool works if you're specifically concerned about delivery to Gmail addresses.

## What to do next

If you're not sure whether your email authentication is set up correctly, or if you've been hearing from customers that they're not getting your emails, this is worth fixing now. It's a DNS change, not a major project. But getting the details right matters because a misconfigured SPF record can make things worse, not better.

If you want someone to handle this for you, I set up email authentication for small businesses in the Wichita area regularly. It's usually a one-time setup that takes an hour or two, and it solves the deliverability problem permanently.

**Email me at chris@chrisputer.tech** or check out my [services page](/services/).
