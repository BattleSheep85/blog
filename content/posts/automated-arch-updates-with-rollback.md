+++
title = 'Automated Daily Arch Linux Updates with Rollback (No Btrfs Required)'
date = 2026-02-25
draft = false
tags = ['linux', 'archlinux', 'cachyos', 'pacman', 'systemd', 'automation', 'xfs']
categories = ['Linux', 'Guides']
description = "Set up unattended daily pacman updates with automatic reboot, failure detection on login, and a rollback script — no btrfs snapshots needed."
+++

Rolling-release distros like Arch need frequent updates. But running `pacman -Syu` every day gets old, and forgetting to update for weeks makes the eventual update riskier.

This guide sets up **fully automated daily updates** with a safety net: package snapshots that let you roll back if something breaks — even on filesystems like XFS that don't support snapshots.

<!--more-->

## What You Get

- **4 AM daily**: system updates and reboots automatically
- **If the update fails**: no reboot, and you get a warning at next login
- **If something breaks**: a rollback script that downgrades everything to the pre-update state using pacman's cache

## The Update Script

This wrapper runs `pacman -Syu`, saves a package snapshot before upgrading, and only reboots on success.

Create `/usr/local/bin/auto-update.sh`:

```bash
#!/bin/bash
LOG="/var/log/auto-update.log"
SNAPSHOT_DIR="/var/lib/auto-update"
mkdir -p "$SNAPSHOT_DIR"

echo "=== Update started: $(date) ===" > "$LOG"

# Save current package state before updating
cp "$SNAPSHOT_DIR/packages-current.txt" "$SNAPSHOT_DIR/packages-previous.txt" 2>/dev/null
pacman -Q > "$SNAPSHOT_DIR/packages-current.txt"
echo "Saved package snapshot to $SNAPSHOT_DIR/packages-current.txt" >> "$LOG"

if pacman -Syu --noconfirm >> "$LOG" 2>&1; then
    # Record what actually changed
    diff "$SNAPSHOT_DIR/packages-previous.txt" "$SNAPSHOT_DIR/packages-current.txt" > "$SNAPSHOT_DIR/last-diff.txt" 2>/dev/null
    pacman -Q > "$SNAPSHOT_DIR/packages-current.txt"  # update with post-upgrade state
    echo "STATUS=success" >> "$LOG"
    echo "=== Update finished: $(date) ===" >> "$LOG"
    systemctl reboot
else
    echo "STATUS=failed" >> "$LOG"
    echo "=== Update FAILED: $(date) ===" >> "$LOG"
    # packages-current.txt still has the pre-update state since upgrade failed
fi
```

```bash
sudo chmod +x /usr/local/bin/auto-update.sh
```

## The Systemd Units

### Service

Create `/etc/systemd/system/auto-update.service`:

```ini
[Unit]
Description=Auto update and reboot
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/auto-update.sh
```

### Timer

Create `/etc/systemd/system/auto-update.timer`:

```ini
[Unit]
Description=Run auto update daily at 4AM

[Timer]
OnCalendar=*-*-* 04:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

`Persistent=true` means if the machine is powered off at 4 AM, the update runs shortly after the next boot.

### Enable it

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now auto-update.timer
```

Verify:

```bash
systemctl list-timers auto-update.timer
```

## Seed the Initial Snapshot

Before the first automated run, capture current package state:

```bash
sudo mkdir -p /var/lib/auto-update
pacman -Q | sudo tee /var/lib/auto-update/packages-current.txt > /dev/null
```

## Login Warning on Failure

If an update fails, you want to know about it without having to check logs. Add this to your shell config.

### Fish (`~/.config/fish/config.fish`)

```fish
if status is-login; and test -f /var/log/auto-update.log
    if grep -q 'STATUS=failed' /var/log/auto-update.log
        set_color red
        echo "⚠ Last auto-update FAILED — run 'cat /var/log/auto-update.log' for details"
        set_color normal
    end
end
```

### Bash (`~/.bashrc`)

```bash
if [ -f /var/log/auto-update.log ] && grep -q 'STATUS=failed' /var/log/auto-update.log; then
    echo -e "\e[31m⚠ Last auto-update FAILED — run 'cat /var/log/auto-update.log' for details\e[0m"
fi
```

