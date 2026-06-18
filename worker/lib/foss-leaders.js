// Curated category → leading self-hosted / open-source projects. The INVERSE of
// the churn denylist (brand-quality.js): these are best-in-class community
// projects that commercial "best app" listicles systematically ignore, so a
// generic web search never surfaces them. When a query matches a category, we
// inject explicit BY-NAME searches ("Immich review", …) to GUARANTEE their
// sources are fetched; the synth's open-source rule then includes them on merit.
//
// DESIGN — conservative + evidence-driven, same discipline as the denylist: only
// genuine category leaders go here. `match` strings are tested as substrings
// against the lowercased query. Grow from real recall-gap reports.
const FOSS_LEADERS = [
  { match: ['photo backup', 'photo and video backup', 'video backup', 'google photos', 'icloud photo', 'photo storage', 'backup photos'], projects: ['Immich', 'PhotoPrism', 'Ente'] },
  { match: ['file backup', 'file sync', 'dropbox alternative', 'cloud storage', 'sync files'], projects: ['Nextcloud', 'Seafile', 'Syncthing'] },
  { match: ['media server', 'plex alternative', 'stream movies', 'home media'], projects: ['Jellyfin'] },
  { match: ['password manager'], projects: ['Bitwarden', 'Vaultwarden', 'KeePassXC'] },
  { match: ['note app', 'note-taking', 'notes app', 'notion alternative', 'evernote alternative'], projects: ['Joplin', 'Logseq'] },
  { match: ['home automation', 'smart home hub', 'smart home platform'], projects: ['Home Assistant'] },
  { match: ['document management', 'paperless', 'scan documents', 'document scanner software'], projects: ['Paperless-ngx'] },
  { match: ['rss reader', 'feed reader'], projects: ['FreshRSS', 'Miniflux'] },
];

/**
 * Returns the deduped list of leading FOSS/self-hosted project names whose
 * category matches the query (empty when none match — most queries). Used to
 * inject by-name search queries so these projects' evidence is actually fetched.
 */
export function fossLeadersFor(query) {
  if (!query || typeof query !== 'string') return [];
  const q = query.toLowerCase();
  const out = [];
  for (const entry of FOSS_LEADERS) {
    if (entry.match.some((m) => q.includes(m))) out.push(...entry.projects);
  }
  return [...new Set(out)];
}
