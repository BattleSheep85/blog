+++
title = 'Firefox profile lock over xrdp (and why I just use separate browsers)'
date = 2026-02-25
draft = false
tags = ['linux', 'firefox', 'xrdp', 'kde', 'plasma', 'archlinux', 'cachyos', 'waterfox', 'brave']
categories = ['Linux', 'Fixes']
description = "Firefox refuses to open in your xrdp session because your local session already has the profile locked. Here's the quick fix and a better long-term approach."
+++

If you followed my [xrdp setup guide](/posts/xrdp-kde-plasma-wayland-black-screen-fix/) and got a working X11 Plasma session over RDP, you probably hit this next:

> Firefox is already running, but is not responding. To use Firefox, you must first close the existing Firefox process, restart your device, or use a different profile.

Except Firefox is responding fine -- on your local Wayland session. The RDP session just can't touch it.

<!--more-->

## Why this happens

Firefox locks its profile directory when it starts. The lock file lives in `~/.mozilla/firefox/<profile>/lock`. Since your local Wayland session and xrdp X11 session share the same home directory, the second Firefox instance sees the lock and bails out.

This isn't a bug. Firefox genuinely can't share a profile between two running instances -- the database files (places.sqlite, cookies, etc.) would corrupt.

## The quick fix: separate Firefox profile

You can tell Firefox to use a different profile for the RDP session:

```bash
firefox --no-remote -P rdp
```

The `--no-remote` flag prevents it from trying to talk to the existing instance. `-P rdp` selects a profile named "rdp" (Firefox will prompt you to create it on first run).

You can also create the profile ahead of time:

```bash
firefox --no-remote -CreateProfile rdp
```

This works, but now you have two Firefox profiles to manage. Different bookmarks, different extensions, different logins. I tried this for about a week before getting annoyed.

## What I actually do: separate browsers

I just use different browsers for each session. Local Wayland gets Firefox. RDP gets Waterfox or Brave.

Both are in the CachyOS repos, no AUR needed:

```bash
sudo pacman -S waterfox-bin brave-bin
```

Waterfox is a Firefox fork, so it feels familiar but uses its own profile directory (`~/.waterfox/`). No lock conflicts. Brave is Chromium-based, so it's a completely separate world.

I went with Waterfox for the RDP session since it's close enough to Firefox that muscle memory carries over. Brave is there as a backup.

### Setting Waterfox as the default in the RDP session

If you want apps in the RDP session to open links in Waterfox instead of fighting with Firefox, set it as the default for that session. Add this to your `~/.xinitrc` (before the `exec dbus-run-session` line from the [xrdp guide](/posts/xrdp-kde-plasma-wayland-black-screen-fix/)):

```bash
export BROWSER=waterfox
```

Or set it through KDE's system settings once you're in the RDP session: Settings > Default Applications > Web Browser.

## Which approach to pick

Use the separate profile if you only RDP in occasionally and don't want extra packages installed. Use separate browsers if you RDP regularly -- it's less friction day to day and you never have to think about it.

I RDP into my machine daily through Guacamole, so separate browsers was the obvious call.

## References

- [Mozilla: Profile in use](https://support.mozilla.org/en-US/kb/profile-in-use)
- [Waterfox](https://www.waterfox.net/)
- [Brave](https://brave.com/)
