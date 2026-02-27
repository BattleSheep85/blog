+++
title = "The employee IT checklist your small business doesn't have"
date = 2025-12-22
draft = false
description = "Most small businesses wing it when someone starts or leaves. Here's a proper IT onboarding and offboarding checklist that protects your data and saves time."
tags = ['small-business', 'microsoft-365', 'security']
categories = ['Small Business IT']
+++

I can tell a lot about a company's IT maturity by asking one question: "What happens to someone's accounts and data when they leave?" The answer is usually a long pause followed by "we change their password" or "we just delete their account." Both of those answers mean data loss, security gaps, or both.

A proper onboarding and offboarding checklist takes maybe an hour to create. After that, every new hire and every departure follows the same process. Nothing gets missed, nothing gets lost, and you don't find out six months later that a former employee still has access to your QuickBooks.

<!--more-->

## Why this matters more than you think

When onboarding is inconsistent, new hires waste their first day (or week) waiting for accounts, access, and equipment. That's lost productivity you're paying for.

When offboarding is sloppy, you end up with:

- Former employees who still have active M365 accounts
- Company files in a deleted OneDrive that nobody transferred
- SaaS app accounts (QuickBooks, CRM, project management) still active under someone who left months ago
- Shared passwords that the former employee still knows

Every one of these is a real security risk, and I've seen every one of them at real companies.

## The onboarding checklist

### Before day one

- [ ] Order and configure hardware (laptop/desktop, monitor, keyboard, mouse)
- [ ] Create M365 account with the correct license tier
- [ ] Add user to appropriate M365 Groups and distribution lists
- [ ] Create accounts for line-of-business apps (QuickBooks, CRM, etc.)
- [ ] Set up email signature (use a company template)
- [ ] Assign a phone extension or Teams Calling plan if applicable
- [ ] Prepare a welcome document with login instructions, Wi-Fi info, and key contacts

### Day one

- [ ] Enforce MFA enrollment immediately. Not tomorrow, not "when they get settled." Day one.
- [ ] Walk through Outlook, Teams, SharePoint, and OneDrive basics
- [ ] Verify the employee can access all required systems and file shares
- [ ] Set up their mobile device for email (if applicable)
- [ ] Review the acceptable use policy and have them sign it
- [ ] Add them to any required Teams channels
- [ ] Introduce them to the help desk process (who to contact, how to submit a ticket)

### First week

- [ ] Confirm all accounts are working and permissions are correct
- [ ] Verify MFA is fully enrolled and functional
- [ ] Schedule any role-specific training (accounting software, CRM, etc.)
- [ ] Check that file sync (OneDrive/SharePoint) is working on their PC

## The offboarding checklist

This is the one that really matters. A missed step here can cost you data or create a security incident.

### Immediately on departure (same day)

- [ ] Disable the M365 account (don't delete it yet)
- [ ] Reset the password to something random (in case they're still signed in somewhere)
- [ ] Revoke all active sessions (Entra ID > Users > Revoke Sessions)
- [ ] Remove from all M365 Groups and distribution lists
- [ ] Disable or reassign their phone extension
- [ ] Collect all company hardware (laptop, phone, keys, badge, chargers)

### Within 24-48 hours

- [ ] Convert their mailbox to a shared mailbox (free, preserves email history, no license needed)
- [ ] Grant shared mailbox access to their manager or replacement
- [ ] Transfer OneDrive ownership to their manager (or copy critical files to SharePoint)
- [ ] Disable or transfer accounts in all SaaS applications:
  - Accounting software
  - CRM
  - Project management tools
  - Password manager (remove their vault, rotate any shared passwords they had access to)
  - VPN access
  - Any vendor portals
- [ ] Forward their email to a designated person (set an auto-reply if appropriate)
- [ ] Remove their device from Intune/Entra ID if managed

### 30 days after departure

- [ ] Monitor sign-in logs for any access attempts (Entra ID > Sign-in logs)
- [ ] Review any external sharing links that pointed to their OneDrive
- [ ] After 30 days with no issues, delete the disabled account
- [ ] Remove the shared mailbox only if email history is no longer needed
- [ ] Update any documentation or contact lists that reference the former employee

## The shared password problem

Here's the uncomfortable one. If your company shares passwords for any system (a common admin account, a vendor portal, a social media account), every one of those passwords needs to be changed when someone with access leaves. Every single one.

This is why I push every small business toward a password manager with proper sharing. With a tool like Bitwarden or 1Password, you revoke the former employee's access to shared credentials and rotate the passwords they had. Without a password manager, you're relying on memory to figure out what they had access to. Good luck with that.

## Automate what you can

If you're using M365, you can automate parts of this:

- **M365 Groups:** Add a user to a group, and they automatically get access to the group's SharePoint, Teams, shared mailbox, and distribution list. Remove them, and it all goes away.
- **Intune:** Wipe a company device remotely when someone leaves.
- **PowerShell:** Script the creation and disabling of accounts so nothing gets missed (see my post on PowerShell scripts that save hours).

The checklist itself can live in SharePoint, a shared OneNote, or even a simple spreadsheet. The format doesn't matter. What matters is that it exists and someone follows it every time.

## What to do next

If you don't have an onboarding/offboarding process, or if yours is "we figure it out each time," I can help you build one that fits your company. It's one of the simplest things you can do to tighten up security and save time.

Reach out at chris@chrisputer.tech or visit [my services page](/services/) to get started.
