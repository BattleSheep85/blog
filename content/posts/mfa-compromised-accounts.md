+++
title = "99.9% of compromised accounts don't have MFA"
date = 2025-09-19
draft = false
tags = ['mfa', 'cybersecurity', 'small-business', 'microsoft-365']
categories = ['Small Business IT']
description = "Microsoft says 99.9% of compromised accounts didn't have MFA enabled. Only 34% of small businesses use it. Here's why that gap exists, why cost isn't a real excuse, and how to turn it on."
+++

Microsoft has been saying this for years: 99.9% of the accounts they see compromised don't have multi-factor authentication turned on. That number hasn't budged. And the adoption rates at small businesses explain why.

For companies with 26 to 100 employees, only 34% use MFA. Drop down to businesses with fewer than 25 employees and it's 27%. Meanwhile, 65% of small businesses that don't have MFA say they don't plan to implement it.

This is the single easiest, cheapest security fix in existence, and most small businesses still aren't doing it.

<!--more-->

## What MFA actually is (quick version)

When you log into your email, you type a password. That's one factor. MFA adds a second factor: a code from an app on your phone, a push notification you approve, a text message, or a physical security key. Even if someone steals or guesses your password, they can't get in without that second factor.

That's it. That's the whole concept. Two things instead of one.

## Why small businesses aren't using it

Surveys consistently point to the same reasons, and they're all fixable.

### "It costs too much"

This is the number one reason cited, at 44% of respondents. And it's wrong.

MFA on Microsoft 365 is included in every business plan. It's not an add-on. It's not a premium feature. It's built in and ready to enable. Google Workspace includes it too. So does every major cloud service you're probably already using.

If your email platform includes MFA for free and you're not using it because of cost, you're leaving a free deadbolt on the shelf because you assume it requires a locksmith.

### "It's too complicated"

I get this one. The concern isn't that MFA is technically difficult. It's that employees will hate it, they'll get locked out, and there will be a week of chaos.

Here's what actually happens: you enable MFA, you give everyone a heads-up that they'll need to install the Microsoft Authenticator app (or Google Authenticator, or whatever you choose), and you set a registration deadline. The first day, everyone gets prompted. Most people figure it out in two minutes. A few need hand-holding. After a week, nobody thinks about it anymore.

The disruption is real but it's measured in days, not months. And it's nothing compared to the disruption of having your email accounts taken over.

### "We're too small to be a target"

I covered this in my ransomware post, but it applies here too. Attackers don't target you specifically. They run automated credential-stuffing attacks against millions of accounts at once, testing stolen passwords from data breaches. If your employee's password was in any breach (and there's a good chance it was), and they don't have MFA, their account is accessible to anyone with that list.

The attack isn't personal. It's automated. And automation doesn't care how big you are.

## What happens without MFA

Here's a typical scenario I've walked businesses through after the fact:

1. An employee uses the same password for their personal LinkedIn and their work Microsoft 365.
2. LinkedIn gets breached. That password ends up in a database that gets shared on criminal forums.
3. An attacker runs the password against Microsoft 365 login. It works.
4. The attacker logs into the employee's email. They set up a forwarding rule so copies of all incoming mail go to an external address.
5. They read email conversations for a few weeks, learning who pays what and when.
6. They send a convincing invoice to a customer from the real email account, with updated bank details.
7. The customer pays. The money goes to the attacker's account.

MFA would have stopped this at step 3. Everything after that never happens.

## How to turn on MFA in Microsoft 365

If you're the admin on your Microsoft 365 tenant (or your IT person is), here's the short version:

1. Go to the Microsoft 365 admin center at admin.microsoft.com
2. Navigate to Users > Active users
3. Click "Multi-factor authentication" at the top
4. Select all users (or start with admins and work out from there)
5. Enable MFA and set the enforcement date

For a more controlled rollout, use Security Defaults or Conditional Access policies (available on Business Premium and above):

**Security Defaults** is the easiest option. It forces MFA for all users and blocks legacy authentication protocols. One toggle in Azure AD and you're done. The downside is it's all-or-nothing.

**Conditional Access** gives you more control. You can require MFA only for external access, exclude specific accounts temporarily, or phase the rollout by department. This requires a plan that includes Azure AD Premium P1 (like Microsoft 365 Business Premium).

Either way, set the default MFA method to the Microsoft Authenticator app. It's more secure than SMS codes and it works even when people don't have cell service.

## What about those "MFA fatigue" attacks?

You may have read about attackers spamming MFA push notifications until the user approves one just to make it stop. This is real but solvable.

Microsoft Authenticator now supports number matching by default. Instead of a simple "approve/deny" prompt, the login screen shows a two-digit number and the user has to type that number into the app. It's a tiny extra step that completely eliminates MFA fatigue attacks.

If you're setting up MFA fresh, this is already the default. If you enabled MFA a while ago, check that number matching is turned on.

## Start with the admin accounts

If you can't roll out MFA to everyone at once, start with your admin accounts. These are the accounts that can create users, reset passwords, and access everything. A compromised admin account is a catastrophe. A compromised regular user account is bad but containable.

Then roll it out to finance and HR (they have access to sensitive data and payment systems), then everyone else.

## What to do next

If you're a small business owner and MFA isn't turned on for your team yet, this is the thing to fix first. Before better backups, before a new firewall, before security training. MFA. Today.

If you need help getting it set up, or you want someone to handle the rollout so you don't have to deal with the support calls, I work with small businesses around Wichita on exactly this. It usually takes a couple of hours of my time and a couple of days for everyone to get enrolled.

**Email me at chris@chrisputer.tech** or check out my [services page](/services/).
