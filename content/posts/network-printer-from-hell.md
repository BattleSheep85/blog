+++
title = "The network printer from hell (and how to fix it)"
date = 2025-11-06
draft = false
description = "Network printers are the bane of every office. Here's why they break, why scan-to-folder stopped working, and how to actually fix them."
tags = ['printers', 'networking', 'small-business', 'troubleshooting']
categories = ['Small Business IT']
+++

If you've worked in an office, you've fought with a network printer. It disappears from the network for no reason. Scan-to-folder stopped working after a Windows update. It prints from one computer but not another. Half the office uses the wrong driver and gets garbled output. Printers are the single most complained-about piece of technology in every office I've ever walked into, and most of the problems are fixable with basic network hygiene that nobody bothers to do.

<!--more-->

## Why printers are such a nightmare

Printers sit at the intersection of everything that can go wrong in IT. They need networking (wired or wireless), drivers (often terrible), protocols (SMB, FTP, SMTP, IPP), firmware (rarely updated), and they're used by everyone regardless of technical ability. The vendors ship them with auto-discovery enabled, WiFi on by default, and a web interface protected by no password.

On top of that, printer firmware development seems to be about five years behind everything else in IT. Printers ship with outdated protocol support, insecure defaults, and drivers that haven't been modernized since Windows 7. They're the legacy devices of the office world, and every time Microsoft updates Windows, something breaks.

## The SMBv1 disaster

If your scan-to-folder suddenly stopped working, this is almost certainly why.

SMBv1 (Server Message Block version 1) is the ancient file-sharing protocol that printers have used for scan-to-folder for decades. It's also riddled with security vulnerabilities and was the protocol exploited by WannaCry, NotPetya, and other devastating ransomware attacks.

Microsoft has been disabling SMBv1 progressively:
- Windows 10 (later builds): disabled by default on clean installs
- Windows 11: removed entirely on clean installs
- Windows 11 24H2: aggressively removes SMBv1 even on upgrades
- Windows Server 2022 and 2025: disabled by default

When SMBv1 goes away, your printer can no longer write scanned documents to a shared folder on your Windows machine. The printer supports SMBv1 and nothing newer. The scan fails silently or throws a cryptic error that nobody can decipher.

**How to fix scan-to-folder:**

1. **Check if your printer supports SMBv2/v3.** Some newer multifunction printers have firmware updates that add SMBv2 support. Check the manufacturer's website. If an update exists, install it.

2. **Switch to FTP or SMTP.** If your printer can't do SMBv2, set up scan-to-FTP using a lightweight FTP server (FileZilla Server is free) or scan-to-email using your mail server or a relay. Both bypass SMB entirely.

3. **Don't re-enable SMBv1.** You'll find forum posts telling you to re-enable SMBv1 on your Windows machines. Don't do this. It's a serious security risk. SMBv1 is disabled for good reason. Find a workaround instead.

4. **Consider a print server appliance.** Some businesses use a small device or VM running a scan service that accepts scans over a supported protocol and drops them into folders. It adds complexity, but it solves the problem permanently.

## Give the printer a static IP

This is the single most impactful fix for printers that "disappear" from the network. By default, printers get their IP address from DHCP. The address can change when the printer reboots, when the lease expires, or when the DHCP server restarts. When the IP changes, every computer that was configured to print to the old IP can no longer reach the printer.

**Fix it:** Assign the printer a static IP address. Do this either in the printer's web interface (type its current IP into a browser) or by creating a DHCP reservation on your router so the printer always gets the same address. I prefer DHCP reservations because they're managed centrally on the router and easier to document.

Use an IP outside your DHCP pool range, or within the pool as a reservation. Common convention: put printers at the high end of the range (like 192.168.1.240 to 192.168.1.250) so they're easy to identify.

## Wire the printer

WiFi printers are convenient for home. In an office, wire them. Always.

WiFi printers lose connection when they go to sleep and don't always reconnect properly. They compete for WiFi bandwidth with your actual work devices. They often connect to the 2.4 GHz band, which is the most congested. And WiFi adds latency that makes large print jobs slower.

A printer plugged into a wired ethernet port is always on the network, always reachable, and always at full speed. Run a cable and disable the WiFi radio on the printer. Your printing problems will drop by 50% overnight.

## Use universal print drivers

Every printer manufacturer has their own driver, and they're all varying degrees of terrible. HP's driver installer used to try to install a full software suite with a toolbar and cloud printing service. Brother's drivers are better but there are dozens of slightly different versions. Ricoh's driver names read like part numbers from an airplane.

For office environments, use the manufacturer's universal print driver (UPD) instead of the model-specific one. HP, Ricoh, Brother, and Canon all have universal drivers that work with most of their printers. One driver covers the whole fleet. When you replace a printer, the same driver usually works with the new one.

For a really clean setup, use Windows' built-in IPP (Internet Printing Protocol) driver. Modern printers support IPP, and Windows can install an IPP printer without downloading anything from the manufacturer. It handles basic printing and scanning well, though you might miss some model-specific features.

## Put printers on their own VLAN

This sounds excessive, but hear me out. Printers are some of the most vulnerable devices on your network. Their firmware is outdated, they run embedded web servers, they have default credentials, and nobody patches them. Printers have been used as pivot points in network attacks more times than the industry likes to admit.

Putting printers on a separate VLAN with firewall rules that only allow printing protocols (IPP on port 631, RAW on port 9100) from your corporate VLAN, and blocking everything else, limits the damage a compromised printer can do. It can't be used to scan your network, access your file shares, or move laterally.

This is especially important if your printers have hard drives (most large multifunction units do) that store copies of everything scanned and printed. If a printer is compromised, that data is accessible.

## The "just buy a new one" trap

When a printer starts acting up, the temptation is to buy a new one. And sometimes that's the right call if the printer is 10+ years old. But buying a new printer doesn't fix the underlying network issues. If you didn't set up the old printer properly (no static IP, WiFi, wrong drivers), the new one will develop the same problems within weeks.

Fix the fundamentals first: static IP, wired connection, universal driver, current firmware. Then evaluate whether the hardware itself is actually the problem.

## What to do next

If your office printer is making everyone miserable, there's a good chance the fix is network configuration, not new hardware. Static IPs, wired connections, proper drivers, and VLAN segmentation solve the vast majority of printer headaches.

I help small businesses tame their printing nightmares as part of network cleanup and assessments. Reach out at [chris@chrisputer.tech](mailto:chris@chrisputer.tech) or visit [/services/](/services/) and let's sort it out.
