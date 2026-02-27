+++
title = "PCI DSS 4.0 is now mandatory: what small retailers need to know"
date = 2025-10-07
draft = false
tags = ['pci', 'compliance', 'cybersecurity', 'small-business', 'retail']
categories = ['Small Business IT']
description = "PCI DSS 4.0 became mandatory on March 31, 2025. If you accept credit cards, you need to comply. Here's what changed, what it means for small retailers, and how to handle it without losing your mind."
+++

If you accept credit cards in your business, PCI DSS applies to you. Period. It doesn't matter if you're a 200-location chain or a single shop in a Wichita strip mall with one card terminal. The Payment Card Industry Data Security Standard applies, and version 4.0 became mandatory on March 31, 2025.

Most small retailers I talk to either don't know PCI DSS exists, think it only applies to big companies, or have been putting off the update because nobody's forced them to deal with it yet. That last part is changing.

<!--more-->

## What PCI DSS 4.0 changed

Version 4.0 was the first major overhaul of the standard in years, and it tightened requirements across the board. Here are the changes that matter most for small businesses:

### MFA for all access to cardholder data environments

Previous versions only required MFA for remote access. Version 4.0 requires MFA for anyone accessing the cardholder data environment (CDE), including on-site access. If your employee logs into the POS system, that login needs MFA.

For most small retailers, this means your point-of-sale system and any backend system that processes or stores card data need multi-factor authentication.

### Longer passwords

The minimum password length went from 7 to 12 characters. Every account that touches the cardholder data environment needs passwords of at least 12 characters. If your POS system has a four-digit PIN, that needs to change.

### Script monitoring on payment pages

If you do any e-commerce and have a payment page on your website, PCI DSS 4.0 requires you to monitor and control all JavaScript running on that page. This addresses "Magecart-style" attacks where attackers inject malicious scripts into payment pages to skim card numbers.

For small businesses using platforms like Shopify, WooCommerce, or Square Online, the platform handles most of this. But if you have a custom-built payment page, this requirement is on you.

### Targeted risk analysis

Instead of one-size-fits-all requirements for things like scan frequency and log review, PCI 4.0 allows you to set some frequencies based on your own risk analysis. The catch is that you have to document that analysis and justify your choices. "We scan quarterly because that's what we've always done" isn't sufficient anymore.

### Internal vulnerability scanning with authenticated scans

Quarterly internal vulnerability scans now need to include authenticated scanning (logging into systems to check from the inside, not just poking from the outside). This gives a more accurate picture but requires more effort.

## What happens if you don't comply

Non-compliance fines range from $5,000 to $100,000 per month, assessed by the card brands (Visa, Mastercard) through your acquiring bank (the bank that processes your card transactions). Your acquirer passes those fines to you.

Beyond fines, if you have a breach and you're not PCI-compliant, you're liable for fraud losses on the compromised cards. For a small retailer, that can be catastrophic.

And increasingly, cyber insurance carriers are asking about PCI compliance on their applications. Non-compliance can affect your ability to get or keep coverage.

## The good news: you're probably Level 4

PCI DSS sorts merchants into four levels based on transaction volume. Most small retailers are Level 4 (fewer than 20,000 e-commerce transactions or up to 1 million total transactions per year).

Level 4 merchants have the lightest compliance requirements:

- **Self-Assessment Questionnaire (SAQ):** You fill out a questionnaire rather than hiring a Qualified Security Assessor for an on-site audit. There are several SAQ types depending on how you process cards.
- **Quarterly external vulnerability scans:** Done by an Approved Scanning Vendor (ASV). These are automated external scans of your internet-facing systems.
- **Attestation of Compliance:** A form you sign saying you've completed the SAQ and are compliant.

## Which SAQ do you need

This is where small merchants get confused. The SAQ type depends on how you handle card data:

**SAQ A:** You don't touch card data at all. All payment processing is handled by a third party (like Square, Stripe, or a hosted payment page). This is the simplest form. If you're using Square terminals or Stripe Checkout, this is probably you.

**SAQ A-EP:** You have a website with a payment page, but the actual card processing is handled by a third-party processor. The page is on your server, but card data goes directly to the processor.

**SAQ B:** You use standalone card terminals (dial-up or cellular) that aren't connected to your network. Increasingly rare.

**SAQ B-IP:** You use network-connected card terminals that go directly to the processor. This is most small retailers with modern terminals.

**SAQ C:** You process cards through a payment application on a system connected to the internet, but don't store card data.

**SAQ D:** The catch-all. If none of the above apply, or if you store card data (please don't), you need the full SAQ D, which has hundreds of questions.

If you're not sure which SAQ applies to you, your payment processor or acquiring bank can usually tell you.

## Practical steps for a small retailer

### 1. Figure out your card data flow

Trace the path of card data through your business. Where does someone swipe, dip, or tap? Where does that data go? Does it touch your network or go straight to the processor? Does your e-commerce site handle card numbers or redirect to a payment provider?

This determines your SAQ type and tells you what's in scope for compliance.

### 2. Minimize your scope

The less card data you touch, the simpler compliance is. If you're currently keying in card numbers on your office computer, switching to standalone terminals that connect directly to the processor removes that computer from scope.

If your e-commerce site has an embedded payment form, switching to a hosted payment page (where the customer is redirected to the processor's site) can simplify compliance dramatically.

### 3. Enable MFA on your POS systems

PCI 4.0 requires this for all CDE access. Work with your POS vendor to enable MFA for login. If your system doesn't support it, that's a conversation you need to have with the vendor, or it's time to look at alternatives.

### 4. Update passwords to 12 characters minimum

Check every account that has access to card processing systems. Update passwords to meet the new 12-character minimum. Use a password manager to generate and store them.

### 5. Get your quarterly ASV scans

An Approved Scanning Vendor runs automated external vulnerability scans quarterly. These cost $100-500 per scan depending on the vendor and the number of IP addresses. Your payment processor may have a preferred ASV or include scanning in their service.

### 6. Complete your SAQ

Download the appropriate SAQ from the PCI Security Standards Council website (pcisecuritystandards.org). Go through it honestly. If you answer "no" to a requirement, that's something to fix, not something to fudge. Your acquiring bank may have a portal where you can complete the SAQ online.

### 7. Document everything

PCI 4.0 puts more emphasis on documentation. Keep records of your scan results, your SAQ responses, any compensating controls you've implemented, and your risk analyses. If you ever need to prove compliance (during a breach investigation or an insurance claim), this documentation is critical.

## What to do next

PCI compliance sounds intimidating, but for most small retailers it comes down to: use modern payment terminals that connect directly to the processor, enable MFA, use strong passwords, get quarterly scans, and complete the right SAQ. That's achievable without a dedicated compliance team.

If you want help figuring out which SAQ applies to your business, scoping your cardholder data environment, or getting your PCI documentation in order, I work with small retailers in the Wichita area on this. No scare tactics, just getting you compliant with as little pain as possible.

**Email me at chris@chrisputer.tech** or check out my [services page](/services/).
