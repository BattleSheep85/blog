+++
title = "DNS filtering: the $0 security upgrade you should have done yesterday"
date = 2025-10-23
draft = false
description = "DNS filtering blocks malware, phishing, and sketchy sites before they ever load. It's free, it takes 10 minutes to set up, and it works."
tags = ['dns', 'security', 'networking', 'small-business']
categories = ['Small Business IT']
+++

If I could only make one security change to a small business network, it would be DNS filtering. It's free (or close to it), it takes less than 10 minutes to implement, it requires zero software installed on any computer, and it blocks a massive chunk of malware, phishing, and other garbage before it ever reaches your network. The fact that most small businesses don't have it is baffling.

<!--more-->

## How DNS filtering works

Every time someone in your office types a website address, their computer asks a DNS server to translate that name into an IP address. By default, your computers use whatever DNS server your ISP provides, which happily resolves every domain, including known malware distributors, phishing sites, and command-and-control servers.

DNS filtering replaces that default DNS with one that checks every request against a constantly updated list of known bad domains. If someone clicks a phishing link in an email, the DNS filter says "nope" and the page never loads. If malware on a workstation tries to call home to a C2 server, the DNS query fails and the malware can't communicate.

It's not a silver bullet. It won't stop every attack. But it's a massive layer of protection that costs essentially nothing.

## The best DNS filtering options

**Cloudflare Gateway (free for up to 50 users)**

This is my default recommendation for small businesses. Cloudflare's Zero Trust platform includes DNS filtering in their free tier for up to 50 users. You get malware blocking, phishing protection, and the ability to create custom block policies (block social media during work hours, block adult content, whatever you need).

Setup is simple: point your network's DNS to Cloudflare Gateway's assigned addresses, log into their dashboard, and configure your policies. You get full logging of every DNS query on your network, which is also incredibly useful for troubleshooting.

**Cisco Umbrella (formerly OpenDNS)**

Umbrella is the enterprise standard. Their database of malicious domains is one of the largest and most up-to-date. For small businesses, pricing starts around $2 to $3 per user per month. If you need compliance reporting or have strict security requirements, Umbrella is worth the cost.

For a quick-and-dirty free option, OpenDNS Home (208.67.222.222 and 208.67.220.220) still works and provides basic malware filtering, but you don't get the dashboard, logging, or custom policies.

**DNSFilter ($1/user/month)**

A good middle ground between free Cloudflare and enterprise Umbrella. Fast, accurate filtering with a clean dashboard. Popular with MSPs and IT consultants because it's easy to manage across multiple clients.

## How to implement it on MikroTik

If you're running a MikroTik router (and after reading my other posts, you probably should be), implementing DNS filtering takes two steps.

**Step 1: Change the DHCP DNS servers.**

In your DHCP server settings, change the DNS servers handed out to clients from your ISP's DNS to your filtering provider's addresses. For Cloudflare Gateway, these are the custom addresses assigned to your account. For OpenDNS, use 208.67.222.222 and 208.67.220.220.

On MikroTik, this is under IP > DHCP Server > Networks. Change the DNS Server field.

**Step 2: Block direct DNS to prevent bypass.**

Here's the step most people skip. If you only change the DHCP settings, any device can manually set its own DNS servers and bypass your filtering entirely. Chrome, Firefox, and many apps use DNS-over-HTTPS (DoH) to their own servers by default.

On MikroTik, add a firewall rule that blocks all outbound traffic on port 53 (UDP and TCP) except to your approved DNS servers. This forces every device on your network to use your filtered DNS. Here's the concept:

```
/ip firewall filter
add chain=forward protocol=udp dst-port=53 dst-address=!208.67.222.222 action=drop
add chain=forward protocol=tcp dst-port=53 dst-address=!208.67.222.222 action=drop
```

For DoH (DNS over HTTPS on port 443), you can block known DoH provider IPs or, even better, use Cloudflare Gateway which handles DoH natively within its filtering.

## What DNS filtering catches

In a typical small office, DNS filtering blocks:

- **Phishing sites.** Someone clicks a link in a fake invoice email. The site never loads.
- **Malware distribution domains.** Drive-by download sites, malvertising redirects, exploit kit landing pages.
- **Command and control traffic.** If a machine is infected, the malware can't phone home to receive instructions.
- **Typosquatting.** Misspelled versions of popular sites that host malware (gooogle.com, amazom.com, etc.)
- **Known bad ad networks.** Some DNS filters also block the sketchier ad networks that serve malvertising.

I've seen DNS filtering block dozens of malicious queries per week on small business networks where the owner thought "nobody visits bad sites." They don't have to. Malicious ads, phishing emails, and compromised legitimate sites do the work.

## What DNS filtering doesn't catch

DNS filtering only works at the domain level. It can't inspect the content of encrypted traffic. If someone visits a legitimate but compromised website, DNS filtering won't help (the domain is legitimate). It also doesn't protect against attacks that don't use DNS, like direct IP connections.

It's one layer. You still need endpoint protection, a proper firewall, user education, and regular patching. But it's one of the most effective layers for the least effort.

## What to do next

If your business network is using your ISP's default DNS, you're leaving free security on the table. This is genuinely one of those things that takes 10 minutes, costs nothing, and meaningfully reduces your risk.

If you want help setting it up, or if you want a full security assessment of your network, email me at [chris@chrisputer.tech](mailto:chris@chrisputer.tech) or visit [/services/](/services/). This is low-hanging fruit that every business should pick.
