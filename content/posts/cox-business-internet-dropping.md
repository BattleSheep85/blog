+++
title = "Your Cox business internet keeps dropping: here's what to do"
date = 2025-09-29
draft = false
description = "If your Cox business internet drops every 20-30 minutes or you've dealt with multi-day outages, here are the fixes: bridge mode, better routers, cellular failover, and when to switch ISPs entirely."
tags = ["isp", "internet", "wichita", "networking", "small-business"]
categories = ["Small Business IT"]
+++

I get this call at least once a month: "Our internet keeps dropping and Cox says there's nothing wrong." The business owner is frustrated, their employees are losing productivity, and every time they call Cox support they get a different answer. Sound familiar?

Cox Business is the most widely available ISP in Wichita, which means a lot of businesses are stuck with them whether they like it or not. The service works fine for plenty of people, but when it doesn't work, it really doesn't work. Drops every 20 to 30 minutes, multi-day outages, and technician visits that fix nothing are all common complaints. Here's what I've found actually helps.

<!--more-->

## Step 1: Put the Cox gateway in bridge mode

This is the first thing I do on almost every Cox Business install, and it fixes the problem about 40% of the time.

Cox provides a combination modem/router (called a gateway) that handles both your internet connection and your local network. The problem is that these gateways are mediocre routers. Their WiFi is weak, their DHCP server is flaky, and their NAT implementation causes issues with VoIP, VPNs, and other business applications.

**Bridge mode** turns off the router functions and turns the Cox gateway into a plain modem. You then connect your own router or firewall to the gateway, and your equipment handles everything on the network side.

How to set it up:

1. Call Cox Business support and ask them to put your gateway in bridge mode. Some models can be changed through the admin interface, but having Cox do it avoids configuration headaches.
2. Connect your own router's WAN port to the Cox gateway's LAN port.
3. Configure your router with the settings Cox provides (usually DHCP on the WAN side).

If Cox won't put it in bridge mode, you can often achieve the same result by putting your router's IP in the gateway's DMZ, but true bridge mode is cleaner.

## Step 2: Use a proper business router or firewall

Once the Cox gateway is in bridge mode, you need something good on the other end. Here's what I recommend for small businesses:

**Budget option ($100-200):** A MikroTik hEX or hAP ac3. These are incredibly capable routers for the price. They handle VLAN tagging, QoS, firewall rules, and failover. The learning curve is steeper than consumer gear, but they don't randomly crash and they don't need to be rebooted every week.

**Mid-range ($300-800):** A Ubiquiti UniFi Dream Machine Pro or a FortiGate 40F/60F. These give you proper enterprise features: deep packet inspection, IDS/IPS, VPN, content filtering, and centralized management. For a business with 10-50 users, this is the sweet spot.

**Enterprise ($1,000+):** A Cisco Meraki MX or a Palo Alto PA-400 series. If you need advanced threat protection, compliance reporting, or you're managing multiple sites, this is where you go.

The point is: stop relying on the Cox-provided gateway to do router duty. It's not good at it.

## Step 3: Check the physical plant

Before blaming Cox entirely, rule out problems on your side of the connection:

**Coax cable quality.** If your building has old coax runs with multiple splitters, corroded connectors, or tight bends, your signal quality will suffer. A Cox technician should check signal levels at the modem, but don't trust that they actually did. Ask for the numbers: downstream power should be -7 to +7 dBmV, upstream 35 to 49 dBmV, and SNR above 33 dB. If the numbers are marginal, push for a clean cable run from the demarc to your modem.

**Splitters.** Every splitter between the street and your modem degrades the signal. Ideally, the modem gets a direct (home run) cable with no splitters. If there are splitters, they should be rated for the frequencies Cox uses.

**Heat.** Cox gateways generate a lot of heat. If yours is crammed in a closet with no ventilation, it will overheat and drop connections. Give it airflow.

**Ethernet cables.** A bad patch cable between the gateway and your router will cause intermittent drops that look exactly like an ISP problem. Swap the cable with a known good Cat6 cable and see if the problem goes away.

## Step 4: Set up cellular failover

Even after optimizing your Cox connection, outages happen. Cox has had multi-day outages in Wichita that affected entire neighborhoods. Your business can't wait five days for Cox to fix a node.

A cellular failover setup automatically switches your internet to a cellular connection when your primary goes down. Here's what that looks like:

**Dedicated failover device:** A Cradlepoint IBR or E-series, or a Peplink Balance with embedded cellular. These devices sit between your Cox modem and your router. When they detect the primary connection is down, they switch to cellular. When Cox comes back, they switch back. Your employees might not even notice.

**SIM card on a different carrier:** Use Verizon or T-Mobile for your cellular backup, not whatever carrier Cox uses for their network backbone. The whole point is path diversity. If the same fiber cut that took out Cox also takes out your backup, you've wasted your money.

**Cost:** Plan on $50 to $150/month for a business cellular data plan with enough data for failover use. The hardware is a one-time cost of $300 to $1,500 depending on the model. Compare that to what a day of downtime costs your business.

## Step 5: Consider dual-WAN with a second ISP

If your business absolutely cannot tolerate downtime (medical office, financial services, e-commerce), consider a second wired ISP connection from a different provider. If IdeaTek or AT&T Fiber is available at your address, get a secondary connection from them.

A dual-WAN router or firewall can load-balance across both connections during normal operation (giving you more bandwidth) and fail over to the surviving connection if one goes down. This is the gold standard for business internet reliability.

The monthly cost for a second connection is real ($100-300/month), but for businesses where an hour of downtime costs thousands in lost revenue, it's easy math.

## Step 6: Know when to switch entirely

Sometimes the answer is just: leave Cox. If you've done everything above and you're still having problems, or if the outages are on Cox's end and there's nothing you can do about it, it's time to look at alternatives.

**IdeaTek:** If they serve your address, seriously consider switching. Symmetrical fiber, local support, 4.75/5 customer satisfaction. Check availability at their website.

**AT&T Fiber:** Good where available. Check your specific address because coverage is spotty across Wichita.

**Fixed wireless:** Companies like Pixius offer fixed wireless in some parts of the Wichita area. Not as fast as fiber, but it's a completely different infrastructure from Cox's cable network.

When you switch, keep your Cox connection active for a month of overlap. Run both in parallel, verify the new connection is stable, and then cancel Cox. Don't go dark during the transition.

## What to do next

If you're fighting with Cox and losing, I can help. I've troubleshot dozens of Cox Business connections around Wichita and I know what works. From bridge mode configuration to proper router setup to cellular failover and ISP migration, I'll get your internet stable so you can get back to running your business.

Reach out at [chris@chrisputer.tech](mailto:chris@chrisputer.tech) or check out my [services page](/services/). Life's too short to reboot your modem every day.
