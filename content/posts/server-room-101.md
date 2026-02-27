+++
title = "Server room 101 for small offices"
date = 2025-12-06
description = "Your server room doesn't need to be fancy, but it does need to keep your equipment alive. Location, cooling, power, and the disasters I've actually seen happen."
draft = false
tags = ['server', 'small-business', 'infrastructure']
categories = ['Small Business IT']
+++

I've walked into server "rooms" that were actually closets shared with the cleaning supplies. I've seen servers balanced on folding tables next to a water heater. One memorable visit had a production server sitting on the floor of a kitchen break room. The bar for server rooms in small offices is low, but there are a few things you absolutely need to get right if you want your equipment to survive.

<!--more-->

## Location: pick the right room

Your server room (or server closet, let's be honest about the size) should be:

**Interior room, no windows, no exterior walls.** An exterior wall means temperature swings, potential water intrusion, and vulnerability to storm damage. An interior closet or office is ideal. Windows are a security risk and a heat source.

**Not in the basement.** Flooding. Every time. If your building has ever had any water intrusion, the basement is the wrong choice. If it hasn't flooded yet, it will.

**Not directly under a bathroom or kitchen.** Pipes leak. It's a matter of when, not if. I've seen a server room taken out by a toilet overflow from the floor above. Not glamorous. Very expensive.

**Lockable door.** This seems obvious, but I've seen unlocked server rooms more often than locked ones. If anyone can walk in and unplug something (or plug in a space heater), that's a problem.

**Away from high-traffic areas.** People bump things. Cleaning crews unplug things. Deliveries get stacked against things. Keep the server room away from the main flow of the office.

## Cooling: the number one killer

Heat is the enemy. Servers generate a lot of it, and a small enclosed room gets hot fast. The cooling situation is the single most important thing to get right.

**Dedicated mini-split, not building HVAC.** This is non-negotiable. Your building's HVAC system is designed for people comfort, not server cooling. More importantly, it probably shuts off on evenings and weekends. Your servers don't stop running on Saturday. A summer weekend with no cooling in a sealed server closet will push temperatures above 100F within hours. I've seen it cook equipment.

A dedicated mini-split AC unit costs $1,500 to $3,000 installed and runs independently of the building system. It keeps the room at 68 to 72 degrees around the clock, year-round. This is not optional.

**Temperature monitoring.** A simple network-connected temperature sensor (like the APC NetBotz or even a Raspberry Pi with a sensor) sends you an alert when the room gets too hot. You want to know about a cooling failure before the equipment overheats, not after.

**Airflow.** Don't stack boxes and supplies around the server rack. Keep at least 3 feet of clearance in front and behind the rack for airflow. Hot air needs somewhere to go.

## Power: keep it clean and keep it running

**UPS: APC Smart-UPS SMT3000C.** This is my go-to recommendation for small server rooms. It provides 2,700 watts of clean, battery-backed power with a network management card for remote monitoring and graceful shutdown.

Size your UPS at 50 to 75% of its rated capacity. If you load a UPS to 100%, the battery runtime drops dramatically and you're leaving no room for peak loads. A 3000VA UPS loaded to 75% gives you meaningful runtime, usually 15 to 30 minutes depending on load, which is enough to ride through brief outages and shut down gracefully during longer ones.

**Dedicated circuit.** Your server equipment should be on its own electrical circuit, ideally two separate circuits for redundancy. Don't share a circuit with the microwave in the break room. I'm not joking. I've seen a tripped breaker take down a server because it shared a circuit with a coffee maker and a space heater.

**Surge protection.** The UPS provides this, but make sure everything is plugged into the UPS, not into a wall outlet. Every cable entering the server room (power, network, phone) is a potential path for a surge.

## The rack

Even a small setup benefits from a proper rack or enclosure. A 12U to 18U wall-mount rack is perfect for a small office. It keeps equipment organized, improves airflow, and makes cable management actually possible.

Mount it securely to wall studs, not drywall anchors. Loaded racks are heavy. I've seen a drywall-mounted rack pull off the wall and take a switch and a patch panel with it.

## Common disasters I've actually seen

**The cleaning crew disaster.** Cleaning crew comes in Friday night. They need an outlet for the vacuum. They unplug the server. Nobody notices until Monday morning. 60 hours of uncontrolled downtime. Solution: outlet covers on the UPS, a "DO NOT UNPLUG" label that's impossible to miss, and a locked room.

**The HVAC failure.** AC fails on Friday afternoon. Nobody is in the office over the weekend. By Monday the server room is 115F. Two hard drives have failed from thermal stress. Server is down. Solution: dedicated mini-split with temperature monitoring and alerts.

**The roof leak.** Slow roof leak above the server closet drips onto the top of the rack over a weekend. Water runs down into the switch and the server. Both are destroyed. Solution: don't put the server room under a flat roof section (the most leak-prone area), and install a water leak sensor on the floor.

**The "temporary" setup.** Server gets placed on a folding table "temporarily" during an office move. Three years later, it's still on the folding table, now with a tangle of cables, no UPS, and a fan pointed at it for cooling. Solution: do it right the first time, or "temporary" becomes permanent.

## The checklist

Here's what every small office server room needs at minimum:

- Interior room with a lockable door
- Dedicated mini-split cooling (not building HVAC)
- Temperature monitoring with alerts
- UPS sized at 50 to 75% capacity (APC Smart-UPS SMT3000C or similar)
- Dedicated electrical circuit(s)
- Proper rack or enclosure
- Cable management
- Water leak sensor
- Fire extinguisher rated for electrical equipment (Class C)
- No storage of other items in the room

## What to do next

If your server is sitting on a desk in an unlocked room cooled by the building AC, it's time for an upgrade. I can assess your current setup and recommend the right improvements. Most small office server room fixes cost under $5,000 and prevent outages that cost far more.

Email me at chris@chrisputer.tech or visit [/services/](/services/) to schedule a walk-through.
