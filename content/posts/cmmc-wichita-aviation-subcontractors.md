+++
title = "CMMC 2.0 for Wichita aviation subcontractors: the clock is ticking"
date = 2025-09-05
draft = false
description = "The CMMC 2.0 final rule is live and Wichita aviation subcontractors need to get compliant. Here's the timeline, what Level 2 requires, and how to start preparing now."
tags = ["cmmc", "compliance", "wichita", "manufacturing", "cybersecurity"]
categories = ["Small Business IT"]
+++

Wichita is the Air Capital of the World for a reason. Over 50,000 manufacturing jobs, a massive subcontractor network feeding into Spirit AeroSystems, Textron, Airbus, Bombardier, and dozens of other primes. If you're a machine shop, electronics manufacturer, or engineering firm in the Wichita area doing any defense-related work, CMMC 2.0 is coming for you. The final rule went into effect November 10, 2025, and the compliance timeline is shorter than most people think.

If you're still hoping this goes away or gets delayed again, I'd stop hoping. The DoD has been building toward this for years, and this time they mean it.

<!--more-->

## What CMMC actually is

The Cybersecurity Maturity Model Certification (CMMC) is the Department of Defense's framework for making sure contractors and subcontractors properly protect sensitive information. Specifically, it covers two types of data:

- **Federal Contract Information (FCI):** Basic info related to a government contract that isn't public.
- **Controlled Unclassified Information (CUI):** The more sensitive stuff. Think engineering drawings, technical specifications, and test data that could give adversaries an advantage.

If you handle CUI (and most Wichita aviation subcontractors do), you need CMMC Level 2. That means implementing all 110 security controls from NIST SP 800-171 and passing a third-party assessment by a Certified Third-Party Assessment Organization (C3PAO).

## The timeline you need to know

Here's the phased rollout:

- **Phase 1 (December 2024):** Self-assessments for Level 1 and some Level 2 contracts. This is happening now.
- **Phase 2 (November 2026 to November 2027):** CMMC Level 2 certification required in new DoD contracts. Third-party assessments become mandatory.
- **Phase 3 (November 2027 to November 2028):** Level 2 required in option periods on existing contracts.
- **Full implementation (November 2028):** CMMC applies to all applicable contracts.

The critical date for most Wichita subcontractors is Phase 2: starting around November 2026, new contracts will require you to have your Level 2 certification in hand. There is no grace period at time of award. If you don't have it, you don't get the contract. Period.

## Why Wichita shops can't afford to wait

I've talked to machine shop owners and small manufacturers around Wichita who figure they'll deal with CMMC when their prime tells them to. That's a dangerous gamble for a few reasons:

**The assessment backlog is real.** There are a limited number of C3PAOs authorized to conduct assessments, and the demand is going to spike hard in 2026. If you wait until summer 2026 to start, you might not be able to schedule an assessment in time for a fall contract requirement.

**Remediation takes longer than you think.** Most shops I've seen need 6 to 12 months of work to go from "we have antivirus and a firewall" to actually meeting all 110 NIST 800-171 controls. You'll likely need new policies, network changes, access controls, logging and monitoring, encryption, and staff training.

**Your primes will start asking.** The big primes in Wichita are already surveying their supply chains. Spirit, Textron, and others need their subcontractors compliant so they can be compliant. If you can't demonstrate progress toward CMMC, you might lose work to a competitor who can.

## What Level 2 actually requires

NIST 800-171 covers 14 control families. Here's a plain-English summary of the big ones that trip up small manufacturers:

**Access Control:** Who can access what? Role-based permissions, not everyone logged in as admin on a shared computer.

**Audit and Accountability:** Logging. You need to know who accessed CUI, when, and what they did. And you need to keep those logs for a defined period.

**Configuration Management:** Documented baselines for your systems. No more "Dave set up the server three years ago and nobody knows the password."

**Identification and Authentication:** MFA on all accounts that access CUI. Strong passwords. No shared accounts.

**Incident Response:** A written plan for what happens when something goes wrong. Who do you call? What do you contain? How do you report to the DoD?

**Media Protection:** How do you handle USB drives, hard drives, and printed documents with CUI? Encryption at rest, proper disposal, tracking.

**System and Communications Protection:** Encryption in transit, network segmentation, boundary protection. CUI on its own VLAN, not on the same network as the break room TV.

## What it costs

I'll be straight with you. CMMC compliance isn't cheap for a small shop. You're looking at:

- **Gap assessment:** $5,000 to $15,000 to figure out where you stand.
- **Remediation:** $20,000 to $100,000+ depending on how far you need to go. This includes hardware, software, policy development, and implementation.
- **C3PAO assessment:** $20,000 to $50,000+ for the actual certification audit.
- **Ongoing maintenance:** Annual costs for monitoring, training, and recertification prep.

That's real money for a 20-person machine shop. But losing your defense contracts is a lot more expensive. And the good news is that many of these security improvements protect your business from threats that exist whether the DoD requires them or not.

## How to get started

If you're a Wichita aviation subcontractor and you haven't started your CMMC journey yet, here's what to do right now:

1. **Figure out your scope.** What CUI do you handle? Where does it live? What systems touch it? The smaller your CUI boundary, the cheaper compliance gets.
2. **Run a self-assessment.** Score yourself against NIST 800-171 using the DoD's scoring methodology. Be honest. A Plan of Action and Milestones (POA&M) is allowed, but you can't have critical gaps.
3. **Build your System Security Plan (SSP).** This is the foundational document. It describes your environment, your controls, and how you protect CUI.
4. **Start remediating.** Fix the gaps, starting with the highest-impact items: MFA, encryption, access controls, logging.
5. **Schedule your C3PAO assessment early.** Don't wait until the last minute when everyone else is scrambling.

## What to do next

If you're a Wichita manufacturer or aviation subcontractor trying to figure out CMMC, I can help you understand where you stand and what needs to happen. I do gap assessments, help build SSPs, and work with you on remediation planning so you're not scrambling when the contract language changes.

Reach out at [chris@chrisputer.tech](mailto:chris@chrisputer.tech) or visit my [services page](/services/) to learn more. The clock is ticking, and the shops that start now will be the ones that keep winning contracts.
