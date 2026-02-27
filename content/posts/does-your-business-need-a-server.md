+++
title = "Does your small business actually need a server?"
date = 2025-12-08
description = "Not every small business needs a server. Some do. Here's how to figure out which camp you're in, and why the hybrid approach often costs less than going all-cloud."
draft = false
tags = ['server', 'cloud', 'small-business']
categories = ['Small Business IT']
+++

"Should we get a server or just use the cloud?" I get this question from almost every new small business client. The IT industry pushes cloud-everything pretty hard, and the server vendors push on-premises just as hard. The honest answer is that it depends on what you do, and for a lot of businesses, the hybrid approach actually costs less than either extreme.

<!--more-->

## When you probably don't need a server

If all of the following are true, you can likely run your entire business without an on-premises server:

**You're fully remote or don't have a central office.** No office means nowhere to put a server, and cloud services work from anywhere.

**All your applications are SaaS.** Email is Microsoft 365 or Google Workspace. Accounting is QuickBooks Online. CRM is Salesforce or HubSpot. Project management is Asana or Monday. If every tool your team uses runs in a web browser, there's nothing to host locally.

**You have fewer than 10 people.** At small team sizes, the overhead of maintaining a physical server (hardware, patching, cooling, power, backup) often exceeds the benefit. The per-user cost of cloud services is more predictable and easier to manage.

**Your internet is reliable.** Cloud-only means internet-dependent. If your connection drops, your business stops. If you're in an area with reliable fiber and can get a backup cellular connection, this risk is manageable. If you're on a flaky DSL line, cloud-only is a gamble.

## When you definitely need a server

Any of these scenarios means you need something on-premises:

**Line-of-business applications that require a local SQL Server or Windows Server.** Many industry-specific applications (medical practice management, legal case management, accounting packages, manufacturing ERP systems) still require a local server. The vendor says "install on Windows Server with SQL Server," and that's what you need to do.

**Large local datasets.** If your team works with large files (architectural drawings, video production, engineering models, large databases), cloud storage becomes painful. Uploading and downloading gigabytes of files over the internet every day is slow and expensive. A local server with fast storage is dramatically better for this use case.

**Compliance requirements.** Some industries and some insurance policies require that certain data stays on infrastructure you control. HIPAA, CMMC, certain state regulations. While compliant cloud hosting exists, it's often more expensive than managing it locally.

**Unreliable internet.** If your internet goes out for half a day and your team can't work because everything is in the cloud, that's a problem a local server solves. Critical applications running locally keep people productive even when the internet is down.

**You need Active Directory.** If you're managing more than a handful of Windows workstations, group policy, shared drives, and centralized authentication through Active Directory Domain Services makes life dramatically easier. Azure AD (now Entra ID) handles some of this, but many environments still need an on-premises domain controller.

## The cost comparison

Let me run real numbers for a 20-person office.

### All-cloud scenario

- Microsoft 365 Business Premium: $22/user/month = $5,280/year
- Cloud file storage beyond M365 limits: $50 to $100/month = $600 to $1,200/year
- Cloud-hosted LOB application (if applicable): $100 to $250/month = $1,200 to $3,000/year
- Cloud backup for M365: included in Veeam Community (10 users) or ~$4/user/month for the rest

**Total: roughly $7,200 to $9,600 per year, recurring.**

### Hybrid scenario (local server + cloud for email/collaboration)

- Microsoft 365 Business Basic: $6/user/month = $1,440/year (email, Teams, basic OneDrive)
- Physical server hardware (Dell PowerEdge, refurb or entry-level): $2,000 to $4,000 one-time, amortized over 5 years = $400 to $800/year
- Windows Server 2025 Standard + CALs: ~$2,056 one-time, amortized = ~$411/year
- Local NAS for backup: ~$1,200 one-time, amortized = ~$240/year
- Backblaze B2 for offsite: ~$144/year
- Veeam Community Edition: free
- Electricity and cooling: ~$300 to $600/year

**Total: roughly $3,000 to $4,000 per year.**

The hybrid approach often costs 40 to 50% less than all-cloud because you're not paying premium monthly rates for services that work fine on local hardware. Email and collaboration go to the cloud (where they belong). File storage, LOB applications, and Active Directory stay local (where they perform best and cost less).

## The hybrid sweet spot

For most 20-person offices, the hybrid model looks like this:

**In the cloud:**
- Email and calendar (Microsoft 365)
- Video conferencing and chat (Teams)
- Cloud-native apps (CRM, project management)
- Offsite backup (Backblaze B2)

**On-premises:**
- File server with fast local storage
- Line-of-business application server
- Active Directory domain controller
- Backup infrastructure (NAS + Veeam)
- Print server (if needed)

This gives you the collaboration benefits of cloud services, the performance and cost benefits of local infrastructure, and a backup strategy that covers both.

## The hidden costs of cloud-only

Cloud advocates tend to leave out a few things:

**Bandwidth costs.** If 20 people are pulling large files from cloud storage all day, your internet bill goes up. You might need to upgrade from 100 Mbps to 500 Mbps or gigabit, which adds $100 to $300 per month.

**Productivity loss from latency.** Opening a 50MB file from a local server takes 1 second. Opening it from SharePoint takes 15 to 30 seconds. Multiply that by 20 people, dozens of times per day. It adds up.

**Vendor lock-in.** Once your entire business runs on one cloud provider's stack, switching is painful and expensive. At least with hybrid, your most critical data and applications are on hardware you control.

**Price increases.** Cloud providers raise prices. Microsoft has increased M365 pricing multiple times. Your on-premises server doesn't get more expensive after you buy it.

## What to do next

The right answer depends on your specific business, your applications, your team size, and your internet reliability. I can assess your current setup, run the real cost comparison for your situation, and recommend the approach that saves you money while keeping your data safe.

Email me at chris@chrisputer.tech or visit [/services/](/services/) to figure out the right fit.
