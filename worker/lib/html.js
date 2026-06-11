import { escapeHtml } from './utils.js';

// Tagged template literal for safe HTML — auto-escapes interpolated values
export function html(strings, ...values) {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      const val = values[i];
      // Allow raw HTML from other html`` calls (marked with __html brand)
      if (val && typeof val === 'object' && '__html' in val) {
        result += val.__html;
      } else if (Array.isArray(val)) {
        // Join arrays (for .map() results that are already html-branded or strings)
        result += val
          .map((v) => (v && typeof v === 'object' && '__html' in v ? v.__html : escapeHtml(String(v ?? ''))))
          .join('');
      } else {
        result += escapeHtml(String(val ?? ''));
      }
    }
  }
  return result;
}

// Mark a string as safe raw HTML (use sparingly)
export function raw(s) {
  return { __html: s };
}

// JSON-LD <script> block builder. Escapes '<' so untrusted strings inside the
// object (queries, summaries, product names) can never break out of the
// script element with a literal '</script>' — JSON.stringify alone does NOT
// protect against that.
export function jsonLdScript(obj) {
  return '<script type="application/ld+json" nonce="__CSP_NONCE__">' + JSON.stringify(obj).replace(/</g, '\\u003c') + '</script>';
}

// Google truncates meta descriptions at ~160 chars. Cap at 155 to leave room for ellipsis.
function capDescription(desc) {
  if (desc.length <= 155) return desc;
  const clipped = desc.slice(0, 155);
  const lastSpace = clipped.lastIndexOf(' ');
  const base = lastSpace > 100 ? clipped.slice(0, lastSpace) : clipped;
  return base.replace(/[\s.,;:!?-]+$/, '') + '…';
}

export function layout(title, description, body, extra_head = '', meta) {
  const escapedTitle = escapeHtml(title);
  const escapedDesc = escapeHtml(capDescription(description));
  const ogType = meta?.ogType ?? 'website';
  const ogUrl = meta?.ogUrl ? `\n<meta property="og:url" content="${escapeHtml(meta.ogUrl)}">` : '';
  const rawOgImage = meta?.ogImage ?? '/og.png';
  const ogImage = rawOgImage.startsWith('http') ? rawOgImage : `https://chrisputer.tech${rawOgImage}`;
  const ogImageType = ogImage.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
  const twitterCard = meta?.twitterCard ?? 'summary_large_image';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapedTitle} | Chrisputer Labs</title>
<meta name="description" content="${escapedDesc}">
<meta property="og:title" content="${escapedTitle} | Chrisputer Labs">
<meta property="og:description" content="${escapedDesc}">
<meta property="og:type" content="${ogType}">${ogUrl}
<meta property="og:site_name" content="Chrisputer Labs">
<meta property="og:locale" content="en_US">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escapedTitle} — Chrisputer Labs">
<meta property="og:image:type" content="${ogImageType}">
<meta name="twitter:card" content="${twitterCard}">
<meta name="twitter:title" content="${escapedTitle} | Chrisputer Labs">
<meta name="twitter:description" content="${escapedDesc}">
<meta name="twitter:image" content="${escapeHtml(ogImage)}">
<meta name="twitter:image:alt" content="${escapedTitle} — Chrisputer Labs">${
    meta?.canonical ? `\n<link rel="canonical" href="${escapeHtml(meta.canonical)}">` : ''
  }${
    meta?.article && ogType === 'article'
      ? (
          (meta.article.publishedTime ? `\n<meta property="article:published_time" content="${escapeHtml(meta.article.publishedTime)}">` : '') +
          (meta.article.modifiedTime ? `\n<meta property="article:modified_time" content="${escapeHtml(meta.article.modifiedTime)}">` : '') +
          (meta.article.author ? `\n<meta property="article:author" content="${escapeHtml(meta.article.author)}">` : '') +
          (meta.article.section ? `\n<meta property="article:section" content="${escapeHtml(meta.article.section)}">` : '') +
          (meta.article.tags ? meta.article.tags.map((t) => `\n<meta property="article:tag" content="${escapeHtml(t)}">`).join('') : '')
        )
      : ''
  }
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/favicon.svg">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#2563eb">
<link rel="alternate" type="application/atom+xml" title="Chrisputer Labs — Research Feed" href="/feed.xml">
<link rel="search" type="application/opensearchdescription+xml" title="Chrisputer Labs" href="/opensearch.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<script nonce="__CSP_NONCE__">
(function () {
var t = localStorage.getItem('theme');
if (t === 'light') { document.documentElement.classList.remove('dark'); }
else if (t === 'dark') { document.documentElement.classList.add('dark'); }
else if (window.matchMedia('(prefers-color-scheme: light)').matches) { document.documentElement.classList.remove('dark'); }
})();
</script>
<link rel="stylesheet" href="/css/tailwind.css">
<link rel="stylesheet" href="/css/app.css">
${extra_head}
</head>
<body class="bg-bg text-ink-2 font-sans antialiased min-h-screen flex flex-col">
<a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-accent-strong focus:px-4 focus:py-2 focus:font-semibold focus:text-white">Skip to main content</a>

