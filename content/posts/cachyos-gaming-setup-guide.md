+++
title = 'CachyOS gaming setup: the complete guide'
date = 2026-02-27
draft = false
tags = ['linux', 'cachyos', 'gaming', 'steam', 'proton', 'lutris', 'nvidia', 'amd']
categories = ['Linux', 'Guides']
description = "How to set up CachyOS for gaming using the official wiki. Covers drivers, Steam, Proton, Lutris, shader caches, sched-ext schedulers, and performance tuning."
+++

CachyOS already ships with a lot of gaming-friendly defaults, but there's still some setup to do if you want things dialed in. This guide follows the [official CachyOS wiki](https://wiki.cachyos.org/configuration/gaming/) and walks through packages, drivers, Proton, shader caches, and the sched-ext schedulers that make CachyOS interesting for gaming in the first place.

<!--more-->

## Install the gaming meta-packages

CachyOS bundles two meta-packages that pull in most of what you need. You can install them from the terminal or through CachyOS Hello.

```bash
sudo pacman -S cachyos-gaming-meta cachyos-gaming-applications
```

`cachyos-gaming-meta` has the libraries and dependencies (32-bit Vulkan, Wine prereqs, etc.). `cachyos-gaming-applications` pulls in the actual tools: Steam, Lutris, Heroic Games Launcher, MangoHud, Gamescope, and Goverlay.

You can skip the meta-packages and install things individually, but for most people these two cover it.

## GPU drivers

CachyOS handles driver installation during the initial setup, but here's what to check if you're starting fresh or troubleshooting.

### NVIDIA

The proprietary drivers should already be installed if you selected them during setup. If not:

```bash
sudo pacman -S nvidia-dkms nvidia-utils lib32-nvidia-utils
```

For laptops with hybrid graphics (Intel/AMD iGPU + NVIDIA dGPU), install PRIME offloading:

```bash
sudo pacman -S nvidia-prime
```

Then launch games with `prime-run`:

```bash
prime-run %command%
```

For DX12 games on NVIDIA with PRIME, you may also need to set the Vulkan ICD explicitly:

```
VK_DRIVER_FILES=/usr/share/vulkan/icd.d/nvidia_icd.json prime-run %command%
```

**Tip:** Avoid optimus-manager, nvidia-xrun, and Bumblebee. These are obsolete and cause more problems than they solve.

### AMD

AMDGPU and Mesa should be there out of the box. The `cachyos-settings` package forces AMDGPU even on older GCN cards that would otherwise default to radeon. No extra driver setup needed for most AMD users.

For dual-GPU AMD laptops, use `DRI_PRIME=1`:

```
DRI_PRIME=1 %command%
```

## Proton and Wine

### Choosing a Proton version

CachyOS ships its own Proton builds:

| Version | When to use it |
|---|---|
| proton-cachyos | Built from latest Proton with CachyOS patches |
| proton-cachyos-slr | Recommended default. Uses Steam Linux Runtime. Required for anti-cheat (EAC, BattlEye). |
| Proton Experimental | Valve's bleeding-edge build, available through Steam |
| Proton-GE | GloriousEggroll's custom build with extra game fixes |

Install the CachyOS Proton builds:

```bash
sudo pacman -S proton-cachyos proton-cachyos-slr
```

You can also manage Proton versions through protonup-qt:

```bash
sudo pacman -S protonup-qt
```

### Wine

CachyOS provides two Wine packages. `wine-cachyos` replaces your system Wine entirely. `wine-cachyos-opt` installs in parallel under `/opt/wine-cachyos`, so you can keep the stock Wine around.

If you're using wine-cachyos-opt with winetricks:

```bash
WINE=/opt/wine-cachyos/bin/wine WINEPREFIX=<prefix> winetricks <verb>
```

### umu-launcher

If you plan to use proton-cachyos with Lutris or Heroic, install umu-launcher:

```bash
sudo pacman -S cachyos/umu-launcher
```

This is required for Proton compatibility outside of Steam.

## Steam configuration

Two settings worth changing right away.

### Disable shader pre-caching

Open Steam Settings > Shader Pre-Caching and uncheck both:

- "Allow background processing of Vulkan shaders"
- "Enable Shader Pre-caching"

CachyOS handles shader caching at the driver level (covered below), so Steam's built-in caching is redundant and can cause stuttering.

### Fix Game Recorder stuttering

If you're getting micro-stutters, Steam's Game Recorder might be the cause. Add this to your launch options:

