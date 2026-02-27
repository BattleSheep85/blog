+++
title = "DNS for business owners: don't let your web guy control everything"
date = 2026-01-05
draft = false
description = "Your domain name is a critical business asset. Here's what business owners need to know about DNS, domain registration, and why you should never let one person hold the keys."
tags = ['dns', 'small-business', 'security']
categories = ['Small Business IT']
+++

I've seen this play out more times than I can count. A business owner pays their "web guy" to set up a website. The web guy registers the domain under his own account, sets up hosting, configures email, and everything works fine. Until the relationship ends. Then the business owner discovers they don't actually control their own domain name, and the web guy isn't returning calls.

Your domain name is a critical business asset. Treat it like one.

<!--more-->

## What DNS actually is (30-second version)

DNS (Domain Name System) is the phone book of the internet. When someone types yourcompany.com into a browser, DNS translates that name into the IP address of your web server. When someone sends email to you@yourcompany.com, DNS tells the sending server where to deliver it.

Without DNS working correctly, your website is unreachable and your email stops flowing. That's why this matters.

## Rule number one: own your domain registration

Your domain should be registered under a company-owned account at a reputable registrar. Not your web developer's account. Not your IT guy's personal account. Not your nephew's GoDaddy login.

**Recommended registrars:**
- Cloudflare Registrar (at-cost pricing, no markup)
- Namecheap (good pricing, solid interface)
- Google Domains (now Squarespace Domains after the acquisition)
- GoDaddy (most popular, but aggressive upselling)

**The account should:**
- Be registered with a company email address (not a personal Gmail)
- Have 2FA/MFA enabled
- Have at least two authorized contacts (so one person leaving doesn't lock you out)
- Use the company's billing information

If your domain is currently under someone else's account, get it transferred to your own. This is your #1 priority. Everything else is secondary.

## The DNS records that matter

You don't need to become a DNS expert, but you should understand what these records do so nobody can bamboozle you:

### A record and CNAME record
These point your domain name to your website. An A record maps a domain to an IP address (e.g., yourcompany.com > 203.0.113.50). A CNAME maps a domain to another domain name (e.g., www.yourcompany.com > yourcompany.com).

**Translation:** These are what make your website show up when people type your domain.

### MX record
MX (Mail Exchanger) records tell the internet where to deliver email for your domain. If you use Microsoft 365, your MX record points to Microsoft's mail servers. If you use Google Workspace, it points to Google's.

**Translation:** This is what makes your email work. Change it wrong, and email stops. Always verify MX records after any DNS change.

### TXT records (SPF, DKIM, DMARC)
These are email authentication records. They tell receiving mail servers that email claiming to be from your domain is actually legitimate.

- **SPF (Sender Policy Framework):** Lists which mail servers are allowed to send email from your domain.
- **DKIM (DomainKeys Identified Mail):** Adds a digital signature to your outgoing email that receiving servers can verify.
- **DMARC (Domain-based Message Authentication, Reporting & Conformance):** Tells receiving servers what to do with email that fails SPF or DKIM checks (quarantine it, reject it, or do nothing).

**Translation:** Without these records, anyone can send email that looks like it came from your domain. Your customers and vendors will trust it because it has your name on it. Set up all three. Your IT person or M365/Google admin can configure them.

## Security basics for your domain

### Enable registrar lock

Every reputable registrar lets you lock your domain so it can't be transferred without explicit authorization. This prevents someone from transferring your domain to another registrar without your knowledge (a real attack vector called domain hijacking).

Go to your registrar, find the domain lock setting, and turn it on. It takes 10 seconds.

### Enable two-factor authentication

Your domain registrar account should have 2FA enabled. Use an authenticator app (Microsoft Authenticator, Google Authenticator, or a hardware key like YubiKey). Not SMS, because SMS is vulnerable to SIM swapping.

If an attacker gets into your registrar account, they can redirect your website, intercept your email, and impersonate your business. 2FA stops that.

### Keep contact information current

WHOIS records (the public registration info for your domain) include contact email and phone. Make sure these are current and point to an active company email address. If your domain is about to expire and the registrar is sending renewal notices to an email address nobody checks, you could lose the domain.

### Set up auto-renewal

Domain names expire. When they do, your website and email stop working. Worse, domain squatters actively monitor expiring domains and can register yours the day it expires. Enable auto-renewal on every domain you own. Keep a valid payment method on file.

## How to check what you have

You can look up your current DNS records for free:

- **MXToolbox (mxtoolbox.com):** Enter your domain, and it shows you your MX, SPF, DKIM, DMARC, and other records.
- **WhatsMyDNS (whatsmydns.net):** Check DNS propagation from multiple locations worldwide.
- **who.is:** Look up WHOIS registration details for any domain.

Run your domain through MXToolbox right now. If you see missing SPF, DKIM, or DMARC records, those need to be fixed. If you see records you don't recognize, figure out what they are before changing anything.

## The "web guy left" recovery plan

If you're in the situation where someone else controls your domain and they're unresponsive:

1. **Check WHOIS records** to see who the domain is registered under and at which registrar.
2. **Contact the registrar directly.** If the domain is registered with your company's name and you can prove ownership (business registration, past invoices, etc.), most registrars will work with you to recover access.
3. **If the domain is registered under someone else's name**, you may need legal assistance. This is why owning the registration from day one is so important.
4. **ICANN (icann.org)** has a dispute resolution process for domain ownership conflicts, but it's slow and designed for trademark disputes, not business relationship breakdowns.

## What to do next

Take 15 minutes and check three things: who controls your domain registration, whether 2FA is enabled on that account, and whether your SPF/DKIM/DMARC records are in place. If any of those answers concern you, fix them now.

If you need help getting your DNS and domain situation sorted out, I can audit what you have and make sure everything is under your control and properly secured.

Reach out at chris@chrisputer.tech or visit [my services page](/services/) to get started.
