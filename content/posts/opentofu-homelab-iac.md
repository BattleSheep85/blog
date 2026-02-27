+++
title = "OpenTofu for your homelab: infrastructure as code without the HashiCorp drama"
date = 2026-02-12
draft = false
tags = ['opentofu', 'terraform', 'homelab', 'iac']
categories = ['Homelab']
description = "OpenTofu is a drop-in Terraform replacement under the Linux Foundation. Here's how to use it for homelab infrastructure as code."
+++

In August 2023, HashiCorp switched Terraform from the open-source MPL license to the Business Source License (BSL). Then IBM bought HashiCorp for $6.4 billion. The open-source community responded by forking Terraform into OpenTofu under the Linux Foundation. If you've been using Terraform (or want to start with infrastructure as code), OpenTofu is the path forward.

<!--more-->

## What happened and why it matters

HashiCorp's BSL license change means you can't build commercial products that compete with HashiCorp's offerings using Terraform. For homelab use, the BSL doesn't directly affect you. But the principle matters: a tool you depend on changed its license in a way that restricts what you can do with it, and the company was then acquired by IBM. The trajectory isn't reassuring.

OpenTofu is:
- A direct fork of Terraform 1.5.x (the last MPL-licensed version).
- Under the Linux Foundation, so no single company controls it.
- Backed by major contributors including Gruntwork, Spacelift, env0, and others.
- Fully compatible with existing Terraform configs, state files, and providers.
- Growing independently with features like state encryption that Terraform doesn't have.

The provider ecosystem is shared. Over 3,900 Terraform providers work with OpenTofu unchanged. If you have existing Terraform code, switching is a one-word change.

## Install OpenTofu

On CachyOS/Arch:

```bash
paru -S opentofu
```

On Debian/Ubuntu:

```bash
# Add the OpenTofu repository
curl -fsSL https://get.opentofu.org/install-opentofu.sh | sh -s -- --install-method deb
```

On macOS:

```bash
brew install opentofu
```

Verify:

```bash
tofu version
```

## Why IaC in a homelab?

Infrastructure as code might sound like overkill for a homelab. But consider:

- **Reproducibility.** Your Proxmox VMs, DNS records, Cloudflare settings, and cloud resources are all defined in code. Rebuild from scratch without remembering click paths.
- **Version control.** Track changes over time. See what you changed and when. Roll back if something breaks.
- **Learning.** Terraform/OpenTofu skills are some of the most in-demand in DevOps. Practicing at home builds real experience.

## Homelab use cases

### Managing Proxmox VMs

The Proxmox provider lets you define VMs as code:

```hcl
# main.tf
terraform {
  required_providers {
    proxmox = {
      source  = "bpg/proxmox"
      version = "~> 0.50"
    }
  }
}

provider "proxmox" {
  endpoint = "https://proxmox.homelab.local:8006"
  username = "root@pam"
  password = var.proxmox_password
  insecure = true
}

resource "proxmox_virtual_environment_vm" "docker_host" {
  name      = "docker-host"
  node_name = "pve"

  clone {
    vm_id = 9000  # Template VM ID
  }

  cpu {
    cores = 4
    type  = "host"
  }

  memory {
    dedicated = 8192
  }

  disk {
    datastore_id = "local-lvm"
    size         = 100
    interface    = "scsi0"
  }

  network_device {
    bridge  = "vmbr0"
    vlan_id = 10
  }

  initialization {
    ip_config {
      ipv4 {
        address = "10.0.10.10/24"
        gateway = "10.0.10.1"
      }
    }

    user_account {
      keys     = [file("~/.ssh/id_ed25519.pub")]
      username = "chris"
    }
  }
}
```

```bash
tofu init
tofu plan    # See what will be created
tofu apply   # Create the VM
```

Now your VM definition is in Git. Need another one? Copy the resource block, change the name and IP, and apply.

### Managing Cloudflare DNS

If your domain is on Cloudflare, manage DNS records as code:

```hcl
terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

variable "zone_id" {
  default = "your-zone-id"
}

resource "cloudflare_record" "homelab" {
  zone_id = var.zone_id
  name    = "homelab"
  content = var.home_ip
  type    = "A"
  proxied = false
}

resource "cloudflare_record" "wildcard_homelab" {
  zone_id = var.zone_id
  name    = "*.homelab"
  content = var.home_ip
  type    = "A"
  proxied = false
}

resource "cloudflare_record" "mail" {
  zone_id  = var.zone_id
  name     = "@"
  content  = "mail.provider.com"
  type     = "MX"
  priority = 10
}
```

### Managing MikroTik with the RouterOS provider

There's even a MikroTik provider:

```hcl
terraform {
  required_providers {
    routeros = {
      source  = "terraform-routeros/routeros"
      version = "~> 1.0"
    }
  }
}

provider "routeros" {
  hosturl  = "https://10.0.0.1"
  username = "admin"
  password = var.mikrotik_password
  insecure = true
}

resource "routeros_ip_address" "vlan10" {
  address   = "10.0.10.1/24"
  interface = "vlan10-servers"
}

resource "routeros_ip_dhcp_server_network" "vlan10" {
  address    = "10.0.10.0/24"
  gateway    = "10.0.10.1"
  dns_server = "10.0.10.53"
}
```

## State management

OpenTofu tracks what it's managing in a state file. By default, this is `terraform.tfstate` in your project directory.

For a homelab, local state is fine. Just make sure it's backed up and **never commit it to a public Git repo** (it can contain secrets).

Add to `.gitignore`:

```
*.tfstate
*.tfstate.backup
.terraform/
```

OpenTofu also supports state encryption, which Terraform doesn't:

```hcl
terraform {
  encryption {
    key_provider "pbkdf2" "mykey" {
      passphrase = var.state_passphrase
    }
    method "aes_gcm" "encrypt" {
      keys = key_provider.pbkdf2.mykey
    }
    state {
      method   = method.aes_gcm.encrypt
      enforced = true
    }
  }
}
```

This encrypts your state file at rest. Useful if you're storing state in a shared location or backing it up to the cloud.

## OpenTofu vs Terraform: the differences

For homelab use, the differences are minimal right now:

- **Command:** `tofu` instead of `terraform`. That's it.
- **Providers:** Same providers, same registry.
- **State files:** Compatible. You can switch between them.
- **Config language (HCL):** Identical.

OpenTofu is adding features independently (state encryption, client-side functions), and the projects will diverge more over time. But today, switching is trivial.

## Migrating from Terraform

If you have existing Terraform configs:

```bash
# In your Terraform project directory
# No changes to .tf files needed
tofu init       # Downloads providers
tofu plan       # Verify it reads your existing state correctly
tofu apply      # Business as usual
```

The state file format is compatible. Your `.tf` files don't change. It's genuinely a drop-in replacement.

## My recommendation

If you're already using Terraform at home, switch to OpenTofu. It's the same tool under better governance.

If you're new to IaC, start with OpenTofu and skip Terraform entirely. You'll learn the same skills (HCL, providers, state management, modules) without the licensing baggage.

For homelab use, start with one thing: Cloudflare DNS records, Proxmox VMs, or whatever you manage manually that's annoying to recreate. Get that into code, commit it to Git, and expand from there.

If you're exploring IaC for your homelab, feel free to email me at chris@chrisputer.tech.
