+++
title = "When was the last time you tested a restore?"
date = 2025-11-18
description = "23% of backup recoveries fail. 71% of businesses do no failover testing. If you've never tested a restore, you don't have a backup. You have a hope."
draft = false
tags = ['backup', 'disaster-recovery', 'small-business']
categories = ['Small Business IT']
+++

I ask this question in every initial assessment. "When was the last time you tested restoring from backup?" The most common answer is a long pause followed by "I think it's been a while." The second most common answer is "we've never actually done that."

A backup you've never restored from is not a backup. It's a file sitting on a disk that might work. Or might not. You won't find out until the worst possible moment.

<!--more-->

## The numbers are ugly

Let me throw some stats at you that should make you uncomfortable:

- **23% of backup recoveries fail.** Nearly one in four. Those are not good odds when your business is on the line.
- **Only 41% of organizations test their backups more than once per year.** The majority are running on blind faith.
- **71% do no failover testing at all.** They've never actually simulated a real disaster scenario to see if their recovery plan works.
- **93% of businesses without a strategic backup and recovery plan shut down within one year after a substantial data loss.** That's not a scare tactic. That's the math.

## Why backups fail

When a backup recovery fails, the reasons usually fall into a few categories:

**Corrupted backup files.** The backup job ran every night and reported "success," but the actual backup files are corrupted. This happens more often than you'd think, especially with aging storage hardware or backup software that isn't doing integrity checks.

**Missing dependencies.** The backup covered the data, but not the application configuration, the OS settings, the SSL certificates, or the database transaction logs. You restore the VM and it boots, but the application doesn't work because half the pieces are missing.

**Changed infrastructure.** The backup was created on old hardware or an old hypervisor version. The restore target is different enough that the backup won't deploy cleanly. I've seen this with VMware version mismatches and with backups made on physical servers that need to restore to VMs.

**Credential issues.** The backup encryption password is "somewhere in the old admin's email." The recovery key for BitLocker was never documented. The service account that ran the backup agent was decommissioned six months ago.

**Media degradation.** Those backup tapes in the closet? The USB drive in the safe? Storage media degrades. Drives develop bad sectors. Tapes demagnetize. If you haven't verified the media recently, don't assume it's readable.

## What a proper test looks like

A real backup test isn't just "can I open the backup file." It's a full exercise:

1. **Pick a system.** Start with your most critical server.
2. **Restore it to isolated hardware or a test VM.** Don't restore to production. Use a separate network segment or an isolated virtual switch.
3. **Boot it up.** Does the OS start? Does it come up without errors?
4. **Test the application.** Can you log in? Can you access the database? Can you pull up recent records?
5. **Verify the data.** Check timestamps on recent files. Verify the most recent transactions in the database. Make sure you're looking at current data, not data from three months ago.
6. **Document the time.** How long did the entire process take from "start restore" to "application verified"? That's your actual RTO, not the one you assumed.

Do this quarterly at minimum. Monthly is better for critical systems.

## Veeam SureBackup: automated testing

If you're running Veeam (and you should be), SureBackup automates most of this process. Here's how it works:

1. Veeam creates an isolated virtual lab, a walled-off network environment that can't reach production.
2. It restores VMs from your backup into this lab.
3. It boots the VMs and runs verification checks: heartbeat test (is it running?), ping test (is the network stack working?), and application-specific tests (can I connect to the SQL port? Does the web server respond on port 443?).
4. It reports the results and tears down the lab.

You can schedule this to run weekly on your most critical VMs. It takes 30 to 60 minutes per VM depending on size, runs during off-hours, and gives you a verification report every week. No manual effort required.

SureBackup is included in Veeam Community Edition. There's no excuse not to use it.

## The bare minimum

If automated testing isn't in the cards right now, do this at a bare minimum:

- **Monthly:** Open your backup software. Verify that jobs are completing successfully. Look at the actual log, not just the green checkmark.
- **Quarterly:** Restore one file from your most recent backup. Verify it's the right file with the right content.
- **Twice a year:** Do a full VM or server restore to isolated hardware. Time it. Document it.
- **Annually:** Run a full disaster recovery drill. Pretend the server room is gone. Can you rebuild from your offsite backups alone?

## What to do next

If you can't answer "when was the last time you tested a restore?" with a specific date, you have work to do. I can set up automated backup verification with Veeam SureBackup, run a full test restore of your critical systems, and document your actual recovery times.

Email me at chris@chrisputer.tech or visit [/services/](/services/) to schedule an assessment.
