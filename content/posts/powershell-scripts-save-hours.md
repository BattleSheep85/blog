+++
title = "5 PowerShell scripts that save hours every week"
date = 2025-12-18
draft = false
description = "Five practical PowerShell scripts for M365 and Active Directory that automate the tedious stuff: bulk user creation, inactive accounts, license reports, and more."
tags = ['powershell', 'automation', 'microsoft-365', 'small-business']
categories = ['Small Business IT']
+++

I'm a firm believer that if you're doing the same thing more than three times, you should automate it. PowerShell is the tool for that in the Microsoft world, and you don't need to be a developer to use it. These five scripts handle tasks I used to do manually every week. Now they run in seconds and I spend that time on work that actually requires a brain.

Each script is practical, tested, and designed so you can copy it, modify the variables at the top, and run it in your own environment.

<!--more-->

## Before you start

You'll need the Microsoft Graph PowerShell module for the M365 scripts. Install it once:

```powershell
Install-Module Microsoft.Graph -Scope CurrentUser
```

Connect before running any M365 script:

```powershell
Connect-MgGraph -Scopes "User.Read.All","Directory.Read.All","Reports.Read.All"
```

## Script 1: Bulk user creation from CSV

Manually creating 15 new user accounts one at a time in the M365 admin center takes forever. This script reads a CSV file and creates them all in one shot.

**The CSV format (new-users.csv):**
```
DisplayName,UserPrincipalName,Password,Department,JobTitle
Jane Smith,jsmith@contoso.com,TempP@ss123!,Sales,Account Manager
Bob Johnson,bjohnson@contoso.com,TempP@ss123!,Accounting,Staff Accountant
```

**The script:**
```powershell
$users = Import-Csv -Path "C:\Scripts\new-users.csv"

foreach ($user in $users) {
    $passwordProfile = @{
        Password = $user.Password
        ForceChangePasswordNextSignIn = $true
    }

    New-MgUser -DisplayName $user.DisplayName `
        -UserPrincipalName $user.UserPrincipalName `
        -PasswordProfile $passwordProfile `
        -Department $user.Department `
        -JobTitle $user.JobTitle `
        -MailNickname ($user.UserPrincipalName -split "@")[0] `
        -AccountEnabled:$true

    Write-Host "Created: $($user.DisplayName)" -ForegroundColor Green
}
```

I use this every time a client onboards a batch of new hires. Fifteen accounts in 30 seconds instead of 45 minutes of clicking.

## Script 2: Inactive account report

Accounts that haven't signed in for 90 days are either unused licenses you're paying for, or compromised accounts nobody noticed. This script finds them.

```powershell
$daysInactive = 90
$cutoffDate = (Get-Date).AddDays(-$daysInactive).ToString("yyyy-MM-ddTHH:mm:ssZ")

$users = Get-MgUser -All -Property DisplayName,UserPrincipalName,SignInActivity `
    -Filter "accountEnabled eq true"

$inactive = $users | Where-Object {
    $_.SignInActivity.LastSignInDateTime -lt $cutoffDate -or
    $null -eq $_.SignInActivity.LastSignInDateTime
} | Select-Object DisplayName, UserPrincipalName,
    @{N='LastSignIn';E={$_.SignInActivity.LastSignInDateTime}}

$inactive | Sort-Object LastSignIn |
    Export-Csv -Path "C:\Reports\inactive-users.csv" -NoTypeInformation

Write-Host "$($inactive.Count) inactive users found" -ForegroundColor Yellow
```

I run this monthly for every client. It consistently finds 2-5 accounts that should be disabled, which saves real money on licensing.

## Script 3: Shared mailbox audit

Shared mailboxes are free, but they accumulate over time and nobody remembers who has access to what. This script gives you a clean report.

```powershell
$sharedMailboxes = Get-MgUser -All -Filter "mailboxSettings/userPurpose eq 'shared'" `
    -Property DisplayName,UserPrincipalName

$report = foreach ($mb in $sharedMailboxes) {
    # Get mailbox permissions using Exchange Online
    # (requires Connect-ExchangeOnline separately)
    $perms = Get-MailboxPermission -Identity $mb.UserPrincipalName |
        Where-Object { $_.User -notlike "NT AUTHORITY*" -and $_.IsInherited -eq $false }

    foreach ($perm in $perms) {
        [PSCustomObject]@{
            Mailbox    = $mb.DisplayName
            Email      = $mb.UserPrincipalName
            User       = $perm.User
            AccessType = ($perm.AccessRights -join ", ")
        }
    }
}

$report | Export-Csv -Path "C:\Reports\shared-mailbox-audit.csv" -NoTypeInformation
Write-Host "$($sharedMailboxes.Count) shared mailboxes audited" -ForegroundColor Green
```

Note: this one requires the Exchange Online PowerShell module too (`Connect-ExchangeOnline`). Run both connections before executing.

## Script 4: License usage report

This tells you exactly who has which license and whether they're actually using it. Great for finding waste before a renewal.

```powershell
$users = Get-MgUser -All -Property DisplayName,UserPrincipalName,AssignedLicenses

$skus = Get-MgSubscribedSku | Select-Object SkuId, SkuPartNumber

$report = foreach ($user in $users) {
    foreach ($license in $user.AssignedLicenses) {
        $skuName = ($skus | Where-Object { $_.SkuId -eq $license.SkuId }).SkuPartNumber
        [PSCustomObject]@{
            User    = $user.DisplayName
            Email   = $user.UserPrincipalName
            License = $skuName
        }
    }
}

$report | Export-Csv -Path "C:\Reports\license-report.csv" -NoTypeInformation

# Summary
$report | Group-Object License |
    Select-Object Name, Count |
    Sort-Object Count -Descending |
    Format-Table -AutoSize
```

Last time I ran this for a client, we found 8 licenses assigned to former employees whose accounts were disabled but never had licenses removed. At $12.50/user/month, that was $100/month they'd been wasting for over a year.

## Script 5: Stale device cleanup report

Devices that haven't checked in for 90+ days are either lost, broken, or forgotten. This script finds them so you can clean up Entra ID and Intune.

```powershell
$daysStale = 90
$cutoffDate = (Get-Date).AddDays(-$daysStale)

$devices = Get-MgDevice -All -Property DisplayName,OperatingSystem,
    ApproximateLastSignInDateTime,DeviceId,AccountEnabled |
    Where-Object {
        $_.ApproximateLastSignInDateTime -lt $cutoffDate -and
        $_.AccountEnabled -eq $true
    }

$report = $devices | Select-Object DisplayName, OperatingSystem,
    @{N='LastCheckIn';E={$_.ApproximateLastSignInDateTime}},
    DeviceId |
    Sort-Object LastCheckIn

$report | Export-Csv -Path "C:\Reports\stale-devices.csv" -NoTypeInformation
Write-Host "$($report.Count) stale devices found" -ForegroundColor Yellow
```

Stale device records in Entra ID are a security risk. Each one is a potential entry point that nobody is monitoring. Clean them out regularly.

## Making these run automatically

Once you're comfortable with a script, schedule it with Task Scheduler or Azure Automation to run weekly or monthly. Have it email you the CSV report so you don't even have to think about it. That's the whole point of automation: set it up once and move on to something more interesting.

## What to do next

If you're spending hours every week on repetitive M365 admin tasks, there's probably a script that can do it in seconds. I build custom automation for small businesses all the time, and the ROI is usually obvious within the first month.

Reach out at chris@chrisputer.tech or visit [my services page](/services/) to see how I can help.
