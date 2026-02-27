+++
title = "Replacing your office phones with Microsoft Teams"
date = 2025-12-26
draft = false
description = "Microsoft Teams Phone hit 26 million PSTN users in 2025. Here's how it works, what it costs, and whether it makes sense for your small office."
tags = ['microsoft-365', 'teams', 'phones', 'small-business']
categories = ['Small Business IT']
+++

That phone system sitting in your server closet is probably aging out, and the company that sold it to you might not even exist anymore. Traditional PBX systems are expensive to maintain, painful to expand, and tied to physical hardware that fails. Microsoft Teams Phone has grown to over 26 million PSTN users in 2025 (up about 30% from the prior year), and for good reason. For a 10-20 person office, it's usually the simplest and most cost-effective replacement.

Here's how it works and what it actually costs.

<!--more-->

## What Teams Phone actually is

Microsoft Teams Phone is a cloud-based phone system built into Microsoft Teams. It lets you make and receive regular phone calls (to cell phones, landlines, anyone) using your Teams app on your computer, your desk phone, or your mobile phone. You get a real phone number, a real dial tone, voicemail, call forwarding, auto-attendants, call queues, and everything else you'd expect from a business phone system.

The key difference: there's no hardware in your closet. The entire phone system runs in Microsoft's cloud. You manage it from the Teams admin center.

## The three ways to connect Teams to the phone network

Teams Phone needs a way to connect to the public phone network (PSTN) so you can dial real phone numbers. There are three options:

### Microsoft Calling Plans (simplest)

Microsoft provides the phone numbers and the PSTN connectivity. Everything is managed in the Teams admin center. No third-party provider, no SIP trunks, no configuration headaches.

- Domestic calling plan: ~$15/user/month
- Pay-as-you-go: ~$0.013/minute (good for users who rarely make calls)
- Includes a phone number for each user
- Setup time: hours, not days

For a 10-20 person office that makes mostly domestic calls, this is the right answer. It's simple, it works, and you manage everything in one place.

### Operator Connect

A certified telecom carrier provides the PSTN connectivity, but you manage it through the Teams admin center. You pick a carrier (AT&T, Verizon, Lumen, dozens of regional providers), and they light up the connection.

- Pricing varies by carrier (typically $10-20/user/month)
- Good if you have an existing carrier relationship or need specific features
- Number porting is handled by the carrier
- More options for international calling

This makes sense if you have a specific carrier requirement or if Microsoft Calling Plans don't cover your region well.

### Direct Routing

You connect your own Session Border Controller (SBC) to Teams, using any SIP trunk provider you want. Maximum flexibility, maximum complexity.

- Requires an SBC (hardware or virtual, $500-5,000+)
- Requires someone who understands SIP trunking
- Best for large organizations or complex routing requirements
- Lowest per-minute costs if you have high call volume

For small businesses, Direct Routing is almost always overkill. The cost and complexity of maintaining an SBC eliminates any savings from cheaper SIP trunks.

## What it costs for a typical small office

Let's price out a 15-person office on Microsoft Calling Plans:

**Licensing:**
- Teams Phone license: included with M365 Business Premium ($22/user/mo), or $8/user/month as an add-on to other plans
- Domestic Calling Plan: ~$15/user/month

**If you're already on Business Premium:**
15 users x $15/mo (calling plan only) = $225/month

**If you're on Business Standard and need to add phone:**
15 users x ($8 + $15) = $345/month for the phone add-on and calling plan

**Hardware (optional):**
- Teams-certified desk phones: $100-400 each (Yealink T55A is solid at ~$200)
- You don't need desk phones. Most users are fine with the Teams app on their PC plus the Teams mobile app.
- Common approach: desk phones for the receptionist and conference rooms, software client for everyone else

**Compare to your current phone system:**
- Traditional PBX maintenance contract: $100-300/month
- Analog phone lines: $30-50/line/month (15 lines = $450-750/month)
- Plus the eventual hardware replacement cost ($5,000-15,000)

For most small offices, Teams Phone is cheaper than what you're paying now, and it comes with features your old PBX never had.

## Features that matter for small business

**Auto-attendant:** "Press 1 for sales, 2 for support." You can set this up in the Teams admin center in about 15 minutes. No more paying your phone vendor $500 to change the menu.

**Call queues:** Route incoming calls to a group of people. First available picks up. Great for sales or support teams.

**Voicemail transcription:** Voicemails show up in Teams and Outlook as audio files with text transcriptions. No more dialing in to check voicemail.

**Call forwarding and simultaneous ring:** Ring your desk phone and mobile at the same time. Or forward calls to a colleague when you're out.

**Number porting:** You can keep your existing business phone numbers. Microsoft handles the port from your old carrier. It usually takes 2-4 weeks.

## What to watch out for

**Emergency calling (E911).** Teams Phone supports E911, but you need to configure emergency addresses for each location. For a single office, this is straightforward. For remote workers, make sure they've registered their home address.

**Internet dependency.** Your phone system now depends on your internet connection. If your internet goes down, your phones go down. For most offices, this is fine because internet is reliable enough and calls can fail over to the Teams mobile app on cellular. But if you're in an area with unreliable internet, factor that in.

**Fax machines.** Yes, people still fax. Teams Phone doesn't support traditional fax. You'll need an online fax service (eFax, RingCentral Fax, etc.) or a fax ATA adapter. This is usually a $10-15/month add-on.

**Elevator and alarm lines.** These analog lines need to stay analog. You can't put your fire alarm panel on Teams. Budget for keeping 1-2 analog lines for these purposes.

## My recommendation

For a 10-20 person office already on Microsoft 365: go with Teams Phone and Microsoft Calling Plans. It's the simplest option, it integrates with everything you already use, and the total cost is almost always less than your current phone system.

Buy desk phones for the front desk and conference rooms. Everyone else uses the Teams app.

## What to do next

If your phone system is aging out and you want to see whether Teams Phone makes sense for your office, I can do a quick assessment and give you real numbers. No pressure, no sales pitch, just math.

Reach out at chris@chrisputer.tech or visit [my services page](/services/) to get the conversation started.
