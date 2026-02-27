+++
title = "What should your small business spend on IT?"
date = 2026-01-11
draft = false
description = "Industry benchmarks say 4-7% of revenue, but what does that actually look like for a 15-person office? Here's a real breakdown with real numbers."
tags = ['small-business', 'budget']
categories = ['Small Business IT']
+++

"What should we be spending on IT?" is the question I get most often from small business owners, usually right after something breaks and they realize they've been underinvesting for years. The honest answer is that it depends on your industry, your size, and your risk tolerance. But there are solid benchmarks, and I can give you real numbers.

<!--more-->

## The benchmarks

Industry research consistently puts IT spending for small businesses at 4-7% of gross revenue. Companies under $5 million in revenue tend to spend on the higher end of that range (average 6.9%) because there's a baseline cost to IT regardless of company size. You still need email, you still need a network, you still need security, whether you have 10 employees or 100.

For context:

- A $1M revenue company spending 6% = $60,000/year on IT
- A $3M revenue company spending 5% = $150,000/year on IT
- A $5M revenue company spending 4.5% = $225,000/year on IT

These numbers include everything: hardware, software, licenses, services, staff time, internet, phones, and security tools.

## What it looks like for a 15-person office

Let's build a realistic IT budget for a 15-person professional services company (accounting firm, law office, insurance agency, consulting firm) with about $2M in annual revenue.

### Monthly recurring costs

| Item | Monthly Cost | Notes |
|---|---|---|
| Microsoft 365 licenses | $225-330 | Mix of Basic, Standard, Premium |
| Internet (business class) | $150-300 | Redundant connection recommended |
| Business phone system | $225-375 | Teams Calling or VoIP |
| Managed security (EDR/antivirus) | $75-150 | SentinelOne, Huntress, or similar |
| Backup solution | $100-200 | Cloud backup for M365 and endpoints |
| Password manager | $60-80 | Bitwarden or 1Password Teams |
| Patch management | $0-50 | Action1 free tier or Intune |
| Domain and DNS | $15-25 | Annual cost divided monthly |
| **Monthly recurring total** | **$850-1,510** | |

### Annual costs (divided monthly for budgeting)

| Item | Annual Cost | Monthly Equivalent |
|---|---|---|
| Hardware replacement (3-4 PCs/yr) | $2,400-4,800 | $200-400 |
| Hardware upgrades (SSD/RAM) | $200-400 | $17-33 |
| Cyber insurance | $1,200-3,600 | $100-300 |
| IT consulting/support | $6,000-18,000 | $500-1,500 |
| Training and awareness | $500-1,500 | $42-125 |
| Miscellaneous (cables, peripherals, etc.) | $600-1,200 | $50-100 |
| **Annual costs (monthly equivalent)** | | **$909-2,458** |

### Total monthly IT spend: approximately $1,760-3,968

Let's call it roughly **$2,900-3,400/month** for a typical 15-person office, or **$35,000-41,000/year**.

At $2M revenue, that's about 1.75-2% of revenue, which is actually on the low end of benchmarks. This is a lean but functional IT budget that covers the essentials without gold-plating anything.

## Where small businesses under-spend

### Security

The average cost of a data breach for small and mid-size businesses is $120,000-150,000. That includes incident response, legal fees, regulatory fines, notification costs, and lost business. Many small businesses never recover. About 60% of small businesses that experience a significant breach close within six months.

Spending $150-300/month on security tools (EDR, email protection, backup, password manager) is cheap insurance compared to a six-figure incident.

### Backup

"We use OneDrive, so we're backed up." No, you're not. OneDrive is file sync, not backup. If ransomware encrypts your files, OneDrive syncs the encrypted versions to the cloud. If someone deletes a SharePoint library, it goes to the recycle bin for 93 days and then it's gone forever.

A proper backup solution for M365 (Veeam Backup for Microsoft 365, Datto SaaS Protection, or similar) costs $3-5/user/month and gives you independent, restorable backups that you control. For 15 users, that's $45-75/month. Cheap.

### IT labor

Trying to save money by having "the person who's good with computers" manage IT is penny-wise and pound-foolish. That person has a real job to do, they're not keeping up with security threats, and they don't know what they don't know.

Options for IT support:

- **Break/fix consulting:** $100-175/hour, pay only when you need help. Works for very small businesses with simple environments.
- **Managed Service Provider (MSP):** $100-200/user/month for monitoring, maintenance, help desk, and security. More predictable costs, proactive support.
- **Fractional IT / virtual CIO:** A consultant who manages your IT strategy 5-10 hours/month. Good for businesses that need direction but not full-time IT staff.
- **Full-time IT hire:** $55,000-85,000/year salary plus benefits. Makes sense when you have 50+ employees or complex infrastructure.

For most 10-25 person businesses, a combination of an MSP or consultant plus vendor support handles everything without the cost of a full-time hire.

## Where small businesses over-spend

### Software nobody uses

Audit your SaaS subscriptions annually. I guarantee you're paying for at least one tool nobody has logged into in six months. CRM trials that became paid subscriptions, project management tools that got abandoned, duplicate services that do the same thing. A quick audit usually finds $100-300/month in waste.

### Premium plans you don't need

M365 Business Premium for the entire company when half your staff only needs Basic. Zoom Pro licenses for people who join two calls a month. Upgraded tiers of SaaS tools where the free or basic tier does everything you actually need. Right-size your licenses.

### On-premises infrastructure

If you're still running a physical server for file sharing, a small Exchange server, or a WSUS box, add up the total cost: hardware replacement every 5-7 years, maintenance contracts, electricity, the IT time to patch and manage it, and a UPS/battery backup. For most small businesses, cloud services replaced on-premises infrastructure years ago and cost less in total.

## The budget conversation you need to have

IT is not an expense you minimize. It's infrastructure you invest in. The business owner who says "we spend as little as possible on IT" is the same one who calls me in a panic when ransomware hits or their server dies with no backup.

The goal isn't to spend the most or the least. It's to spend the right amount on the right things:

1. Security first (MFA, backup, endpoint protection, email security)
2. Productivity second (reliable hardware, proper licensing, working network)
3. Nice-to-haves last (fancy monitors, standing desks, the latest laptops for everyone)

## What to do next

If you've never built a proper IT budget, or if your current spending feels random, I can help you figure out where your money is going, where the gaps are, and what a right-sized IT budget looks like for your business.

Reach out at chris@chrisputer.tech or visit [my services page](/services/) to get started.
