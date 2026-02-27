+++
title = "Your vendor got hacked: supply chain attacks and small businesses"
date = 2025-10-05
draft = false
tags = ['cybersecurity', 'small-business', 'supply-chain']
categories = ['Small Business IT']
description = "30% of breaches are now linked to third-party vendors, and small businesses make up over 70% of breach victims. Here's how supply chain attacks work and what you can do about them."
+++

You did everything right. MFA is on, backups are solid, your team passed their phishing training. Then your accounting software vendor gets breached and the attackers push a malicious update to every customer, including you. Your security didn't fail. Someone else's did. And you paid the price.

This is a supply chain attack, and it's become the most common way small businesses get hit without doing anything wrong themselves.

<!--more-->

## How bad is it

About 30% of all data breaches are now linked to third-party vendors. Small and mid-size businesses account for 70.5% of breach victims, and a big chunk of those come through the supply chain. Multiple security reports are flagging supply chain attacks as the number one global cyber threat heading into 2026.

The logic is simple from an attacker's perspective. Why attack 1,000 small businesses individually when you can hack one software vendor and compromise all 1,000 at once?

## Real examples that hit small businesses

**SolarWinds (2020)** is the one everyone knows. Attackers compromised SolarWinds' build process and pushed malicious code through a routine software update. Thousands of organizations, including small businesses that used SolarWinds for network monitoring, were affected.

**Kaseya (2021)** hit closer to home for small businesses. Kaseya makes remote management software used by MSPs (managed service providers). The attackers exploited a vulnerability in Kaseya VSA to push ransomware to every business those MSPs managed. Small businesses that had outsourced their IT to an MSP got ransomware through the very tool that was supposed to protect them.

**MOVEit (2023)** compromised a file transfer platform used by thousands of organizations. Attackers exploited a vulnerability to steal data from every organization using the platform. Many small businesses that used MOVEit for transferring files with larger partners found their data exposed.

**3CX (2023)** was a supply chain attack on a supply chain attack. Attackers compromised a media encoding library, which then compromised the 3CX desktop phone application. Any business running 3CX (a popular VoIP platform for small businesses) was potentially affected.

These aren't edge cases. This is the pattern now.

## Why small businesses are especially vulnerable

**You don't get to choose your vendor's security.** Your 15-person office doesn't have the leverage to audit your software vendor's security practices. You trust that they're handling it, and that trust is the vulnerability.

**You have less visibility.** Large enterprises have security operations centers that might detect unusual behavior from a compromised vendor tool. Small businesses typically have no monitoring that would catch a legitimate application behaving maliciously.

**Your MSP is a single point of failure.** If you've outsourced your IT to a managed service provider, and that MSP gets compromised, the attacker has the same access to your network that the MSP does. That's usually full admin access to everything.

**You don't control the update cycle.** When your vendor pushes an update, it often installs automatically. The whole point of automatic updates is that you don't have to think about them. But that automatic trust is exactly what supply chain attacks exploit.

## What you can actually do

You can't prevent your vendor from getting hacked. But you can limit the damage and respond faster.

### Know what software you're running

You can't defend what you can't see. Make an inventory of every piece of software, every cloud service, every vendor connection to your network. Include the obvious stuff (Microsoft 365, QuickBooks, your antivirus) and the less obvious stuff (that firmware update tool on the printer, the plugin your POS system uses, the monitoring agent your MSP installed).

This doesn't have to be fancy. A spreadsheet works. The point is that when a vendor announces a breach, you can immediately tell whether you're affected.

### Limit vendor access

Does your HVAC company need full network access, or just access to the thermostat system? Does your MSP need domain admin on every server, or can they work with more limited permissions?

The principle of least privilege applies to vendors too. Every vendor connection should have the minimum access required for what they do. If a vendor gets compromised, limited access means limited damage.

### Segment your network

If your network is flat (everything on the same subnet), a compromised vendor tool on one machine can reach everything. If your network is segmented, the damage stays contained to the segment that was affected.

VLANs and firewall rules between segments are the practical tools here. Your point-of-sale system should be on a separate segment from your office workstations. Your IoT devices should be isolated. Your servers should not be directly reachable from every workstation.

### Monitor for unusual behavior

You don't need a full security operations center. But you do need some visibility into what's happening on your network. EDR tools like Microsoft Defender for Business or SentinelOne can flag unusual behavior from applications, including legitimate applications doing things they shouldn't.

If your accounting software suddenly starts reaching out to an IP address in Eastern Europe, that's something an EDR tool can catch.

### Have an incident response plan that includes vendor breaches

Your incident response plan should have a section for "a vendor we use announced a breach." The steps are different from a direct attack:

1. Determine if you're affected (check your software inventory)
2. Isolate the affected software or system
3. Contact the vendor for guidance
4. Check for indicators of compromise (the vendor usually publishes these)
5. Notify your cyber insurance carrier
6. Change credentials for anything the compromised software had access to

### Ask your MSP hard questions

If you use a managed service provider, ask them:

- How do they secure their remote access tools?
- Do they use MFA for their admin access to your systems?
- What happens if their tools get compromised?
- Do they have cyber insurance?
- What's their incident response plan?

These aren't confrontational questions. A good MSP will have answers ready. If they get defensive or vague, that's information too.

## You can't eliminate the risk

I want to be honest about this. You cannot fully prevent supply chain attacks. You can't control your vendors' security. You can't stop using software. The risk is inherent in doing business with technology.

What you can do is limit the blast radius. Segment your network so one compromised tool doesn't mean total compromise. Limit vendor access so a breach of one vendor doesn't give attackers the keys to everything. Monitor for anomalies so you catch it faster. Have a plan so you're not figuring things out during a crisis.

## What to do next

If you're not sure how exposed you are through your vendors, or you want help inventorying your software, segmenting your network, or putting together an incident response plan that covers supply chain scenarios, I work with small businesses in the Wichita area on exactly this.

**Email me at chris@chrisputer.tech** or visit my [services page](/services/).
