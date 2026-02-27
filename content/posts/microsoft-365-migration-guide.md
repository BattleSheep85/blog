+++
title = "Microsoft 365 migration guide for small businesses"
date = 2025-12-10
draft = false
description = "A practical, phased approach to migrating your small business to Microsoft 365 without losing data, email, or your sanity."
tags = ['microsoft-365', 'migration', 'small-business']
categories = ['Small Business IT']
+++

I've done enough Microsoft 365 migrations to know exactly where they go wrong. It's almost always the same handful of mistakes, and they're all avoidable if you plan ahead. Whether you're moving from on-prem Exchange, Google Workspace, or a pile of POP3 mailboxes from your hosting provider, the process is the same: plan it, pilot it, roll it out in waves, and clean up after.

Here's how to do it without losing data, email, or your sanity.

<!--more-->

## The mistakes that sink migrations

Every bad M365 migration I've cleaned up shares at least two of these problems:

**No project owner.** Someone has to own the timeline, the checklist, and the communication to staff. If "everyone" is responsible, nobody is. Pick one person. That person doesn't have to be technical, they just need to keep things moving and be the single point of contact.

**No data cleanup before migration.** You're paying per-user licensing. Why migrate 47 inactive accounts, 200GB of PST files from 2009, and three shared mailboxes nobody uses? Clean house first. Disable old accounts, archive what you need, and delete what you don't.

**Wrong license tier.** I see this constantly. Someone picks Business Basic ($6/user/mo) thinking they'll save money, then realizes half the staff needs desktop Office apps. Now you're buying Standard ($12.50/user/mo) anyway, plus dealing with a license change mid-migration. Figure out who needs what before you start.

**Rushing the cutover.** "Let's just do it this weekend" is how you end up with missing email, broken calendars, and a Monday morning full of angry phone calls. A proper migration takes weeks, not days.

## The phased approach that actually works

### Phase 1: Planning (2-4 weeks)

This is where most of the real work happens:

- Inventory every mailbox, shared mailbox, distribution list, and alias
- Document current email routing (MX records, SPF, DKIM)
- Decide on license tiers per user (mix and match is fine)
- Clean up: disable inactive accounts, archive old data, delete junk
- Set up the M365 tenant, verify your domain, but don't change MX records yet
- Write a communication plan so staff knows what's happening and when

### Phase 2: Pilot (1-2 weeks)

Pick 5-10 users who are tech-comfortable and willing to report problems. Migrate their mailboxes first. This group should include at least one person from each department so you catch workflow issues early.

During the pilot:

- Verify email flow in both directions
- Test calendar sharing, contacts, Teams
- Confirm mobile devices connect properly
- Check that shared mailboxes and distribution lists work
- Document every issue, no matter how small

### Phase 3: Rollout (1-2 weeks)

Once the pilot is clean, roll out in waves. I typically do 15-25 users per wave with a day between waves. This gives you time to catch problems before they multiply.

For each wave:

- Migrate mailboxes (overnight or over a weekend if possible)
- Switch MX records on the final wave (this is when email starts flowing to M365)
- Deploy Outlook and Office apps
- Verify MFA enrollment for every user, no exceptions

### Phase 4: Post-migration (2 weeks)

The migration isn't done when the last mailbox moves. Give it two weeks of monitoring:

- Watch for bounced email or routing issues
- Confirm all old mail is accessible and searchable
- Verify calendar entries migrated correctly (recurring meetings are notorious for breaking)
- Decommission old mail servers only after you're confident everything is clean
- Update SPF, DKIM, and DMARC records for the new environment

## Timeline reality check

For a 20-50 person office, plan on 6-10 weeks total. I know that sounds like a lot. It's not. The companies that try to compress this into two weeks are the ones calling me six months later because half their historical email is missing and nobody can find anything in SharePoint.

## Cost planning

Beyond the monthly licensing, budget for:

- Migration tooling if you're coming from Google Workspace (BitTitan MigrationWiz runs about $15/mailbox)
- Temporary license overlap if you're running two systems during the pilot
- Staff time for training, even a 30-minute session on "where things are now" saves weeks of help desk tickets
- Your IT person's time (or your consultant's invoice) for the actual migration work

## What to do next

If you're planning an M365 migration and want to make sure it goes smoothly the first time, I can help. I've done this for offices ranging from 5 users to 500, and the process is the same every time: plan it right, execute it in phases, and don't rush.

Reach out at chris@chrisputer.tech or check out [my services](/services/) to see how I can help.
