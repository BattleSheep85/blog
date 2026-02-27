+++
title = "The real cost of that Best Buy router"
date = 2025-10-21
draft = false
description = "That $200 consumer router costs way more than $200 when you factor in replacements, downtime, truck rolls, and lost productivity. Let's do the math."
tags = ['networking', 'small-business', 'wifi']
categories = ['Small Business IT']
+++

Someone at the office bought a $200 router from Best Buy. Maybe it was the owner, maybe the office manager, maybe the "IT guy" who's actually the person who set up the printer once. It worked great for three months. Now it needs rebooting twice a week, and everybody thinks the ISP is the problem. That router is one of the most expensive decisions your business has made, and nobody realizes it.

<!--more-->

## Consumer gear has a business lifespan of 18-24 months

Consumer routers are designed for home use. That means they're built to a price point, with components rated for a living room, not a closet that hits 90 degrees in the summer. In a home, they last three to five years. In a business environment running 8 to 12 hours a day with 20 to 50 devices hitting them constantly, the average lifespan is 18 to 24 months before they start having reliability problems.

That "reliability problem" phase doesn't mean the router dies outright. It means intermittent WiFi drops, random reboots, devices that can't connect, and slowdowns that come and go. This is the worst kind of failure because it's hard to diagnose and easy to blame on everything else. Your staff complains. You call the ISP. The ISP says the line is fine. Everyone shrugs. The cycle repeats for months until someone finally buys another router.

## The real five-year cost: consumer vs. business-class

Let me lay out the math for a typical 15-person office.

### Consumer router path

**Hardware:** $200 router, replaced every 18-24 months. Over five years, that's three routers: **$600.**

**No remote management.** Every time something goes wrong, someone has to physically go to the router. If you're calling an IT person, that's a truck roll at $150 to $250 per visit. Figure two to three visits per year for troubleshooting, reboots, and replacements: **$450 to $750/year**, or **$2,250 to $3,750 over five years.**

**Downtime costs.** Conservative estimate: the WiFi goes down or gets flaky for 30 minutes, twice a month. With 15 people at $25/hour, that's $187 per incident, $375/month, $4,500/year. But let's be generous and say it only happens once a month and only affects half the staff: **$1,125/year**, or **$5,625 over five years.**

**Five-year consumer total: roughly $8,475 to $9,975.**

That's for a device with no VLANs, no firewall logs, no VPN capability, and no way to manage it without being physically present.

### Business-class MikroTik path

**Hardware:** MikroTik hAP ax3 ($130) or RB5009 ($180), plus a managed switch ($75-$200). Total hardware: **$205 to $380.** These devices last five or more years without issue. MikroTik gear is built for continuous duty.

**Remote management.** MikroTik supports SSH, WinBox, and API access. I can manage your router from anywhere. No truck roll needed for 90% of issues. Annual management time: **$300 to $500/year.**

**Downtime costs.** With proper hardware, proactive monitoring, and remote management, network issues get caught and fixed before your staff notices. Let's say one incident per quarter affecting the network for 10 minutes: **$94/year**, or **$470 over five years.**

**Five-year MikroTik total: roughly $2,170 to $3,350.**

## The hidden cost nobody talks about

There's another cost that doesn't show up in any spreadsheet: frustration. When the WiFi is unreliable, your staff stops trusting the network. They use their phone hotspots for important video calls. They avoid uploading large files because "the internet's been weird." They waste mental energy working around a problem that shouldn't exist.

That frustration compounds. It affects morale. It makes your business feel rinky-dink to employees and to clients who visit your office and can't connect to your guest WiFi. Nobody puts a dollar figure on it, but it's real.

## But I can just buy a new one when it breaks

Sure. And you'll lose half a day to someone going to Best Buy, setting it up, reconfiguring the WiFi password on every device, reconnecting the printers, and hoping nothing else breaks. Multiply that by every 18 months, and you start to see why "cheap" hardware is the most expensive choice.

Business-class gear doesn't require that cycle. You set it up once, configure it properly, back up the configuration, and it runs. If it ever does fail (which is rare), you restore the config to a replacement unit and you're back up in minutes, not hours.

## What to do next

If you're tired of the replacement cycle and the "is it the internet or our router?" guessing game, let's put something proper in place. I deploy MikroTik networks for small businesses that cost less over five years than the consumer gear path, with none of the headaches.

Email [chris@chrisputer.tech](mailto:chris@chrisputer.tech) or check out [/services/](/services/). The router from Best Buy was never the right tool for the job. Let's fix that.
