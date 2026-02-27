+++
title = 'Fix xrdp black screen with KDE Plasma Wayland on Arch Linux'
date = 2026-02-11
draft = false
tags = ['linux', 'xrdp', 'kde', 'plasma', 'wayland', 'archlinux', 'cachyos', 'rdp', 'guacamole']
categories = ['Linux', 'Guides']
description = "How to fix the black screen when using xrdp with KDE Plasma on Wayland. The root cause is a D-Bus collision between your Wayland and X11 sessions."
+++

I wanted to RDP into my CachyOS machine through Apache Guacamole and get a separate Plasma session, not screen sharing, so nothing shows up on the physical monitors. xrdp is supposed to handle this by spinning up an X11 Plasma session on a new display.

Instead I got a black screen with a lonely cursor. Sometimes the KDE splash would flash first, then black. I burned a couple hours on this before figuring out the actual cause.

<!--more-->

## Why this happens

On Arch/CachyOS, xrdp's X11 session inherits the shared D-Bus session bus at `/run/user/<uid>/bus`, the same bus your local Wayland Plasma session is already using.

Two things go wrong:

1. kwin_x11 from the RDP session registers as `org.kde.KWin` on the shared D-Bus, colliding with the existing kwin_wayland's registration and disrupting window management on your local desktop
2. plasmashell refuses to start because it sees one already registered on that bus (the Wayland one)

So you get kwin_x11 running (cursor visible) but no shell, no panel, no desktop. Just black.

## My setup

- OS: CachyOS (Arch-based)
- DE: KDE Plasma 6 on Wayland (local session)
- Remote: xrdp + xorgxrdp
- Client: Apache Guacamole

This applies to any Arch-based distro. Debian/Ubuntu users will need slightly different paths (noted below).

## Prerequisites

On CachyOS, these are in the repos:

```bash
sudo pacman -S xrdp xorgxrdp
```

On vanilla Arch, they're AUR packages. Use your AUR helper:

```bash
yay -S xrdp xorgxrdp
```

Then enable the service:

```bash
sudo systemctl enable --now xrdp
```

Open the firewall if needed:

```bash
sudo ufw allow 3389/tcp
```

## The fix: isolate D-Bus

Wrap `startplasma-x11` with `dbus-run-session` so the RDP session gets its own private D-Bus instance. That's the whole fix.

### Which startup file to edit

xrdp's `startwm.sh` (`/etc/xrdp/startwm.sh`) checks files in this order on Arch:

1. `~/.xinitrc` -- checked first on Arch (takes priority)
2. `~/.xsession` -- checked on Debian-based distros
3. `/etc/X11/xinit/xinitrc` -- system fallback

On Arch, edit `~/.xinitrc`. On Debian/Ubuntu, edit `~/.xsession`.

### ~/.xinitrc (Arch-based)

```bash
export DESKTOP_SESSION=plasma
export XDG_SESSION_DESKTOP=KDE
export XDG_CURRENT_DESKTOP=KDE
export KWIN_COMPOSE=N
export QT_XCB_GL_INTEGRATION=none

# Use a private D-Bus session so xrdp doesn't collide with the Wayland desktop
exec dbus-run-session startplasma-x11
```

### ~/.xsession (Debian/Ubuntu)

```bash
export DESKTOP_SESSION=plasma
export XDG_SESSION_TYPE=x11
export XDG_CURRENT_DESKTOP=KDE

# Use a private D-Bus session so xrdp doesn't collide with the Wayland desktop
exec dbus-run-session startplasma-x11
```

### What the environment variables do

| Variable | What it does |
|---|---|
| `DESKTOP_SESSION=plasma` | Tells xrdp to launch Plasma |
| `XDG_SESSION_DESKTOP=KDE` | Identifies the session to XDG-aware apps |
| `XDG_CURRENT_DESKTOP=KDE` | Used by apps to detect the desktop environment |
| `KWIN_COMPOSE=N` | Disables compositing (better performance over RDP) |
| `QT_XCB_GL_INTEGRATION=none` | Prevents OpenGL issues in the software-rendered X11 session |

## Preventing system sleep

If this is a remote-access machine, you probably want to prevent it from sleeping while still letting monitors power off:

```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target suspend-then-hibernate.target
```

Monitor DPMS is unaffected. Screens still turn off after the configured timeout.

To undo later:

```bash
sudo systemctl unmask sleep.target suspend.target hibernate.target hybrid-sleep.target suspend-then-hibernate.target
```

## Troubleshooting

### Still getting a black screen with cursor

