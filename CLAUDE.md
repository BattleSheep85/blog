# Blog Project — Chris's Tech Notes

## Overview
Hugo static blog using PaperMod theme. Content is Linux sysadmin guides, fixes, and notes.

## Structure
- `content/posts/` — Blog posts in Markdown with TOML front matter
- `hugo.toml` — Site config
- `themes/PaperMod/` — Theme (git submodule, don't edit directly)
- `static/` — Static assets (images, etc.)
- `public/` — Generated site (gitignored)

## Commands
- Preview: `hugo server -D` (includes drafts)
- Build: `hugo` (outputs to public/)
- New post: `hugo new content posts/my-post-slug.md`

## Writing Conventions
- Post filenames: lowercase, hyphen-separated slugs
- Front matter: TOML (`+++`) format
- Always include: title, date, tags, categories, description
- Use `<!--more-->` to set the summary break point
- Set `draft = false` when ready to publish

## Deployment
- Target: Cloudflare Pages (or GitHub Pages)
- Deploys on push to main branch
- baseURL in hugo.toml needs updating when domain is set up

## Monetization
- Plan: Google AdSense once there's enough content/traffic
- Ad code will go in a partial template (layouts/partials/adsense.html)
