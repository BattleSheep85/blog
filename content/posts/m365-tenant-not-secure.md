+++
title = "Your M365 tenant is probably not secure"
date = 2025-12-12
draft = false
description = "Microsoft now requires MFA for admin center access. Here's what else you're probably missing in your M365 security configuration."
tags = ['microsoft-365', 'cybersecurity', 'small-business']
categories = ['Small Business IT']
+++

As of February 9, 2026, Microsoft requires multi-factor authentication for all admin center access. No exceptions, no grace period, no "we'll get to it later." If your global admin account is still protected by just a password, you're already locked out or about to be.

But MFA on admin accounts is the bare minimum. Most M365 tenants I audit for small businesses have the same set of security gaps, and most of them take less than an hour to fix.

<!--more-->

## What Microsoft just changed

Microsoft's mandatory MFA rollout for admin center access started in October 2024 and finished on February 9, 2026. This applies to the Microsoft 365 admin center, Entra admin center, Intune admin center, and Exchange admin center. Every admin account, every time, no exceptions.

If you haven't set this up yet, your admins literally cannot access the admin portals. This isn't a warning anymore. It's enforced.

## Security Defaults vs Conditional Access

Microsoft gives you two paths to secure your tenant:

**Security Defaults (free, included with every tenant):** This is the "good enough for most small businesses" option. It forces MFA registration for all users, requires MFA for admin sign-ins, blocks legacy authentication protocols, and requires MFA for risky sign-ins. Turn this on if you haven't already. It takes about 30 seconds.

**Conditional Access (requires Business Premium or Entra ID P1):** This is the "I need granular control" option. You can build policies like "require MFA only when signing in from outside the office" or "block access from countries where we don't do business." It's more powerful, but it's more complex and costs more.

For most small businesses under 50 users, Security Defaults is the right starting point. You can always move to Conditional Access later when your needs get more specific.

## The security checklist your tenant needs

Here's what I check on every M365 security audit. Most of these are free and take minutes to configure:

### 1. Enable Security Defaults (or Conditional Access)
Go to Entra ID > Properties > Manage Security Defaults > Enable. Done. If you're on Business Premium and want Conditional Access instead, disable Security Defaults first, then build your policies.

### 2. Disable legacy authentication
Legacy auth protocols (POP3, IMAP, SMTP basic auth) don't support MFA. They're the #1 way attackers bypass your MFA setup. Security Defaults blocks these automatically. If you're using Conditional Access, you need to create a policy to block them explicitly.

### 3. Use phishing-resistant MFA for admin accounts
SMS codes and voice calls are better than nothing, but they're vulnerable to SIM swapping and social engineering. For your admin accounts (at minimum), use Microsoft Authenticator with number matching or a FIDO2 security key. Yubikeys run about $50 each. Cheap insurance for the keys to your kingdom.

### 4. Create a break-glass admin account
This is an emergency-only global admin account with a long, complex password stored in a physical safe or a separate password manager. No MFA (or a separate MFA method like a hardware key stored offline). You need this in case your primary admin gets locked out, your MFA provider has an outage, or something goes catastrophically wrong.

### 5. Audit who has admin roles
Run a quick check in Entra ID > Roles and administrators. I routinely find tenants where five or six people have Global Administrator. You need two, maybe three. Everyone else should have the minimum role they need to do their job. Your HR person who resets passwords needs User Administrator, not Global Admin.

### 6. Enable the unified audit log
Go to Microsoft Purview > Audit. Make sure auditing is turned on. This logs sign-ins, file access, admin actions, and mailbox activity. When (not if) something suspicious happens, this log is how you figure out what happened. It's free and on by default for most tenants, but I've seen it disabled.

### 7. Configure email authentication (SPF, DKIM, DMARC)
This isn't strictly an M365 setting, it's DNS, but it protects your domain from being spoofed in phishing emails. If you haven't set up all three, someone can send email that looks like it comes from your domain. Your customers and vendors will trust it because it has your name on it.

### 8. Review external sharing in SharePoint and OneDrive
By default, M365 lets users share files and folders with anyone, including people outside your organization. Check your sharing settings in the SharePoint admin center. At minimum, restrict external sharing to "existing guests" or "people in specific domains."

## The five-minute wins

If you do nothing else today, do these three things:

1. Turn on Security Defaults (if you haven't already)
2. Check how many Global Admins you have (reduce to 2-3)
3. Verify your admin accounts are using Microsoft Authenticator, not SMS

That takes maybe 15 minutes and closes the biggest holes.

## What to do next

If you're not sure where your M365 tenant stands, I do security audits that cover all of this and more. No scare tactics, just a clear list of what's configured, what's not, and what to fix first.

Reach out at chris@chrisputer.tech or visit [my services page](/services/) to get started.