## The Rollback Script

This is the safety net. It compares your current packages to the pre-update snapshot and downgrades anything that changed, using the old versions still sitting in pacman's cache.

Create `/usr/local/bin/auto-update-rollback.sh`:

```bash
#!/bin/bash
SNAPSHOT_DIR="/var/lib/auto-update"
CACHE="/var/cache/pacman/pkg"
PRE_UPDATE="$SNAPSHOT_DIR/packages-previous.txt"

if [ ! -f "$PRE_UPDATE" ]; then
    echo "No previous package snapshot found. Nothing to roll back to."
    exit 1
fi

echo "Comparing current packages to pre-update snapshot..."
ROLLBACK_LIST=()

while IFS=' ' read -r pkg ver; do
    current_ver=$(pacman -Q "$pkg" 2>/dev/null | awk '{print $2}')
    if [ -n "$current_ver" ] && [ "$current_ver" != "$ver" ]; then
        # Find the old version in the cache
        cached=$(find "$CACHE" -name "${pkg}-${ver}-*.pkg.tar.*" | head -1)
        if [ -n "$cached" ]; then
            ROLLBACK_LIST+=("$cached")
            echo "  $pkg: $current_ver → $ver"
        else
            echo "  $pkg: $current_ver → $ver (NOT IN CACHE — cannot rollback)"
        fi
    fi
done < "$PRE_UPDATE"

if [ ${#ROLLBACK_LIST[@]} -eq 0 ]; then
    echo "Nothing to roll back."
    exit 0
fi

echo ""
echo "${#ROLLBACK_LIST[@]} package(s) to downgrade."
read -p "Proceed? [y/N] " confirm
if [[ "$confirm" =~ ^[Yy]$ ]]; then
    pacman -U --noconfirm "${ROLLBACK_LIST[@]}"
    echo "Rollback complete."
else
    echo "Cancelled."
fi
```

```bash
sudo chmod +x /usr/local/bin/auto-update-rollback.sh
```

### Using it

If something breaks after an update:

```bash
sudo auto-update-rollback.sh
```

It shows you exactly what will be downgraded and asks for confirmation.

## Important: Don't Clean the Cache

Pacman keeps old package versions in `/var/cache/pacman/pkg/`. The rollback script depends on this. By default, CachyOS keeps the last 3 versions.

Check your current cache policy:

```bash
paccache -dk2  # dry run — shows what would be removed keeping 2 versions
```

If you use `paccache` or `pacman -Sc` to clean the cache, you lose the ability to roll back to those versions. Keep at least 2 versions cached.

## How It All Fits Together

```text
4:00 AM
  |
  v
[systemd timer triggers auto-update.service]
  |
  v
[auto-update.sh]
  |-- saves package list to /var/lib/auto-update/
  |-- runs pacman -Syu
  |
  +-- SUCCESS --> reboot
  |                 |
  |                 v
  |              [machine comes back up, life goes on]
  |
  +-- FAILURE --> no reboot
                    |
                    v
                 [next login shows red warning]
                    |
                    v
                 [you run: cat /var/log/auto-update.log]
                    |
                    v
                 [fix manually, or: sudo auto-update-rollback.sh]
```

## Limitations

- **Rollback depth is one update** — it keeps the previous snapshot, not a full history. If you need to go back further, you'd need btrfs/snapper or manual intervention.
- **New packages aren't removed on rollback** — if the update installed a new dependency, the rollback only downgrades existing packages, it won't remove newly added ones.
- **Pacman `.pacnew` files** — if a config file changes upstream, pacman creates a `.pacnew` file instead of overwriting yours. These aren't handled automatically. Check occasionally with `pacdiff`.
- **Kernel updates + rollback** — if you roll back the kernel package but have already rebooted into the new kernel, you'll need another reboot after the rollback.

## References

- [Arch Wiki: pacman](https://wiki.archlinux.org/title/Pacman)
- [Arch Wiki: System maintenance](https://wiki.archlinux.org/title/System_maintenance)
- [Arch Wiki: Downgrading packages](https://wiki.archlinux.org/title/Downgrading_packages)
- [Arch Wiki: systemd/Timers](https://wiki.archlinux.org/title/Systemd/Timers)
