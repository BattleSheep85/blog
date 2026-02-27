+++
title = "10 Microsoft 365 security settings you're not using"
date = 2025-09-27
draft = false
tags = ['microsoft-365', 'cybersecurity', 'small-business']
categories = ['Small Business IT']
description = "Most small businesses on Microsoft 365 are running with default settings that leave them wide open. Here are 10 security settings you're probably not using and how to turn them on."
+++

Microsoft 365 is by far the most common email and productivity platform I see in small businesses around Wichita. It's also the most commonly misconfigured. Microsoft ships it with settings that prioritize ease of setup over security, which means most small businesses are running with defaults that leave gaps big enough to drive a truck through.

Here are 10 settings that are either off by default or commonly overlooked. Every one of them is available on business plans you're probably already paying for.

<!--more-->

## 1. MFA is not enforced by default

This is the big one. Microsoft 365 does not require multi-factor authentication out of the box. Users can log in with just a password. Security Defaults (which does enforce MFA) exists, but it has to be turned on manually in Azure AD.

**Fix it:** Go to Azure Active Directory > Properties > Manage Security Defaults and flip it on. This forces MFA registration for all users and blocks legacy authentication. If you need more granular control (like phasing the rollout), use Conditional Access policies instead (requires Business Premium or an Azure AD P1 license).

## 2. Legacy authentication is still enabled

Legacy auth protocols (POP, IMAP, SMTP AUTH, and older Outlook clients) don't support MFA. Attackers love them because they can bypass your MFA entirely by authenticating through a legacy protocol. These are enabled by default on most tenants.

**Fix it:** Enabling Security Defaults automatically blocks legacy auth. If you're using Conditional Access instead, create a policy that blocks legacy authentication for all users. Before you do this, check if anyone is using an old email client or a multifunction printer that sends email via SMTP AUTH. Those will break and need to be reconfigured.

## 3. Too many Global Admins

I regularly see small business tenants with three, four, even five Global Admin accounts. Sometimes it's because whoever set up the tenant gave admin rights to the business owner, the office manager, and the IT person without thinking about it. Global Admin can do anything: read anyone's email, delete accounts, change billing, disable security controls.

**Fix it:** You should have two Global Admin accounts (for redundancy), and those accounts should only be used for admin tasks. Your daily email should not be a Global Admin account. Create dedicated admin accounts, protect them with strong MFA (preferably hardware security keys or passkeys), and demote everyone else to the specific admin role they actually need (Exchange Admin, User Admin, etc.).

## 4. SPF, DKIM, and DMARC are not configured

Microsoft doesn't set up email authentication for your custom domain automatically. Without SPF, DKIM, and DMARC, anyone can send emails that appear to come from your domain, and your legitimate emails are more likely to land in recipients' spam folders.

**Fix it:** This requires adding DNS records at your domain registrar or DNS host. SPF tells receiving servers which mail servers are authorized to send for your domain. DKIM cryptographically signs your outgoing messages. DMARC tells receivers what to do when SPF or DKIM checks fail. I wrote a detailed post on [SPF, DKIM, and DMARC](/posts/spf-dkim-dmarc-business-email/) that walks through the setup.

## 5. No Conditional Access policies

If you're on Microsoft 365 Business Premium, you have Conditional Access and you're probably not using it. Conditional Access lets you set rules like:

- Require MFA only when logging in from outside the office
- Block logins from countries where you don't do business
- Require compliant devices to access company data
- Restrict access to specific apps based on user role

**Fix it:** Start simple. A policy that blocks sign-ins from countries you don't operate in eliminates a huge amount of brute-force traffic. Add a policy requiring MFA for all external access. Build from there.

## 6. Unified audit logging is not enabled

Microsoft 365 can log every login, file access, admin change, and mailbox activity. But audit logging needs to be turned on, and the data is only retained for a limited time on lower-tier plans.

**Fix it:** Go to the Microsoft Purview compliance portal > Audit and make sure auditing is turned on. On Business Basic and Standard plans, audit logs are retained for 180 days. Business Premium gives you up to one year. These logs are critical if you ever need to investigate a breach or respond to a cyber insurance claim.

## 7. Mailbox forwarding rules aren't monitored

One of the first things an attacker does after compromising an email account is set up a forwarding rule. All incoming mail gets copied to an external address. The user doesn't notice because their inbox looks normal. The attacker reads everything.

**Fix it:** In the Exchange admin center, you can create a transport rule that blocks automatic forwarding to external domains. Or at minimum, set up an alert that notifies you when a forwarding rule is created. Go to the Microsoft Defender portal > Policies & rules > Alert policies and make sure "Creation of forwarding/redirect rule" is enabled.

## 8. Anti-phishing policies aren't configured

Microsoft Defender for Office 365 (included with Business Premium) has anti-phishing policies that detect when someone impersonates your users or your domain. These policies are not fully configured by default.

**Fix it:** Go to the Microsoft Defender portal > Policies & rules > Threat policies > Anti-phishing. Edit the default policy or create a new one. Add your most targeted users (CEO, finance team, HR) to the impersonation protection list. Enable mailbox intelligence, which learns each user's communication patterns and flags anomalies.

## 9. Safe Links and Safe Attachments aren't turned on

If you're on Business Premium, you have Safe Links (which checks URLs at click time) and Safe Attachments (which detonates attachments in a sandbox before delivery). These are powerful features that aren't enabled by default.

**Fix it:** In the Defender portal, go to Threat policies and configure Safe Links and Safe Attachments policies. For Safe Links, enable URL scanning for email messages and Microsoft Teams. For Safe Attachments, turn on dynamic delivery (users get the email immediately, attachments are delivered after scanning).

## 10. Users can consent to third-party apps

By default, any user in your tenant can grant a third-party application access to their Microsoft 365 data. This is how OAuth phishing attacks work: a user clicks a link, approves an app that looks legitimate, and that app now has read access to their email and files.

**Fix it:** In Azure AD > Enterprise applications > Consent and permissions, change the user consent setting so users cannot consent to apps on their own. Require admin approval for all third-party app access. When a user needs an app, they request it and an admin reviews and approves it.

## The bottom line

None of these settings require purchasing additional products. If you're on Microsoft 365 Business Premium (about $22/user/month), you have access to every feature listed here. Even on Business Basic or Standard, you can implement most of them.

The problem isn't capability. It's configuration. Microsoft gives you the tools and leaves them in the box.

## What to do next

If you're on Microsoft 365 and you haven't reviewed these settings, it's worth an afternoon. If you'd rather have someone who does this regularly go through your tenant and lock it down properly, that's what I do. I work with small businesses in the Wichita area, and a Microsoft 365 security review is one of the most common things I get asked for.

**Email me at chris@chrisputer.tech** or check out my [services page](/services/).