<header class="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-md print:hidden">
<div class="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
<a href="/" class="text-lg font-semibold tracking-tight text-ink">True<span class="font-serif italic text-accent">Rank</span></a>
<nav class="flex items-center gap-6" aria-label="Main navigation">
<a href="/" class="hidden text-body-sm text-ink-2 transition-colors hover:text-ink sm:inline">Home</a>
<a href="/research" class="hidden text-body-sm text-ink-2 transition-colors hover:text-ink sm:inline">Browse</a>
<a href="/best/" class="hidden text-body-sm text-ink-2 transition-colors hover:text-ink sm:inline">Guides</a>
<a href="/about" class="hidden text-body-sm text-ink-2 transition-colors hover:text-ink sm:inline">About</a>
<button id="theme-toggle" type="button" class="rounded-lg p-2 text-ink-3 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60" aria-label="Toggle light and dark theme">
<svg id="icon-moon" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
<svg id="icon-sun" class="hidden h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
</button>
</nav>
</div>
</header>
<script nonce="__CSP_NONCE__">
(function(){
// Theme toggle. The pre-paint bootstrap above sets the initial class; here we
// only wire the button and keep the moon/sun icons in sync.
var btn=document.getElementById('theme-toggle');
if(!btn)return;
function sync(isDark){
var moon=document.getElementById('icon-moon'),sun=document.getElementById('icon-sun');
if(moon&&sun){moon.classList.toggle('hidden',!isDark);sun.classList.toggle('hidden',isDark)}
}
sync(document.documentElement.classList.contains('dark'));
btn.addEventListener('click',function(){
var isDark=document.documentElement.classList.toggle('dark');
localStorage.setItem('theme',isDark?'dark':'light');
sync(isDark);
});
})();
</script>
<main id="main" class="flex-1">${body}</main>
<footer class="border-t border-line print:hidden">
<div class="mx-auto max-w-5xl px-6 py-12">
<div class="flex flex-col gap-8 md:flex-row md:justify-between">
<div class="max-w-xs">
<a href="/" class="text-lg font-semibold tracking-tight text-ink">True<span class="font-serif italic text-accent">Rank</span></a>
<p class="mt-3 text-body-sm text-ink-3">Honest product research, with receipts.</p>
</div>
<div class="flex gap-12">
<div class="flex flex-col gap-2">
<span class="text-overline uppercase text-ink-3">Explore</span>
<a href="/best/" class="text-body-sm text-ink-2 hover:text-ink">Guides</a>
<a href="/research" class="text-body-sm text-ink-2 hover:text-ink">Browse</a>
<a href="/about" class="text-body-sm text-ink-2 hover:text-ink">About</a>
</div>
<div class="flex flex-col gap-2">
<span class="text-overline uppercase text-ink-3">More</span>
<a href="/feed.xml" rel="alternate" type="application/atom+xml" class="text-body-sm text-ink-2 hover:text-ink">Atom feed</a>
<a href="/sitemap.xml" class="text-body-sm text-ink-2 hover:text-ink">Sitemap</a>
</div>
</div>
</div>
<div class="mt-10 border-t border-line pt-6">
<p class="max-w-[80ch] text-caption text-ink-3">As an Amazon Associate, Chrisputer Labs earns from qualifying purchases. Product data is compiled from public sources, and our rankings are never influenced by affiliate relationships.</p>
</div>
</div>
</footer>
</body>
</html>`;
}
