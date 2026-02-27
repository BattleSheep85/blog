+++
title = "NIST says your password policy is wrong"
date = 2026-01-09
draft = false
description = "NIST updated their password guidelines in 2024. Mandatory expiration and complexity rules are out. Long passphrases and MFA are in. Here's what changed and why."
tags = ['passwords', 'security', 'small-business']
categories = ['Small Business IT']
+++

If your company still forces password changes every 90 days and requires uppercase, lowercase, number, and special character, you're following outdated security guidance that NIST says actually makes you less secure. Their August 2024 update to Special Publication 800-63B made it official: mandatory password expiration and arbitrary complexity rules need to go.

This isn't some fringe opinion. NIST (National Institute of Standards and Technology) sets the security standards that federal agencies, defense contractors, and most compliance frameworks reference. When NIST changes direction, the rest of the industry follows.

<!--more-->

## What NIST changed

The August 2024 revision to NIST SP 800-63B (Digital Identity Guidelines) includes several significant changes to password recommendations:

### Eliminate mandatory password expiration

Forced password changes every 30, 60, or 90 days cause people to use weaker passwords. When you know you have to change your password next month, you pick something easy to remember and easy to modify. "Winter2025!" becomes "Spring2026!" becomes "Summer2026!" and an attacker who gets one of those passwords can guess the rest.

NIST now says: don't force password changes unless there's evidence of compromise. If someone's password appears in a breach database or there's suspicious activity on their account, change it immediately. Otherwise, leave it alone.

### Drop arbitrary complexity rules

Requiring uppercase, lowercase, number, and special character leads to predictable patterns. "Password1!" meets every complexity rule and is one of the most common passwords in breach databases. People don't create truly random complex passwords. They create the minimum pattern that satisfies the rules.

NIST now says: require a minimum length (they recommend at least 15 characters for high-security contexts), but don't mandate specific character types.

### Require longer passwords (passphrases)

A 20-character passphrase like "correct horse battery staple" is both easier to remember and harder to crack than an 8-character complex password like "P@ssw0rd!" This isn't new math. It's how entropy works. Length beats complexity every time.

NIST recommends:

- Minimum 8 characters (absolute floor)
- 15+ characters for anything important
- Support for passwords up to 64+ characters
- Allow spaces and all printable ASCII characters

### Screen passwords against known breached lists

This is a big one. NIST says you should check every new password against a database of known compromised passwords and reject any matches. Services like Have I Been Pwned (haveibeenpwned.com) provide APIs for exactly this purpose. If someone tries to set their password to "P@ssword123!" and that string appears in 50,000 breach databases, reject it, regardless of how complex it looks on paper.

## Why this matters right now

Credential abuse is the number one initial attack vector. The Verizon 2025 Data Breach Investigations Report confirms what security professionals have known for years: stolen or weak credentials are how most breaches start. Not sophisticated zero-days, not advanced malware. Just someone using a password that was easy to guess or had already been compromised.

The old password policies actually contribute to this problem:

- Forced rotation leads to weaker passwords
- Complexity rules create predictable patterns
- Users reuse passwords across services because they can't remember unique complex passwords that change every 90 days
- Password fatigue drives people to write passwords on sticky notes or use the same base password everywhere

## What to do about it

### Step 1: Update your password policy

Rewrite your company password policy to align with NIST's current guidance:

- Minimum 15 characters for all accounts
- No mandatory expiration (change on evidence of compromise only)
- No complexity rules (length is the requirement)
- Screen new passwords against breach databases
- Allow passphrases with spaces

### Step 2: Deploy a password manager

A password manager (Bitwarden, 1Password, Keeper) solves the human memory problem. Users create one strong master password (a passphrase) and the manager generates and stores unique, random passwords for everything else.

Bitwarden Teams runs $4/user/month. For a 15-person office, that's $60/month. Compared to the cost of a breach (average $120K-150K for small businesses), it's not even a rounding error.

### Step 3: Require MFA everywhere

A strong password is table stakes. MFA is the real defense. Even if an attacker gets the password, they can't log in without the second factor.

For M365, enable Security Defaults (free) at minimum. Better: use Conditional Access with phishing-resistant MFA (Microsoft Authenticator with number matching or FIDO2 security keys) for admin accounts.

### Step 4: Monitor for compromised credentials

Use a service that monitors breach databases for your company's email addresses and passwords. Microsoft Entra ID Protection (included in Business Premium) does this automatically for M365 accounts. For everything else, tools like SpyCloud or Have I Been Pwned's domain search can alert you when employee credentials appear in a breach.

## The pushback you'll get

"But our cyber insurance requires password changes every 90 days!"

Maybe. Read the actual policy language. Many insurers are updating their requirements to align with current NIST guidance. If yours hasn't, showing them NIST SP 800-63B and explaining that you're following federal security standards is usually enough.

"Our compliance framework requires complexity rules."

Some older compliance frameworks haven't caught up yet. But NIST's guidelines are referenced by most major frameworks, and auditors increasingly accept NIST-aligned password policies. Document your policy, cite the NIST publication, and you'll be in a strong position during any audit.

"Users will pick terrible passwords if we remove complexity rules."

That's what the breach database screening is for. You're not removing security. You're replacing one ineffective control (complexity rules) with a more effective one (screening against known compromised passwords) plus a better primary control (length).

## What to do next

If your password policy still says "8 characters minimum, change every 90 days, must include uppercase, lowercase, number, and special character," it's time for an update. I can help you write a modern password policy, deploy a password manager, and configure MFA properly across your environment.

Reach out at chris@chrisputer.tech or visit [my services page](/services/) to get started.
