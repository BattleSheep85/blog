// URL validation and SSRF protection for LLM-directed page reads.
//
// Note: DNS rebinding is not fully solvable here at the URL string validation
// layer since domain names are resolved downstream at fetch time by the
// runtime/network layer. This guard provides deterministic fail-closed defense
// against direct IP literals, internal hosts, localhost, and non-HTTPS schemes.

const BLOCKED_HOSTNAMES = new Set(['localhost', 'internal', 'local', 'home.arpa']);

const BLOCKED_SUFFIXES = ['.localhost', '.internal', '.local', '.home.arpa'];

const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Check if an IPv4 octet quadruple belongs to a private, loopback, or reserved range.
 * Covered ranges:
 * - 0.0.0.0/8 (Current network / "this" host)
 * - 10.0.0.0/8 (Private network - RFC 1918)
 * - 100.64.0.0/10 (Shared address space / Carrier-grade NAT - RFC 6598)
 * - 127.0.0.0/8 (Loopback)
 * - 169.254.0.0/16 (Link-local - RFC 3927)
 * - 172.16.0.0/12 (Private network - RFC 1918)
 * - 192.168.0.0/16 (Private network - RFC 1918)
 * - 224.0.0.0/4 (Multicast - RFC 5771)
 * - 240.0.0.0/4 (Reserved / Future use - RFC 1112 / RFC 5735)
 */
function isBlockedIpv4(o1, o2, o3, o4) {
  if (o1 > 255 || o2 > 255 || o3 > 255 || o4 > 255) return true;
  if (o1 === 0) return true; // 0.0.0.0/8
  if (o1 === 10) return true; // 10.0.0.0/8
  if (o1 === 100 && o2 >= 64 && o2 <= 127) return true; // 100.64.0.0/10
  if (o1 === 127) return true; // 127.0.0.0/8
  if (o1 === 169 && o2 === 254) return true; // 169.254.0.0/16
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return true; // 172.16.0.0/12
  if (o1 === 192 && o2 === 168) return true; // 192.168.0.0/16
  if (o1 >= 224) return true; // 224.0.0.0/4 and 240.0.0.0/4
  return false;
}

/**
 * Determine if a URL is safe to fetch for external page reads.
 * Accepts public https: URLs only. Rejects http:, non-HTTP schemes, localhost,
 * private/reserved IP ranges, IPv6 literals, bare hostnames, and internal suffixes.
 *
 * @param {string} rawUrl
 * @returns {boolean}
 */
export function isFetchableUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return false;
  }

  // Only HTTPS is permitted — engine only reads public web content.
  if (parsed.protocol !== 'https:') return false;

  let host = parsed.hostname.toLowerCase();
  // Strip trailing dot if present (e.g. "example.com.")
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (!host) return false;

  // Reject IPv6 literals (bracketed form or containing colon)
  if (host.startsWith('[') || host.endsWith(']') || host.includes(':')) {
    return false;
  }

  // Reject exact blocked hostnames
  if (BLOCKED_HOSTNAMES.has(host)) return false;

  // Reject blocked suffixes (.localhost, .internal, .local, .home.arpa)
  for (const suffix of BLOCKED_SUFFIXES) {
    if (host.endsWith(suffix)) return false;
  }

  // Reject bare hostnames with no dot
  if (!host.includes('.')) return false;

  // Check IPv4 literals against private/reserved ranges
  const match = host.match(IPV4_REGEX);
  if (match) {
    const o1 = Number(match[1]);
    const o2 = Number(match[2]);
    const o3 = Number(match[3]);
    const o4 = Number(match[4]);
    if (isBlockedIpv4(o1, o2, o3, o4)) return false;
  }

  return true;
}
