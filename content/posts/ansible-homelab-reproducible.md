+++
title = "Ansible for your homelab: make it reproducible"
date = 2026-02-10
draft = false
tags = ['ansible', 'automation', 'homelab']
categories = ['Homelab']
description = "Use Ansible to automate your homelab setup. Agentless, idempotent, and version controlled. Start with a simple playbook and build from there."
+++

The worst feeling in a homelab is spending an entire weekend rebuilding a machine because you forgot how you configured it six months ago. Ansible fixes this. Write a playbook once, commit it to Git, and you can reproduce your entire setup on a fresh machine in minutes. No agents to install, no master server to maintain.

<!--more-->

## Why Ansible for a homelab?

There are fancier tools (Puppet, Chef, Salt), but Ansible hits the sweet spot for homelab use:

- **Agentless.** It connects over SSH. If you can SSH into a machine, you can manage it with Ansible. No daemon to install, no ports to open, no agent to keep updated.
- **Idempotent.** Run the same playbook 10 times and the result is the same. If a package is already installed, Ansible skips it. If a config file already has the right content, Ansible doesn't touch it.
- **YAML.** Playbooks are plain YAML files. Easy to read, easy to write, easy to version control.
- **Huge module library.** Modules for package management, file manipulation, systemd services, Docker, users, firewall rules, and thousands of other things.

## Install Ansible

On your CachyOS/Arch workstation (the control node):

```bash
sudo pacman -S ansible
```

On Debian/Ubuntu:

```bash
sudo apt install ansible
```

Ansible runs on your workstation and connects to your homelab machines over SSH. The managed machines don't need Ansible installed, just Python (which is on basically every Linux system).

## Set up your inventory

The inventory file tells Ansible about your machines. Create a project directory:

```bash
mkdir -p ~/homelab-ansible
cd ~/homelab-ansible
```

Create `inventory.yml`:

```yaml
all:
  children:
    servers:
      hosts:
        docker-host:
          ansible_host: 10.0.10.10
          ansible_user: chris
        nas:
          ansible_host: 10.0.10.20
          ansible_user: chris
    workstations:
      hosts:
        desktop:
          ansible_host: 10.0.10.5
          ansible_user: chris
```

Test connectivity:

```bash
ansible all -i inventory.yml -m ping
```

If you get green "pong" responses, you're ready.

## Your first playbook: the basics

This playbook handles the stuff every machine needs: updates, essential packages, timezone, and some basic hardening.

Create `playbooks/base-setup.yml`:

```yaml
---
- name: Base system setup
  hosts: all
  become: true

  vars:
    timezone: "America/Chicago"
    common_packages:
      - vim
      - htop
      - tmux
      - curl
      - wget
      - git
      - rsync
      - unzip

  tasks:
    - name: Set timezone
      community.general.timezone:
        name: "{{ timezone }}"

    - name: Update all packages (Arch-based)
      community.general.pacman:
        update_cache: true
        upgrade: true
      when: ansible_os_family == "Archlinux"

    - name: Update all packages (Debian-based)
      ansible.builtin.apt:
        update_cache: true
        upgrade: dist
      when: ansible_os_family == "Debian"

    - name: Install common packages (Arch-based)
      community.general.pacman:
        name: "{{ common_packages }}"
        state: present
      when: ansible_os_family == "Archlinux"

    - name: Install common packages (Debian-based)
      ansible.builtin.apt:
        name: "{{ common_packages }}"
        state: present
      when: ansible_os_family == "Debian"

    - name: Enable and start sshd
      ansible.builtin.systemd:
        name: sshd
        enabled: true
        state: started

    - name: Disable password authentication for SSH
      ansible.builtin.lineinfile:
        path: /etc/ssh/sshd_config
        regexp: '^#?PasswordAuthentication'
        line: 'PasswordAuthentication no'
      notify: Restart sshd

  handlers:
    - name: Restart sshd
      ansible.builtin.systemd:
        name: sshd
        state: restarted
```

Run it:

```bash
ansible-playbook -i inventory.yml playbooks/base-setup.yml
```