```
LD_PRELOAD="" %command%
```

Fair warning: this breaks the Steam Overlay. If you need the overlay, you'll have to live with the stuttering or disable Game Recorder in Steam settings.

### Launch options format

The general format for Steam launch options is:

```
<environment variables> <wrappers> %command% <game arguments>
```

For example:

```
game-performance mangohud --dlsym %command% -dx11
```

Only use `%command%` once. Don't put multiple `%command%` entries as separators.

## Lutris setup

### Global settings

1. Click the cogwheel icon next to Wine in the sidebar
2. Under Runner Options, set the Wine version to `proton-cachyos`
3. Disable "Use System winetricks" and set "Enable DXVK" to match your runner (disable it when using proton-cachyos since Proton bundles its own DXVK, enable it when using regular Wine)
4. Under System Options, enable "Disable Lutris Runtime" and "Prefer system libraries"
5. Under Game execution, add environment variables as needed:
   - `UMU_RUNTIME_UPDATE` = `0` (skips runtime update checks, optional)
   - `PROTON_VERB` = `waitforexitandrun` (enables protonfixes, optional)

### Per-game settings

Game-specific flags like `-dx11 -fullscreen` go in the Arguments field. Wrappers like `mangohud --dlsym` or `game-performance` go in the Command prefix field. Environment variables go in the key/value table under Game execution. One gotcha: don't include `=` in the key field, just put the variable name as the key and the value as the value.

### Heroic Games Launcher

In the Wine tab, set the version to `Proton - proton-cachyos`. The rest works similarly to Lutris.

## Shader cache tuning

By default, shader caches have size limits that can cause recompilation stutters. Create `~/.config/environment.d/gaming.conf` to increase them.

**For AMD:**

```ini
AMD_VULKAN_ICD=RADV
MESA_SHADER_CACHE_MAX_SIZE=12G
```

**For NVIDIA:**

```ini
__GL_SHADER_DISK_CACHE_SIZE=12000000000
```

These variables are loaded at login, so log out and back in after creating the file.

## Performance tools

CachyOS ships a few wrappers you can stick in front of `%command%` in your launch options.

`game-performance` switches the CPU governor to performance mode while the game is running, then switches it back when you quit:

```
game-performance %command%
```

`mangohud` gives you an FPS counter and hardware monitoring overlay. The `--dlsym` flag is needed for some games:

```
mangohud --dlsym %command%
```

You can configure what MangoHud displays through Goverlay (a GUI for it), or by editing `~/.config/MangoHud/MangoHud.conf` directly.

`dlss-swapper` is for NVIDIA users. It auto-updates the DLSS DLLs in your game prefixes so you're not stuck with whatever version the game shipped:

```
dlss-swapper %command%
```

You can chain these together. Something like `game-performance mangohud --dlsym %command%` works fine.

## sched-ext schedulers

This is the main reason I'd pick CachyOS over vanilla Arch for a gaming machine. The sched-ext framework lets you swap in different CPU schedulers at runtime, no reboot needed, and some of them are tuned specifically for gaming workloads.

### Install the schedulers

```bash
sudo pacman -S scx-scheds scx-tools
```

Or for the latest development builds:

```bash
sudo pacman -S scx-scheds-git scx-tools-git
```

### Best schedulers for gaming

| Scheduler | What it does |
|---|---|
| scx_bpfland | Vruntime-based, good for interactive workloads. Works well with defaults. |
| scx_lavd | Optimized for latency-critical gaming. Good for power efficiency too. |
| scx_flash | Earliest-deadline-first. Predictable and fair. |
| scx_rusty | Highly tunable with a wide range of options. |

### Start a scheduler with gaming flags

Use `scxctl` to manage schedulers from the command line:

```bash
scxctl start --sched bpfland --mode gaming
```

Switch to a different one on the fly:

```bash
scxctl switch --sched lavd --mode gaming
```

Stop and go back to the default kernel scheduler:

```bash
scxctl stop
```

### Persistent configuration

Edit `/etc/scx_loader.toml` to set a default:

```toml
default_sched = "scx_bpfland"
default_mode = "Auto"

[scheds.scx_bpfland]
auto_mode = ["--performance"]
```

The scx_loader service integrates with power-profiles-daemon, so it automatically switches between power-saving and gaming profiles based on your power profile.

### Kernel Manager GUI

