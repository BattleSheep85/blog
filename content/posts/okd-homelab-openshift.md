+++
title = "OKD in your homelab: OpenShift community edition on bare metal"
date = 2026-01-27
draft = false
tags = ['okd', 'openshift', 'homelab', 'kubernetes']
categories = ['Homelab']
description = "Running OKD (OpenShift community edition) in your homelab on bare metal. Covers SNO, multi-node UPI, DNS requirements, and why it's worth the pain."
+++

OKD is the community distribution of Red Hat OpenShift. It's Kubernetes with opinions: built-in image registry, CI/CD pipelines, a web console that doesn't suck, OAuth, role-based access, and operators for managing everything. If you're interested in OpenShift for career reasons or you just want the most feature-complete Kubernetes distribution, you can run it at home. It's just not as simple as `curl | sh`.

<!--more-->

## Why bother with OKD?

Vanilla Kubernetes (or K3s) gives you container orchestration. OKD gives you a platform. The difference is significant:

- **Web console.** A real UI for managing deployments, viewing logs, monitoring resources, and creating routes. It's genuinely useful, not a bolted-on afterthought.
- **Built-in CI/CD.** Tekton pipelines and BuildConfigs for building images from source.
- **Integrated image registry.** Push images to the cluster's registry directly.
- **OAuth and RBAC.** Proper multi-user auth with htpasswd, LDAP, or OIDC.
- **Operators.** The Operator Lifecycle Manager (OLM) for installing and managing cluster add-ons.
- **Immutable infrastructure.** OKD runs on Fedora CoreOS, which auto-updates and is designed to be managed declaratively.

If you're eyeing OpenShift skills for work (and the job market values them highly), OKD is the free way to get hands-on experience with the same platform.

## Three install paths

### 1. CRC (CodeReady Containers) for testing

CRC runs a minimal OpenShift cluster inside a VM on your laptop. It's the quickest way to poke around the console and deploy a few test apps.

```bash
# Download from https://console.redhat.com/openshift/create/local
crc setup
crc start
```

Requirements: 9GB free RAM, 4 CPU cores, 35GB disk. It's heavy for a laptop but fine for a workstation.

**Limitations:** Single-node only, not meant for real workloads, can't add nodes, limited storage. It's a sandbox, not a homelab.

### 2. SNO (Single Node OpenShift) for a real single-server setup

SNO runs the full OKD control plane and worker on one machine. This is what I'd recommend for most homelabs.

**Minimum requirements:**
- 8 vCPUs (16 recommended)
- 16GB RAM (32GB+ recommended, 64GB ideal)
- 120GB storage (NVMe preferred)
- One static IP

With 32GB RAM you can run the platform plus a dozen or so application pods comfortably. At 16GB it works but you're tight. 64GB gives you room to breathe.

### 3. Multi-node UPI (User Provisioned Infrastructure)

The full experience: 3 control plane nodes + worker nodes. This is how you'd deploy in production.

**Minimum for multi-node:**
- 3 control plane machines: 4 vCPU, 16GB RAM each
- 1+ worker machines: 4 vCPU, 16GB RAM each
- That's 64GB+ RAM for the cluster before you run anything

Unless you have a closet full of hardware, SNO is the practical choice.

## DNS: where everyone gets stuck

OKD has strict DNS requirements. If you don't get these right, the install will fail. Period. No shortcuts.

You need three DNS records pointing to your OKD node:

```
api.okd.homelab.local       -> 10.0.10.50
api-int.okd.homelab.local   -> 10.0.10.50
*.apps.okd.homelab.local    -> 10.0.10.50
```

The first two (`api` and `api-int`) are A records. The third is a wildcard A record. All three are mandatory.

If you're running AdGuard Home or Pi-hole for DNS, add these as custom DNS rewrites or local records. If you're using a MikroTik as your DNS server:

```
/ip dns static add name=api.okd.homelab.local address=10.0.10.50
/ip dns static add name=api-int.okd.homelab.local address=10.0.10.50
/ip dns static add name=*.apps.okd.homelab.local address=10.0.10.50 type=A
```

Alternatively, run a dedicated BIND or dnsmasq instance for the OKD cluster zone.

## SNO install walkthrough

This is the condensed version. The full docs are at [docs.okd.io](https://docs.okd.io).

### 1. Get the installer and CLI

```bash
# Download the OKD installer and oc CLI
# Check https://github.com/okd-org/okd/releases for the latest version
wget https://github.com/okd-org/okd/releases/download/4.17.0-okd/openshift-install-linux.tar.gz
wget https://github.com/okd-org/okd/releases/download/4.17.0-okd/openshift-client-linux.tar.gz

tar xzf openshift-install-linux.tar.gz
tar xzf openshift-client-linux.tar.gz
sudo mv openshift-install oc kubectl /usr/local/bin/
```

### 2. Create the install config

```bash
mkdir okd-install && cd okd-install
openshift-install create install-config --dir=.
```

The installer asks for your platform (bare metal), pull secret (get one from [console.redhat.com/openshift/install/pull-secret](https://console.redhat.com/openshift/install/pull-secret)), SSH key, base domain, and cluster name.

Edit `install-config.yaml` for SNO:

```yaml
apiVersion: v1
baseDomain: homelab.local
metadata:
  name: okd
networking:
  networkType: OVNKubernetes
compute:
- name: worker
  replicas: 0
controlPlane:
  name: master
  replicas: 1
platform:
  none: {}
```

Setting `worker replicas: 0` and `master replicas: 1` is what makes it SNO. The single node runs both roles.

### 3. Generate manifests and ignition configs

```bash
openshift-install create manifests --dir=.
openshift-install create ignition-configs --dir=.
```

### 4. Boot from the Fedora CoreOS ISO

Download the Fedora CoreOS live ISO, boot your machine from it, and pass the ignition config:

```bash
# From the CoreOS live environment
sudo coreos-installer install /dev/sda \
  --ignition-url=http://your-http-server/bootstrap.ign \
  --insecure-ignition
```

Reboot and wait. The install takes 30-45 minutes. Monitor it:

```bash
openshift-install wait-for bootstrap-complete --dir=. --log-level=info
openshift-install wait-for install-complete --dir=. --log-level=info
```

### 5. Access the console

When it's done, the installer prints the console URL and kubeadmin credentials:

```
INFO Install complete!
INFO Access the OpenShift web console here: https://console-openshift-console.apps.okd.homelab.local
INFO Login to the console with user: "kubeadmin", and password: "xxxxx-xxxxx-xxxxx-xxxxx"
```

## Post-install essentials

```bash
# Set up oc CLI
export KUBECONFIG=~/okd-install/auth/kubeconfig

# Check cluster status
oc get clusterversion
oc get nodes
oc get co  # cluster operators, all should be Available=True

# Create a real user (don't keep using kubeadmin)
# Set up htpasswd identity provider
htpasswd -c -B users.htpasswd chris
oc create secret generic htpasswd-secret --from-file=htpasswd=users.htpasswd -n openshift-config
```

## Is it worth the effort?

The install process is more involved than K3s or even kubeadm. The DNS requirements are strict. The resource requirements are heavy. But what you get is a complete platform that mirrors what enterprises run in production. If OpenShift skills are relevant to your career, running OKD at home is the best way to build real experience.

If you're stuck on the OKD install (especially DNS), shoot me an email at chris@chrisputer.tech. The DNS part trips up almost everyone on the first try.
