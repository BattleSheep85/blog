+++
title = "Shared mailbox vs distribution list vs M365 Group: which one do you need?"
date = 2025-12-24
draft = false
description = "Distribution lists, shared mailboxes, and M365 Groups all handle group email differently. Here's when to use each one and how they actually work."
tags = ['microsoft-365', 'email', 'small-business']
categories = ['Small Business IT']
+++

"We need a sales@ email address. Should that be a shared mailbox or a distribution list?" I get this question constantly, and the answer depends on what you actually need the email address to do. These three options look similar on the surface, but they work very differently under the hood.

Here's the plain English breakdown so you can pick the right one.

<!--more-->

## Distribution list (distribution group)

**What it does:** Takes one incoming email and sends a copy to every member. That's it.

**Think of it as:** A mailing list. Someone sends an email to announcements@yourcompany.com, and everyone on the list gets a copy in their own inbox.

**Best for:**

- Company-wide announcements
- Department-wide notifications
- Situations where you need one-way broadcasting
- Cases where each recipient handles the email independently

**Key details:**

- No shared inbox. Each person gets their own copy.
- No shared sent folder. When someone replies, it comes from their personal email unless they manually change the "From" field.
- No storage cost. Since emails go to individual mailboxes, the distribution list itself doesn't store anything.
- No license required for the list itself.
- Anyone can reply-all and create chaos (we've all seen it).

**Example use:** You want to send the holiday schedule to everyone in the company. Create a distribution list called all-staff@yourcompany.com and send it there.

## Shared mailbox

**What it does:** Creates a real inbox that multiple people can access. Everyone sees the same emails, the same sent items, and the same folders.

**Think of it as:** A shared desk with one phone. Multiple people answer it, and everyone can see the call log.

**Best for:**

- Customer-facing email addresses (info@, support@, sales@)
- Situations where multiple people need to see and respond to the same email
- Cases where you need to track who replied to what
- Any scenario where you'd lose track of emails if each person got their own copy

**Key details:**

- Real inbox with 50GB of storage (free, no license required)
- Shared sent folder. When someone replies from the shared mailbox, it shows up in the shared sent items.
- Can send as the shared address. Recipients see "sales@yourcompany.com" not the individual person.
- Multiple people can access it simultaneously
- No license cost. This is a big deal. Shared mailboxes are free up to 50GB. If you need more than 50GB, you need to assign a license.
- Can be added to Outlook alongside your personal mailbox

**Example use:** Your sales team needs a sales@yourcompany.com inbox where anyone on the team can see incoming leads and respond. A shared mailbox means nobody misses an email, and the team can see what's already been answered.

## Microsoft 365 Group

**What it does:** Creates a full collaboration workspace: shared mailbox, shared calendar, SharePoint document library, OneNote notebook, and optionally a Teams channel. All tied together.

**Think of it as:** A shared mailbox on steroids. It's a full team workspace with email as just one component.

**Best for:**

- Project teams that need email, files, and a calendar in one place
- Cross-department groups that collaborate regularly
- Situations where you want the full Microsoft collaboration stack
- Teams that are already using Microsoft Teams (every Team has an M365 Group behind it)

**Key details:**

- Shared inbox (50GB, free)
- Shared calendar
- SharePoint document library (for files)
- Members get email to the group by default (configurable)
- Can be connected to a Teams channel
- Membership controls access to all associated resources (files, calendar, email)
- No additional license cost

**Example use:** Your marketing team needs a shared email address, a shared calendar for campaign deadlines, and a shared folder for campaign assets. An M365 Group gives them all three.

## Quick comparison table

| Feature | Distribution List | Shared Mailbox | M365 Group |
|---|---|---|---|
| Shared inbox | No | Yes | Yes |
| Shared sent items | No | Yes | Yes |
| Storage | None | 50GB free | 50GB free |
| Shared calendar | No | Limited | Yes |
| Shared files | No | No | Yes (SharePoint) |
| License required | No | No (under 50GB) | No |
| Send as group address | Manual config | Yes | Yes |
| Works with Teams | No | No | Yes |

## Common mistakes I fix

**Using a distribution list when you need a shared mailbox.** "Customers email sales@, and whoever sees it first responds." If that email goes to a distribution list, three people might respond to the same customer. Use a shared mailbox so everyone can see what's been handled.

**Creating a user account for a group email.** I still see companies that create a regular M365 user account for info@ or support@ and share the login credentials. This wastes a license ($6-22/month), creates a security risk (shared credentials), and doesn't give you proper audit trails. Convert it to a shared mailbox.

**Ignoring M365 Groups entirely.** A lot of small businesses never use M365 Groups because they don't know they exist. If you have a team that needs shared email and shared files, an M365 Group (or just creating a Team in Microsoft Teams) gives you both without any extra cost or complexity.

**Not setting "Send As" permissions.** When someone replies from a shared mailbox, you want the reply to come from sales@yourcompany.com, not from jane.smith@yourcompany.com. Make sure "Send As" permission is configured on the shared mailbox.

## My recommendation

For most small businesses:

- **Announcements and notifications:** Distribution list
- **Customer-facing inboxes (info@, support@, sales@):** Shared mailbox
- **Team collaboration (project groups, departments):** M365 Group or Teams team
- **Generic accounts you're currently sharing a password for:** Convert to shared mailbox immediately

## What to do next

If your email setup is a mess of distribution lists, shared passwords, and "we just forward stuff around," I can clean it up. Usually takes an hour or two to audit what you have and reconfigure it properly.

Reach out at chris@chrisputer.tech or visit [my services page](/services/) to get started.