CachyOS also has a graphical Kernel Manager that lets you switch schedulers and kernel variants without touching the terminal. Look for it in your application menu.

## Useful environment variables

These are the ones you'll actually use. There are more on the wiki, but most of them are niche.

### Upscaling and GPU features

| Variable | What it does |
|---|---|
| `PROTON_DLSS_UPGRADE=1` | Auto-upgrade DLSS to latest version |
| `PROTON_FSR4_UPGRADE=1` | Enable AMD FSR4 upgrade |
| `PROTON_XESS_UPGRADE=1` | Enable Intel XeSS upgrade |
| `PROTON_NVIDIA_LIBS=1` | Enable NVIDIA libraries (PhysX, CUDA, etc.) |

### Display

| Variable | What it does |
|---|---|
| `PROTON_ENABLE_HDR=1` | HDR output (needs Gamescope with `--hdr-enabled` or Wayland) |
| `ENABLE_HDR_WSI=1` | Required for HDR on NVIDIA |
| `PROTON_ENABLE_WAYLAND=1` | Native Wayland (experimental, breaks Steam Overlay) |

### Performance

| Variable | What it does |
|---|---|
| `PROTON_USE_NTSYNC=1` | Use NTSync instead of WineSync (experimental) |
| `ENABLE_LAYER_MESA_ANTI_LAG=1` | AMD Anti-Lag |
| `__GL_SHADER_DISK_CACHE_SKIP_CLEANUP=1` | Prevent NVIDIA shader cache cleanup |

### Input fixes

| Variable | What it does |
|---|---|
| `PROTON_PREFER_SDL=1` | Fix controller detection issues |
| `PROTON_NO_STEAMINPUT=1` | Fix gamepad issues on Wayland |

## AMD-specific tweaks

### AMD Anti-Lag

```
ENABLE_LAYER_MESA_ANTI_LAG=1 %command%
```

### 3D V-Cache optimizer

If you have an AMD CPU with 3D V-Cache (like the 5800X3D or 7800X3D), CachyOS supports the V-Cache optimizer. Set your BIOS CPPC mode to "Driver" to let the OS pick the right cores.

## NVIDIA-specific tweaks

### Smooth Motion (RTX 40/50 series)

```
NVPRESENT_ENABLE_SMOOTH_MOTION=1 %command%
```

This is a frame interpolation feature. It's 64-bit only and doesn't work alongside DLSS Frame Generation. If you have overlay issues, add `NVPRESENT_QUEUE_FAMILY=1` as well.

### GSP firmware issues

If you're seeing crashes or hangs, try disabling GSP firmware. Create `/etc/modprobe.d/nvidia-gsp.conf`:

```
options nvidia NVreg_EnableGpuFirmware=0
```

Then rebuild initramfs:

```bash
sudo mkinitcpio -P
```

## Things to avoid

The CachyOS wiki calls these out explicitly, and they're worth repeating because people keep hitting them:

Don't install games to NTFS partitions. Valve does not support this and it causes random Proton issues. If you're dual-booting and sharing a game library with Windows, use a separate ext4 or btrfs partition instead.

Don't combine gamemode and ananicy-cpp. They fight over the same resources. If you want to use gamemode, stop ananicy-cpp first: `systemctl stop ananicy-cpp`.

Don't use the real-time kernel for gaming. `linux-cachyos-rt-bore` is for audio production. It actually hurts game performance.

And keep expectations in check. The wiki puts it honestly: "Getting a double digit improvement in FPS is not always possible." Some games just run how they run.

## Check game compatibility

Before spending time troubleshooting a game that might not work at all, check these resources:

- [ProtonDB](https://www.protondb.com/) for Steam game compatibility reports
- [Are We Anti-Cheat Yet](https://areweanticheatyet.com/) for anti-cheat support status

## When something breaks

`PROTON_LOG=1 %command%` writes a log to `~/steam-<AppID>.log`. You can also set a custom log directory:

```
PROTON_LOG=1 PROTON_LOG_DIR=/path/to/logs %command%
```

Between that and ProtonDB's per-game fix suggestions, most issues are solvable. The ones that aren't are usually anti-cheat related, and checking [Are We Anti-Cheat Yet](https://areweanticheatyet.com/) before buying a game saves a lot of frustration.

Honestly, most of the work is done by those two meta-packages and the `cachyos-settings` package that comes pre-installed. The shader cache config and sched-ext scheduler are where the real tuning happens. Start with `scx_bpfland` in gaming mode and go from there.
