+++
title = "Running LLMs locally: the 2026 practical guide"
date = 2026-02-14
draft = false
tags = ['llm', 'ai', 'homelab', 'linux']
categories = ['Linux']
description = "How to run large language models locally in 2026. Hardware tiers, Ollama setup, model recommendations, and the real cost comparison vs API access."
+++

Running LLMs on your own hardware went from a novelty to genuinely practical in the last two years. The models got better, the quantization got smarter, and Ollama made the tooling as simple as pulling a Docker image. If you have a decent GPU, you can run models locally that would have required a data center not long ago. Here's the practical guide for 2026.

<!--more-->

## Hardware tiers: what you need

The bottleneck for local LLMs is VRAM (GPU memory). The model needs to fit in VRAM for decent performance. CPU inference works but is painfully slow for anything above 7B parameters.

### Tier 1: 8GB VRAM ($200-400)
**GPUs:** RTX 3060 12GB (actually 12GB, best budget option), RTX 4060, RX 7600 XT

**What runs:** 7-8B parameter models comfortably. These are surprisingly capable for coding assistance, summarization, and general chat.

**Models at this tier:**
- Llama 3.1 8B (Meta, general purpose)
- DeepSeek-R1-Distill-Qwen-7B (reasoning focused)
- Mistral 7B (fast, efficient)
- Qwen 2.5 7B (strong multilingual)

### Tier 2: 16GB VRAM ($400-700)
**GPUs:** RTX 4060 Ti 16GB, RTX 5060 (when available), RX 7800 XT 16GB

**What runs:** 14B parameter models natively, 32B quantized (Q4) with some offloading.

**Models at this tier:**
- Qwen 2.5 14B (excellent general purpose)
- DeepSeek-R1-Distill-Qwen-14B
- Llama 3.1 14B

### Tier 3: 24GB VRAM ($800-1,200) - The sweet spot
**GPUs:** RTX 3090 (used, $600-800), RTX 4090 ($1,600 new), RTX 5080 (when available)

**What runs:** 32B models natively, 70B quantized (Q4) with partial offloading. This is where local LLMs get seriously good.

**Models at this tier:**
- Qwen 2.5 32B (my daily driver for coding)
- Llama 3.3 70B Q4 (with some CPU offloading)
- DeepSeek-R1-Distill-Llama-70B Q4
- Codestral 22B (specialized for code)

### Tier 4: 48GB+ VRAM ($2,000+)
**GPUs:** Two RTX 3090s, dual RTX 4090s, or professional cards (A6000, L40S)

**What runs:** 70B+ models fully in VRAM. Full-precision 32B models. Basically anything that isn't a 400B+ model.

For most people, Tier 3 (24GB VRAM) is the sweet spot. A used RTX 3090 for $700 runs 32B models at 15-20 tokens/second, which is faster than most API responses.

## Ollama: Docker for LLMs

Ollama is the easiest way to run models locally. One binary, one command, done. It handles model downloading, quantization selection, GPU detection, and serves an OpenAI-compatible API.

### Install

```bash
# CachyOS/Arch
sudo pacman -S ollama

# Or the universal installer
curl -fsSL https://ollama.com/install.sh | sh
```

Start the service:

```bash
sudo systemctl enable --now ollama
```

### Pull and run a model

```bash
# Pull a model (downloads it)
ollama pull qwen2.5:32b

# Run it interactively
ollama run qwen2.5:32b

# List installed models
ollama list
```

That's it. Ollama detects your GPU, loads the model into VRAM, and gives you an interactive chat. First pull takes a while (32B Q4 is about 20GB), but after that it starts in seconds.

### The API

Ollama serves an OpenAI-compatible API on port 11434:

```bash
# Chat completion
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5:32b",
    "messages": [{"role": "user", "content": "Write a bash script to check disk usage"}]
  }'
```

This means any tool that supports the OpenAI API can point at your local Ollama instance. VS Code extensions, Continue.dev, Open WebUI, custom scripts, whatever.

### Open WebUI

For a ChatGPT-like web interface:

```yaml
services:
  open-webui:
    image: ghcr.io/open-webui/open-webui:main
    container_name: open-webui
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/backend/data
    environment:
      OLLAMA_BASE_URL: "http://host.docker.internal:11434"
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Open WebUI gives you conversations, model switching, image generation, RAG (document Q&A), and multi-user support. It's excellent.

## Model recommendations for 2026

These are the models I've actually tested and use regularly:

**General purpose / chat:**
- Qwen 2.5 72B (if you have the VRAM) or 32B (sweet spot)
- Llama 3.3 70B (Meta's latest, strong all-rounder)

**Coding:**
- Qwen 2.5 Coder 32B (my pick for coding assistance)
- Codestral 22B (Mistral's code model, fast)
- DeepSeek Coder V2 (good at reasoning through complex code)

**Reasoning / problem solving:**
- DeepSeek-R1 or its distilled variants (chain-of-thought reasoning)
- Qwen 2.5 with reasoning prompts

**Small and fast (for quick tasks):**
- Llama 3.2 3B (runs on anything, good for simple tasks)
- Phi-3 Mini (Microsoft, 3.8B, surprisingly capable)

## The cost comparison

Let's do real math.

**API costs (rough estimates for heavy use):**
- OpenAI GPT-4o: $50-150/month depending on usage
- Claude API: $50-200/month
- Mix of APIs for different tasks: $100-500/month

**Local hardware costs:**
- RTX 3090 used: $700
- Rest of the system (if you need one): $500-800
- Electricity: $10-15/month (GPU draws 100-350W under load, but only when running inference)

**Total local cost: $1,200-2,500 upfront, $10-15/month ongoing.**

**Payback period: 3-8 months** depending on your API usage.

After that, it's essentially free (minus electricity). You also get:
- No rate limits
- No API keys to manage
- No data leaving your network
- No usage tracking
- Works offline

The privacy angle matters. If you're processing sensitive documents, client data, or personal information, keeping it local means you don't have to trust a third party's data retention policies.

## Performance expectations

With a 24GB GPU (RTX 3090) running Qwen 2.5 32B Q4:

- **Tokens per second:** 15-25 (prompt evaluation is faster, generation is the bottleneck)
- **Time to first token:** 1-3 seconds
- **Context length:** 32K tokens (model dependent)

For comparison, ChatGPT streams at roughly 30-60 tokens/second. Local is slower, but not painfully so. For coding tasks where you're reading the output anyway, 15-20 tokens/second is perfectly usable.

## Tips for getting the most out of local LLMs

**Use the right model for the task.** Don't use a 70B model for simple text formatting. A 7B model handles that instantly. Switch models based on complexity.

**Quantization matters.** Q4_K_M is the sweet spot for most models. Good quality, reasonable size. Q5 is slightly better quality but larger. Q3 or lower gets noticeably worse.

**Context length costs VRAM.** A 32B model with 4K context uses less VRAM than the same model with 32K context. If you don't need long context, don't set it unnecessarily high.

**CPU offloading works but is slow.** Ollama can offload layers to system RAM when the model doesn't fully fit in VRAM. This works and lets you run bigger models, but the layers on CPU are 5-10x slower. It's usable for one-off tasks, not for interactive chat.

If you're getting into local LLMs and want to compare notes on hardware or models, email me at chris@chrisputer.tech.
