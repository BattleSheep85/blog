+++
title = 'Automated daily Arch Linux updates with rollback (no btrfs required)'
date = 2026-02-22
draft = false
tags = ['linux', 'archlinux', 'cachyos', 'pacman', 'systemd', 'automation', 'xfs']
categories = ['Linux', 'Guides']
description = "Unattended daily pacman updates with automatic reboot, failure detection on login, and a rollback script. No btrfs snapshots needed."
+++

Running `pacman -Syu` every day gets old. But skipping updates for weeks on a rolling-release distro makes the eventual update scarier. I wanted something in between: the machine updates itself at 4 AM, reboots if it worked, and yells at me on login if it didn't.

I also wanted a way to undo the last update without btrfs snapshots. My machines run XFS, so that's not an option.

<!--more-->

## What this sets up

At 4 AM daily, the system runs `pacman -Syu` and reboots on success. If the update fails, it skips the reboot and drops a red warning into your shell the next time you log in. If something breaks after a successful update, a rollback script downgrades everything to the pre-update state using packages still in pacman's cache.

## The update script

This wrapper saves a package snapshot before upgrading and only reboots on success.

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
    # Capture post-upgrade state, then record what changed
    pacman -Q > "$SNAPSHOT_DIR/packages-current.txt"
    diff "$SNAPSHOT_DIR/packages-previous.txt" "$SNAPSHOT_DIR/packages-current.txt" > "$SNAPSHOT_DIR/last-diff.txt" 2>/dev/null
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

## The systemd units

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

`Persistent=true` means if the machine is off at 4 AM, the update runs shortly after the next boot.

### Enable it

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now auto-update.timer
```

Verify:

```bash
systemctl list-timers auto-update.timer
```

## Seed the initial snapshot

Before the first automated run, capture current package state:

```bash
sudo mkdir -p /var/lib/auto-update
pacman -Q | sudo tee /var/lib/auto-update/packages-current.txt > /dev/null
```

## Login warning on failure

If an update fails, you want to know without having to check logs. Add this to your shell config.

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

## The rollback script

This compares your current packages to the pre-update snapshot and downgrades anything that changed, pulling old versions from pacman's cache.

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
        cached=$(find "$CACHE" -name "${pkg}-${ver}-*.pkg.tar.*" ! -name "*.sig" | head -1)
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

It shows what will be downgraded and asks for confirmation.

## Don't clean the cache

Pacman keeps old package versions in `/var/cache/pacman/pkg/`. The rollback script depends on this. On CachyOS, the `paccache.timer` is disabled by default, so all cached versions are kept indefinitely. If you or something else enables it, paccache defaults to keeping the last 3 versions.

Check your cache policy:

```bash
paccache -dk2  # dry run — shows what would be removed keeping 2 versions
```

If you use `paccache` or `pacman -Sc` to clean the cache, you lose the ability to roll back. Keep at least 2 versions.

## How it all fits together

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

- Rollback depth is one update. It keeps the previous snapshot, not a full history. Going further back means btrfs/snapper or manual work.
- New packages aren't removed on rollback. If the update pulled in a new dependency, the rollback downgrades existing packages but won't remove newly added ones.
- Pacman `.pacnew` files aren't handled. If a config file changes upstream, pacman creates a `.pacnew` instead of overwriting yours. Check occasionally with `pacdiff`.
- Kernel rollback needs another reboot. If you roll back the kernel package but already booted into the new kernel, you need to reboot again after the rollback.

## Full installer script

This creates all the files and enables the timer in one shot. Run as root or with sudo.

```bash
#!/bin/bash
set -e

echo "=== Auto-update with rollback setup ==="

# Create the update script
cat > /usr/local/bin/auto-update.sh << 'SCRIPT'
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
    # Capture post-upgrade state, then record what changed
    pacman -Q > "$SNAPSHOT_DIR/packages-current.txt"
    diff "$SNAPSHOT_DIR/packages-previous.txt" "$SNAPSHOT_DIR/packages-current.txt" > "$SNAPSHOT_DIR/last-diff.txt" 2>/dev/null
    echo "STATUS=success" >> "$LOG"
    echo "=== Update finished: $(date) ===" >> "$LOG"
    systemctl reboot
else
    echo "STATUS=failed" >> "$LOG"
    echo "=== Update FAILED: $(date) ===" >> "$LOG"
    # packages-current.txt still has the pre-update state since upgrade failed
fi
SCRIPT
chmod +x /usr/local/bin/auto-update.sh

# Create the rollback script
cat > /usr/local/bin/auto-update-rollback.sh << 'SCRIPT'
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
        cached=$(find "$CACHE" -name "${pkg}-${ver}-*.pkg.tar.*" ! -name "*.sig" | head -1)
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
SCRIPT
chmod +x /usr/local/bin/auto-update-rollback.sh

# Create systemd service
cat > /etc/systemd/system/auto-update.service << 'UNIT'
[Unit]
Description=Auto update and reboot
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/auto-update.sh
UNIT

# Create systemd timer
cat > /etc/systemd/system/auto-update.timer << 'UNIT'
[Unit]
Description=Run auto update daily at 4AM

[Timer]
OnCalendar=*-*-* 04:00:00
Persistent=true

[Install]
WantedBy=timers.target
UNIT

# Seed initial snapshot
mkdir -p /var/lib/auto-update
pacman -Q > /var/lib/auto-update/packages-current.txt

# Enable the timer
systemctl daemon-reload
systemctl enable --now auto-update.timer

echo ""
echo "Done. Auto-updates will run daily at 4 AM."
echo "Check status: systemctl list-timers auto-update.timer"
echo "Rollback:     sudo auto-update-rollback.sh"
```

Save as `setup-auto-update.sh` and run with `sudo bash setup-auto-update.sh`.

After running it, add the login warning to your shell config manually (Fish or Bash, shown earlier in the post).

## References

- [Arch Wiki: pacman](https://wiki.archlinux.org/title/Pacman)
- [Arch Wiki: System maintenance](https://wiki.archlinux.org/title/System_maintenance)
- [Arch Wiki: Downgrading packages](https://wiki.archlinux.org/title/Downgrading_packages)
- [Arch Wiki: systemd/Timers](https://wiki.archlinux.org/title/Systemd/Timers)
