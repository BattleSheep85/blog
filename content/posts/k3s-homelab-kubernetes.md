+++
title = "K3s at home: when Kubernetes actually makes sense"
date = 2026-01-25
draft = false
tags = ['kubernetes', 'k3s', 'homelab']
categories = ['Homelab']
description = "When does Kubernetes make sense for a homelab? K3s is a lightweight option, but Docker Compose is simpler for most setups. Here's how to decide and how to get started."
+++

Kubernetes in a homelab is one of those things that's either brilliant or completely overkill depending on your situation. I've run both Docker Compose and K3s at home, and the honest answer is that most homelabbers don't need Kubernetes. But some do, and K3s makes it surprisingly accessible.

<!--more-->

## The case against Kubernetes at home

If you're running fewer than 15 services on a single machine, Docker Compose is simpler in every way:

- One YAML file per service. No manifests, no Helm charts, no custom resource definitions.
- `docker compose up -d` and it's running. No cluster to bootstrap.
- Troubleshooting is straightforward. `docker logs`, `docker exec`, done.
- Backups are simple. Copy the bind mount directories.
- Resource overhead is minimal. Docker uses maybe 100MB of RAM for the daemon. A K3s node uses 500MB-1GB.

Docker Compose doesn't have rolling updates, self-healing, or multi-node scheduling. But for a homelab on one machine, you probably don't need those things. If a container crashes, `restart: unless-stopped` brings it back. If the whole machine goes down, you have bigger problems than container orchestration.

## The case for Kubernetes at home

There are legitimate reasons to run K3s:

**Career skills.** Kubernetes is everywhere in production. If you work in DevOps, SRE, or platform engineering (or want to), running a cluster at home gives you hands-on experience that's hard to get any other way. Reading docs is not the same as debugging a pod stuck in CrashLoopBackOff at midnight.

**Multi-node HA.** If you have 2-3 machines and want services to survive a node failure, Kubernetes handles this natively. Docker Compose on a single machine doesn't.

**GitOps.** Flux or ArgoCD watching a Git repo and automatically deploying changes is a genuinely great workflow. You commit a manifest change, push it, and the cluster reconciles. It's infrastructure as code that actually works smoothly.

**Ingress and service mesh.** Traefik (built into K3s), cert-manager for automatic SSL, and a proper ingress controller make exposing services cleaner than managing Nginx Proxy Manager by hand.

## K3s: Kubernetes without the bloat

K3s is Kubernetes stripped down to a single binary. It was built by Rancher (now SUSE) for edge computing and IoT, but it's perfect for homelabs.

What makes it lightweight:

- Single binary, under 100MB.
- Embedded etcd (or SQLite for single-node). No separate etcd cluster to manage.
- Bundled Traefik ingress controller.
- Bundled CoreDNS and metrics-server.
- Runs on ARM64 and x86_64.
- Uses containerd instead of Docker (less overhead).

It's still real Kubernetes. `kubectl` works. Helm charts work. Any Kubernetes manifest works. You just skip the painful `kubeadm` bootstrap process.

## Installing K3s

### Single node (simplest)

```bash
curl -sfL https://get.k3s.io | sh -
```

That's it. One command. In about 30 seconds you have a working Kubernetes cluster.

```bash
# Check that it's running
sudo k3s kubectl get nodes

# Set up kubectl for your user
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config
export KUBECONFIG=~/.kube/config

kubectl get nodes
```

### Multi-node cluster

On the first node (server):

```bash
curl -sfL https://get.k3s.io | sh -s - server --cluster-init
# Get the join token
sudo cat /var/lib/rancher/k3s/server/node-token
```

On additional server nodes (for HA):

```bash
curl -sfL https://get.k3s.io | sh -s - server \
  --server https://first-node-ip:6443 \
  --token YOUR_TOKEN_HERE
```

On worker nodes:

```bash
curl -sfL https://get.k3s.io | sh -s - agent \
  --server https://first-node-ip:6443 \
  --token YOUR_TOKEN_HERE
```

Three server nodes give you an HA control plane with embedded etcd. Workers are optional but nice for separating workloads.

## Deploying your first service

Here's Uptime Kuma as a Kubernetes deployment:

```yaml
# uptime-kuma.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: uptime-kuma
  namespace: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: uptime-kuma
  template:
    metadata:
      labels:
        app: uptime-kuma
    spec:
      containers:
      - name: uptime-kuma
        image: louislam/uptime-kuma:latest
        ports:
        - containerPort: 3001
        volumeMounts:
        - name: data
          mountPath: /app/data
      volumes:
      - name: data
        hostPath:
          path: /opt/uptime-kuma/data
          type: DirectoryOrCreate
---
apiVersion: v1
kind: Service
metadata:
  name: uptime-kuma
  namespace: monitoring
spec:
  selector:
    app: uptime-kuma
  ports:
  - port: 3001
    targetPort: 3001
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: uptime-kuma
  namespace: monitoring
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  rules:
  - host: status.homelab.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: uptime-kuma
            port:
              number: 3001
  tls:
  - hosts:
    - status.homelab.local
    secretName: uptime-kuma-tls
```

```bash
kubectl create namespace monitoring
kubectl apply -f uptime-kuma.yaml
```

Yeah, that's a lot more YAML than a Docker Compose file. That's the trade-off. More boilerplate, more power.

## Helm: the package manager

Most people don't write raw manifests for everything. Helm charts package up all the YAML into a reusable, configurable template.

```bash
# Install Helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Example: install Grafana from a Helm chart
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm install grafana grafana/grafana --namespace monitoring --create-namespace
```

## GitOps with Flux

This is where K3s at home really starts to shine. Install Flux, point it at a Git repo, and it automatically deploys and updates everything in the cluster based on what's in the repo.

```bash
# Install Flux CLI
curl -s https://fluxcd.io/install.sh | bash

# Bootstrap Flux on your cluster
flux bootstrap github \
  --owner=your-github-username \
  --repository=homelab-k3s \
  --path=clusters/home \
  --personal
```

Now you commit Kubernetes manifests to your repo, push, and Flux applies them to the cluster. Change an image tag, push, and Flux rolls out the update. It's a really clean workflow once it's set up.

## My honest recommendation

**Start with Docker Compose.** Get your services running, learn what you actually use, and figure out your storage and networking needs.

**Move to K3s when:**
- You have 2+ machines and want HA.
- You're pursuing Kubernetes skills for your career.
- You want GitOps-driven deployments.
- Docker Compose starts feeling limiting (15+ services, complex dependencies).

**Don't move to K3s because:**
- You think you "should" be running Kubernetes.
- You saw a cool YouTube video about it.
- You want to pad your resume without actually learning it.

K3s is great, but it's a tool. Use it when it solves a problem you actually have.

If you're debating the Docker vs K3s decision for your setup, feel free to reach out at chris@chrisputer.tech.