That's the D-Bus collision. Verify with:

```bash
# Find the xrdp startplasma-x11 process
ps aux | grep startplasma-x11

# Check its D-Bus address
cat /proc/<pid>/environ | tr '\0' '\n' | grep DBUS
```

If it shows `unix:path=/run/user/1000/bus`, the fix didn't take effect. Make sure you're editing the right startup file (`~/.xinitrc` on Arch, `~/.xsession` on Debian).

### Stale sessions

If you've been testing and have leftover sessions hanging around:

```bash
# Find stale xrdp session processes
ps aux | grep -E "startplasma-x11|Xorg.*:1[0-9]|kwin_x11"

# Kill them (replace PIDs)
kill <pids>

# Verify only your local display remains
ls /tmp/.X11-unix/
# Should show only X0 (or X1) for your local session
```

Then reconnect. sesman will create a fresh session.

### kwin_x11 keeps respawning after killing a session

This happens when kwin_x11 is parented to your Wayland session's process tree because of the shared D-Bus. Kill the Xorg process for that display first, then kwin_x11 stops respawning.

### A note on xrdp.ini security

The default CachyOS/Arch xrdp config uses `security_layer=negotiate`, which will fall back to legacy RDP encryption if the client doesn't support TLS. Fine on a trusted LAN, not suitable for internet exposure. If you're going through Guacamole over the internet, make sure Guacamole handles encryption (HTTPS to Guacamole, then Guacamole connects to xrdp on the LAN).

## How it all fits together

```text
[RDP Client / Guacamole]
        |
        | port 3389
        v
    [xrdp daemon]
        |
        v
    [xrdp-sesman] --> launches session
        |
        v
    [xrdp-sesexec] --> runs ~/.xinitrc as user
        |
        v
    [dbus-run-session] --> private D-Bus instance
        |
        v
    [startplasma-x11] --> full KDE Plasma on Xorg :10+
        |
        +-- kwin_x11 (window manager)
        +-- plasmashell (desktop/panel)
        +-- xrdp-chansrv (clipboard, audio, drives)
```

Your local Wayland session on `:0` stays completely separate.

## Full setup script

This script does everything covered above in one shot. Run it as your normal user (it will `sudo` where needed).

```bash
#!/bin/bash
set -e

echo "=== xrdp + KDE Plasma X11 setup ==="

# Install xrdp and xorgxrdp
if command -v pacman &>/dev/null; then
    if pacman -Si xrdp &>/dev/null 2>&1; then
        sudo pacman -S --needed --noconfirm xrdp xorgxrdp
    else
        echo "xrdp is an AUR package on your system."
        echo "Install manually: yay -S xrdp xorgxrdp"
        exit 1
    fi
else
    echo "This script is for Arch-based distros."
    exit 1
fi

# Enable xrdp service
sudo systemctl enable --now xrdp

# Create ~/.xinitrc with isolated D-Bus session
cat > ~/.xinitrc << 'XINITRC'
export DESKTOP_SESSION=plasma
export XDG_SESSION_DESKTOP=KDE
export XDG_CURRENT_DESKTOP=KDE
export KWIN_COMPOSE=N
export QT_XCB_GL_INTEGRATION=none

# Use a private D-Bus session so xrdp doesn't collide with the Wayland desktop
exec dbus-run-session startplasma-x11
XINITRC
chmod 644 ~/.xinitrc

echo "Created ~/.xinitrc"

# Prevent system sleep (optional, for remote-access machines)
read -p "Disable system sleep? Monitors will still turn off. [y/N] " disable_sleep
if [[ "$disable_sleep" =~ ^[Yy]$ ]]; then
    sudo systemctl mask sleep.target suspend.target hibernate.target \
        hybrid-sleep.target suspend-then-hibernate.target
    echo "Sleep targets masked."
fi

# Open firewall if ufw is active
if systemctl is-active --quiet ufw; then
    sudo ufw allow 3389/tcp
    echo "Opened port 3389 in ufw."
fi

echo ""
echo "Done. Connect with any RDP client on port 3389."
echo "Your local Wayland session will not be affected."
```

Save this as `setup-xrdp-plasma.sh`, make it executable with `chmod +x setup-xrdp-plasma.sh`, and run it.

## References

- [xrdp GitHub](https://github.com/neutrinolabs/xrdp)
- [xorgxrdp GitHub](https://github.com/neutrinolabs/xorgxrdp)
- [Arch Wiki: xrdp](https://wiki.archlinux.org/title/Xrdp)
