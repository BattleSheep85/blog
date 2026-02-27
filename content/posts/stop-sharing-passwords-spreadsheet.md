+++
title = "Stop sharing passwords in a spreadsheet"
date = 2025-09-23
draft = false
tags = ['passwords', 'cybersecurity', 'small-business']
categories = ['Small Business IT']
description = "If your team shares passwords in a spreadsheet, sticky note, or Slack message, you're one breach away from losing everything. Here's how to fix it with a password manager that costs less than lunch."
+++

I asked a client how their team shared login credentials. The office manager pulled up an Excel file on the shared drive called "passwords.xlsx." Every account the business used was in there. Bank login, insurance portal, vendor accounts, the alarm system code, the QuickBooks admin password. All in plain text. No password on the file. Accessible to everyone on the network.

This is more common than you'd think. And it works fine right up until someone gets access to that file who shouldn't.

<!--more-->

## Why the spreadsheet has to go

The spreadsheet (or the Google Doc, or the Slack channel, or the sticky note on the monitor) has a few fundamental problems:

**No access control.** Everyone with access to the shared drive can see every password. The receptionist can see the banking credentials. A compromised laptop means every password in that file is compromised.

**No audit trail.** When you find out someone used the QuickBooks admin login to do something they shouldn't have, you can't tell who it was. Everyone had the same password.

**No change management.** When someone leaves the company, do you change every password in that spreadsheet? Every single one? I've never met a small business that does this consistently.

**It encourages password reuse.** When passwords are painful to manage, people take shortcuts. The same password gets used for multiple services. One breach cascades into many.

## What to use instead

A business password manager. The concept is simple: one encrypted vault that stores all your credentials, with individual user accounts so everyone has access to only what they need. When someone leaves, you disable their account and they lose access to everything in one step.

Here are the three I recommend for small businesses, based on what I've actually deployed:

### 1Password ($7.99/user/month for Teams)

This is my go-to recommendation for small teams. The interface is clean, the browser extension works reliably, and shared vaults make it straightforward to organize credentials by department or function. You create a vault for "Banking," one for "Vendor Accounts," one for "IT Admin," and assign people to the vaults they need.

1Password also generates strong, unique passwords for every site, auto-fills them in the browser, and stores MFA codes alongside the login. The admin console shows you who has access to what, and you can see if anyone's using weak or reused passwords.

### NordPass (Business plans starting at $3.99/user/month)

Solid alternative, especially if budget is the primary concern. NordPass handles the basics well: secure sharing, password generation, breach monitoring that alerts you if credentials show up in a data breach. The admin panel lets you enforce password policies and manage access. Interface is straightforward without a lot of complexity.

### TeamPassword (starting at about $4/user/month)

Designed specifically for teams that need to share credentials for accounts that don't support individual logins (social media accounts, shared vendor portals, etc.). Less feature-rich than 1Password, but dead simple for the specific use case of "we have 20 accounts that three people need access to."

## The cost argument

I hear "we can't afford another subscription" from small businesses all the time. Let's do the math.

A 10-person team on 1Password costs about $80/month. NordPass would be about $40/month. TeamPassword lands somewhere in between.

Now compare that to what happens when the spreadsheet gets compromised:

- Someone accesses your bank account with stolen credentials
- A former employee who still knows all the passwords does something destructive
- A ransomware attack gets into your file share and now the attackers have every credential your business uses
- Your cyber insurance claim gets denied because you couldn't demonstrate proper credential management

The password manager isn't an expense. It's the cheapest insurance you'll buy.

## How to make the switch

### Step 1: pick a manager and set up the admin account

Choose one. I'd go with 1Password for most small teams, but any of the three above will be a massive improvement over a spreadsheet. Sign up for the business plan and create the organization.

### Step 2: create your vault structure

Keep it simple. Start with:
- **Shared, General** for accounts everyone needs (Wi-Fi password, front door code, etc.)
- **Finance** for banking, QuickBooks, payroll
- **IT Admin** for servers, domain registrar, hosting
- **Social Media/Marketing** for shared social accounts

### Step 3: migrate the passwords

Go through that spreadsheet and enter every credential into the appropriate vault. Yes, this takes a couple hours. Do it anyway.

### Step 4: change the sensitive ones

While you're migrating, change the passwords for your most critical accounts (banking, email admin, anything financial). Use the password generator to create strong, unique passwords. This is a good time to clean house.

### Step 5: roll it out to the team

Install the browser extension on everyone's computer. Have each person create their individual account. Walk them through saving a password and using auto-fill. Most people get comfortable with it within a day or two.

### Step 6: delete the spreadsheet

Once everything is migrated and everyone is using the password manager, delete the spreadsheet. Delete the Google Doc. Throw away the sticky notes. Remove the Slack message. Don't leave the old system lying around as a backup, because someone will keep using it.

## Handling the pushback

You'll get resistance. "The spreadsheet was easier." "I can't remember my master password." "This is too many steps."

The spreadsheet was easier the same way leaving your front door unlocked is easier than carrying keys. Convenience isn't a security strategy.

For the master password concern: each person only needs to remember one password, the one that unlocks their vault. Write it down and keep it in a safe or locked drawer at home. Not on a sticky note on the monitor.

## What to do next

If your team is sharing passwords in a spreadsheet, a Google Doc, Slack messages, or sticky notes, that's the thing to fix this week. It's one of the cheapest and fastest security improvements you can make, and it eliminates an entire category of risk.

If you want help choosing a password manager, migrating your credentials, and rolling it out to your team, I work with small businesses around Wichita on this stuff all the time. It usually takes half a day to set up and a week for everyone to settle in.

**Email me at chris@chrisputer.tech** or visit my [services page](/services/).