Ansible connects to each machine, checks the current state, and only makes changes where needed. The first run might take a few minutes. Subsequent runs are fast because most tasks report "ok" (already in desired state).

## Docker host playbook

Create `playbooks/docker-host.yml`:

```yaml
---
- name: Set up Docker host
  hosts: servers
  become: true

  tasks:
    - name: Install Docker (Arch-based)
      community.general.pacman:
        name:
          - docker
          - docker-compose
        state: present
      when: ansible_os_family == "Archlinux"

    - name: Install Docker (Debian-based)
      block:
        - name: Add Docker GPG key
          ansible.builtin.apt_key:
            url: https://download.docker.com/linux/ubuntu/gpg
            state: present

        - name: Add Docker repository
          ansible.builtin.apt_repository:
            repo: "deb https://download.docker.com/linux/ubuntu {{ ansible_distribution_release }} stable"
            state: present

        - name: Install Docker packages
          ansible.builtin.apt:
            name:
              - docker-ce
              - docker-ce-cli
              - containerd.io
              - docker-compose-plugin
            state: present
            update_cache: true
      when: ansible_os_family == "Debian"

    - name: Enable and start Docker
      ansible.builtin.systemd:
        name: docker
        enabled: true
        state: started

    - name: Add user to docker group
      ansible.builtin.user:
        name: chris
        groups: docker
        append: true

    - name: Create homelab directory structure
      ansible.builtin.file:
        path: "/home/chris/homelab/{{ item }}"
        state: directory
        owner: chris
        group: chris
        mode: '0755'
      loop:
        - portainer
        - uptime-kuma
        - nginx-proxy-manager
        - vaultwarden
        - homepage

    - name: Copy Docker Compose files
      ansible.builtin.copy:
        src: "files/docker/{{ item }}/docker-compose.yml"
        dest: "/home/chris/homelab/{{ item }}/docker-compose.yml"
        owner: chris
        group: chris
        mode: '0644'
      loop:
        - portainer
        - uptime-kuma
        - nginx-proxy-manager
        - vaultwarden
        - homepage
```

Store your Compose files in `files/docker/<service>/docker-compose.yml` alongside the playbook. Now your entire Docker setup is version controlled and reproducible.

## The "nuke and pave" test

Here's how you know your automation actually works:

1. Spin up a fresh VM or reinstall a test machine.
2. Add your SSH key to it.
3. Add it to your Ansible inventory.
4. Run your playbooks.
5. Verify everything works.

If you can go from a bare OS install to a fully configured machine with all your services running just by running playbooks, your automation is solid. If you had to SSH in and fix things manually, those manual fixes need to go into the playbook.

I do this test every few months. It always catches something I forgot to codify. A config file tweak, a sysctl setting, a firewall rule. Adding it to the playbook means I'll never forget it again.

## Project structure

As your playbooks grow, organize them:

```
homelab-ansible/
├── inventory.yml
├── ansible.cfg
├── playbooks/
│   ├── base-setup.yml
│   ├── docker-host.yml
│   ├── monitoring.yml
│   └── nas.yml
├── files/
│   └── docker/
│       ├── portainer/
│       │   └── docker-compose.yml
│       └── ...
├── templates/
│   ├── prometheus.yml.j2
│   └── sshd_config.j2
└── roles/
    └── (as your playbooks get complex)
```

Create `ansible.cfg` to set defaults:

```ini
[defaults]
inventory = inventory.yml
remote_user = chris
private_key_file = ~/.ssh/id_ed25519

[privilege_escalation]
become = true
become_method = sudo
```

## Version control

Put the whole thing in Git:

```bash
cd ~/homelab-ansible
git init
git add .
git commit -m "Initial homelab ansible setup"
```

Push it to your Gitea instance or a private GitHub repo. Now your entire homelab configuration is documented, versioned, and reproducible. When you make a change to a playbook, commit it. When something breaks, check the Git log.

This is the real value of Ansible for a homelab. It's not about saving time on a single setup. It's about never losing your configuration knowledge and being able to rebuild from scratch with confidence.

If you're starting with Ansible and want to share playbook ideas, reach out at chris@chrisputer.tech.
