+++
title = "CachyOS in 2026: what's new and why it's my daily driver"
date = 2026-02-20
draft = false
tags = ['cachyos', 'linux', 'arch']
categories = ['Linux']
description = "CachyOS in 2026: x86-64-v3/v4 optimized repos, LTO on all packages, BORE scheduler, server edition plans, and why I daily drive it."
+++

I've been running CachyOS as my daily driver for over a year now, and it keeps getting better. For anyone not familiar, CachyOS is an Arch-based distro that recompiles the entire package repository with CPU-specific optimizations and ships a custom kernel with the BORE scheduler. It sounds like a small thing, but the cumulative effect is noticeable. Here's what's new and why it's still my pick.

<!--more-->

## The big deal: optimized repos

Most Linux distros compile packages for x86-64, the baseline instruction set from 2003. Your CPU from 2018 (or later) supports x86-64-v3 with AVX2, FMA3, BMI2, and other instructions that are meaningfully faster for certain workloads. CPUs from 2024+ likely support x86-64-v4 with AVX-512.

CachyOS maintains separate repositories for x86-64-v3 and x86-64-v4. Every package is recompiled to use the instruction set your CPU actually supports. The installer detects your CPU level and configures the right repos automatically.

```bash
# Check which instruction set your CPU supports
/lib/ld-linux-x86-64.so.2 --help 2>&1 | grep supported
```

The performance difference varies by workload:
- Compilation: 5-15% faster
- Compression (zstd, LZ4): 10-20% faster
- Multimedia encoding: 5-15% faster
- Gaming: 2-5% faster (bottleneck is usually the GPU)
- General desktop use: feels snappier, hard to quantify

These aren't made-up numbers. Phoronix has benchmarked this extensively. The gains are real and they're free, just by using packages compiled for your hardware.

## LTO on everything

Link-Time Optimization (LTO) is a compiler technique that optimizes across translation units instead of just within individual source files. CachyOS enables LTO on all packages in its repos. The result is slightly smaller binaries and another few percent of performance on top of the x86-64-v3/v4 gains.

Most distros don't do this because LTO increases compile time significantly (which matters when you're building thousands of packages). CachyOS eats that cost on their build servers so you don't have to.

## The BORE scheduler

CachyOS ships the BORE (Burst-Oriented Response Enhancer) scheduler in its custom kernel. BORE is designed for interactive workloads: desktop use, gaming, development. It prioritizes responsiveness over raw throughput.

In practice, this means:
- UI interactions stay smooth even under heavy load.
- Game frame times are more consistent.
- Build jobs in the background don't make the desktop feel sluggish.

You can also use sched-ext schedulers (like scx_lavd or scx_bpfland) that are loaded as BPF programs at runtime:

```bash
# Install sched-ext schedulers
sudo pacman -S scx-scheds

# Try the lavd scheduler (good for mixed gaming + desktop)
sudo scx_lavd

# Or bpfland (general purpose, good default)
sudo scx_bpfland
```

The sched-ext framework lets you swap schedulers without rebooting. Try one, switch to another, see what feels best for your workload. This is something CachyOS enables out of the box that most distros don't support.

## CachyOS-Settings

The `cachyos-settings` package is a collection of system tweaks that CachyOS applies by default:

- Kernel parameters optimized for desktop use
- ZRAM swap with zstd compression
- IO scheduler tuning (mq-deadline for NVMe, BFQ for rotational drives)
- Network buffer optimizations
- AMDGPU driver forced on older GCN cards (better than radeon)
- Transparent hugepages tuned for desktop workloads

You get these without doing anything. On vanilla Arch, you'd spend an afternoon tweaking sysctl values and kernel parameters to match.

## Ananicy-cpp

Ananicy-cpp is an auto-nice daemon that assigns CPU, I/O, and scheduler priorities to processes based on rules. CachyOS ships it with an extensive rule database.

```bash
# Check that it's running
systemctl status ananicy-cpp

# View the rules being applied
ls /etc/ananicy.d/
```

This means your browser gets higher priority than a background compile, your game gets higher priority than both, and system services run at normal priority. The rules are community-maintained and cover hundreds of common applications.

## Gaming on CachyOS

I covered this in my CachyOS gaming setup guide, but the short version:

- `proton-cachyos` is CachyOS's custom Proton build with Steam Linux Runtime 3.0 patches and LTO. It performs better than stock Proton in some games.
- The BORE scheduler (or scx_lavd) improves frame time consistency.
- x86-64-v3/v4 compiled Wine/Proton means the translation layer itself is faster.
- Gamescope, MangoHud, and gamemode are all in the repos.

```bash
# Install the gaming meta-packages
sudo pacman -S cachyos-gaming-meta cachyos-gaming-applications
```

## Server Edition (planned for 2026)

CachyOS has announced plans for a Server Edition. This is interesting because it would bring the x86-64-v3/v4 optimizations and LTO to server workloads. Imagine running Docker, Kubernetes, databases, and web servers on packages optimized for your actual CPU.

Details are still emerging, but the concept is sound. Server workloads benefit from the same optimizations. A database engine compiled with AVX2 support is faster than one compiled for the 2003 baseline.

## The CachyOS community

One thing I appreciate about CachyOS is the community. The Telegram and Discord are active, the developers are responsive, and the wiki is detailed. It's a smaller community than Arch or Ubuntu, but the signal-to-noise ratio is higher.

The CachyOS kernel gets updates frequently, sometimes multiple times a week. The developers actively track upstream kernel releases, scheduler patches, and performance regressions. If there's a kernel bug affecting performance, it's usually patched in the CachyOS kernel before it hits mainline.

## Why not vanilla Arch?

I used vanilla Arch for years. CachyOS adds enough on top that I don't want to go back:

- **Optimized repos.** I don't want to maintain my own x86-64-v3 builds.
- **Custom kernel.** The BORE scheduler and sched-ext support are genuinely useful.
- **CachyOS-Settings.** Sensible defaults that I would have set manually anyway.
- **Ananicy-cpp.** Auto-priority management that works.
- **The installer.** CachyOS has a proper graphical installer. Arch's `archinstall` has improved, but CachyOS's is smoother.

It's still Arch underneath. Pacman, AUR, rolling release, same repos (plus the CachyOS overlay). If you know Arch, you know CachyOS. You just get extra performance and polish.

## Why not Fedora, Ubuntu, or something else?

Honest answer: I like rolling release. I want the latest kernel, the latest Mesa, the latest everything. Fedora is 6 months behind. Ubuntu LTS is years behind. For a desktop workstation and homelab, I want current software.

CachyOS gives me Arch's rolling release model with extra performance and fewer rough edges. That's a pretty good combination.

If you're curious about CachyOS and want to chat about the switch from another distro, reach out at chris@chrisputer.tech.
