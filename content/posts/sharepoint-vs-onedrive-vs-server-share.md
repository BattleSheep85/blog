+++
title = "SharePoint vs OneDrive vs the old server share"
date = 2025-12-14
draft = false
description = "OneDrive is your personal locker. SharePoint is the company filing cabinet. Here's how to use each one correctly so you don't lose files when someone leaves."
tags = ['microsoft-365', 'sharepoint', 'small-business']
categories = ['Small Business IT']
+++

Every week I talk to a small business owner who's confused about the difference between SharePoint and OneDrive. Usually the conversation starts with "we just put everything in OneDrive and share links." That works fine until someone quits, gets fired, or their account gets deleted. Then you find out that all those shared links pointed to files that lived in one person's personal storage, and now they're gone.

Let me break down what each one is actually for, and how to set things up so your company data stays with the company.

<!--more-->

## The simple version

**OneDrive = your personal locker.** It's tied to one person's M365 account. Think of it like the "My Documents" folder on your work PC. It's for drafts, personal working files, and stuff that only you need. When that person's account is deleted, their OneDrive is deleted (after a 30-day grace period).

**SharePoint = the company filing cabinet.** It belongs to the organization, not any individual person. It persists regardless of who comes and goes. This is where company documents, templates, policies, project files, and anything that more than one person needs should live.

**The old server share = what SharePoint replaces.** That mapped S: drive pointing to a file server in the closet? SharePoint does the same thing, but with version history, search, permissions, web access, and no hardware to maintain.

## The mistake I see everywhere

Here's the scenario I clean up at least once a month:

1. Company moves to M365
2. Nobody explains the difference between OneDrive and SharePoint
3. Employees dump everything into their OneDrive
4. They share links with coworkers when someone needs a file
5. An employee leaves
6. IT disables or deletes their account
7. Every shared link that pointed to that person's OneDrive breaks
8. Panic

The files aren't necessarily gone forever. Microsoft gives you 30 days to recover a deleted user's OneDrive. But I've seen companies miss that window, and even when they don't, it's a mess to sort through one person's entire OneDrive to figure out what was personal and what was company data.

## How to set it up right

### Use SharePoint for anything the company owns

Create SharePoint sites (or Teams, which automatically create SharePoint sites behind the scenes) for:

- Department files (Accounting, HR, Sales, Operations)
- Project files
- Company policies and templates
- Client deliverables
- Anything that more than one person needs access to now or in the future

### Use OneDrive for personal working files

OneDrive is fine for:

- Drafts you're working on before sharing
- Personal notes
- Files synced from your desktop that only you need

### Sync SharePoint libraries to File Explorer

This is the key to making SharePoint feel like the old server share. Users can sync any SharePoint document library to their PC using the OneDrive sync client. It shows up in File Explorer just like a mapped drive. They can work with files normally, and everything syncs back to SharePoint automatically.

To set this up: open the SharePoint library in a browser, click "Sync," and the OneDrive client handles the rest. Files are available offline, and conflicts are handled automatically.

### Set permissions at the site level

Don't rely on individual file sharing. Set permissions on the SharePoint site or document library level:

- **Site owners:** IT admin and department head
- **Site members:** Everyone in that department (use M365 Groups)
- **Site visitors:** Read-only access for people who need to see but not edit

This way, when a new employee starts, you add them to the right M365 Group and they automatically get access to the files they need. When someone leaves, you remove them from the group and access is revoked. No shared links to chase down.

## What about the old file server?

If you're still running a physical file server with mapped drives, here's the honest truth: for most small businesses under 50 users, SharePoint Online replaces it. You get:

- No hardware to maintain, patch, or replace every 5-7 years
- Built-in version history (recover previous versions of any file)
- Access from anywhere without a VPN
- 1TB of SharePoint storage per tenant plus 10GB per licensed user
- Search that actually works

The migration takes some planning. You'll want to clean up your file structure first (nobody needs those 2014 project folders), map out permissions, and use the SharePoint Migration Tool (free from Microsoft) to move the data.

For larger businesses with complex permission structures or enormous file libraries (10TB+), a hybrid approach or a proper file migration tool like ShareGate might make more sense. But for most SMBs, a straight migration to SharePoint Online works.

## The Teams connection

Every time you create a Team in Microsoft Teams, it automatically creates a SharePoint site and document library behind the scenes. The "Files" tab in any Teams channel is actually a SharePoint folder. This means you can organize company files through Teams if that's where your staff already works, and everything is stored in SharePoint where it belongs.

## Quick reference

| Scenario | Use This |
|---|---|
| Personal drafts and notes | OneDrive |
| Company policies and templates | SharePoint |
| Department shared files | SharePoint |
| Project collaboration | SharePoint (or Teams) |
| Files only one person needs | OneDrive |
| Client deliverables | SharePoint |
| "I need to share this with my team" | SharePoint, not a OneDrive link |

## What to do next

If your company files are scattered across OneDrive accounts, personal desktops, and an aging file server, I can help you consolidate everything into a clean SharePoint structure that makes sense and doesn't disappear when someone leaves.

Reach out at chris@chrisputer.tech or check out [my services](/services/) to get started.
