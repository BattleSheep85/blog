// Table-driven unit tests for worker/lib/url-guard.js
import { isFetchableUrl } from '../../worker/lib/url-guard.js';

export function runUrlGuardTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const eq = (name, a, e) => {
    const A = JSON.stringify(a), E = JSON.stringify(e);
    if (A === E) report.passed++; else { report.failed++; report.failures.push(`${name}: expected ${E}, got ${A}`); }
  };

  const cases = [
    // ── Valid public HTTPS URLs (allowed) ───────────────────────────
    { url: 'https://example.com', allowed: true, desc: 'standard https domain' },
    { url: 'https://www.google.com/search?q=test', allowed: true, desc: 'https with query params' },
    { url: 'https://api.github.com/repos/test', allowed: true, desc: 'https subdomain' },
    { url: 'https://rtings.com/headphones/reviews/sony/wh-1000xm5', allowed: true, desc: 'review url' },
    { url: 'https://8.8.8.8/dns-query', allowed: true, desc: 'public IPv4 address' },
    { url: 'https://93.184.216.34/', allowed: true, desc: 'public IPv4 address (example.com)' },

    // ── Non-HTTPS schemes (rejected) ────────────────────────────────
    { url: 'http://example.com', allowed: false, desc: 'plain http rejected' },
    { url: 'http://127.0.0.1:8080', allowed: false, desc: 'http loopback rejected' },
    { url: 'ftp://example.com/file', allowed: false, desc: 'ftp scheme rejected' },
    { url: 'file:///etc/passwd', allowed: false, desc: 'file scheme rejected' },
    { url: 'javascript:alert(1)', allowed: false, desc: 'javascript scheme rejected' },
    { url: 'data:text/html,test', allowed: false, desc: 'data scheme rejected' },
    { url: '//example.com', allowed: false, desc: 'protocol-relative rejected' },

    // ── Localhost & *.localhost (rejected) ──────────────────────────
    { url: 'https://localhost', allowed: false, desc: 'bare localhost' },
    { url: 'https://localhost:8080/path', allowed: false, desc: 'localhost with port' },
    { url: 'https://api.localhost', allowed: false, desc: 'subdomain of localhost' },
    { url: 'https://foo.bar.localhost/test', allowed: false, desc: 'nested localhost subdomain' },

    // ── IPv4 private & reserved ranges (rejected) ───────────────────
    // 0.0.0.0/8
    { url: 'https://0.0.0.0', allowed: false, desc: '0.0.0.0' },
    { url: 'https://0.1.2.3/foo', allowed: false, desc: '0.0.0.0/8 range' },
    // 127.0.0.0/8 (Loopback)
    { url: 'https://127.0.0.1', allowed: false, desc: '127.0.0.1 loopback' },
    { url: 'https://127.0.0.1:3000', allowed: false, desc: '127.0.0.1 with port' },
    { url: 'https://127.255.255.254', allowed: false, desc: '127.0.0.0/8 range end' },
    // 10.0.0.0/8 (Private)
    { url: 'https://10.0.0.1', allowed: false, desc: '10.0.0.1 private' },
    { url: 'https://10.254.1.1/secret', allowed: false, desc: '10.0.0.0/8 private' },
    // 100.64.0.0/10 (CGNAT / Shared)
    { url: 'https://100.64.0.1', allowed: false, desc: '100.64.0.1 CGNAT' },
    { url: 'https://100.127.255.255', allowed: false, desc: '100.64.0.0/10 end' },
    // 169.254.0.0/16 (Link-local / Cloud metadata)
    { url: 'https://169.254.169.254/latest/meta-data', allowed: false, desc: 'cloud metadata IP' },
    { url: 'https://169.254.1.1', allowed: false, desc: '169.254.0.0/16 link-local' },
    // 172.16.0.0/12 (Private)
    { url: 'https://172.16.0.1', allowed: false, desc: '172.16.0.1 private' },
    { url: 'https://172.31.255.255', allowed: false, desc: '172.31.255.255 private' },
    // 192.168.0.0/16 (Private)
    { url: 'https://192.168.0.1', allowed: false, desc: '192.168.0.1 router' },
    { url: 'https://192.168.1.100:8443', allowed: false, desc: '192.168.1.100 private' },
    // 224.0.0.0/4 & 240.0.0.0/4 (Multicast / Reserved)
    { url: 'https://224.0.0.1', allowed: false, desc: '224.0.0.1 multicast' },
    { url: 'https://239.255.255.255', allowed: false, desc: '239.255.255.255 multicast' },
    { url: 'https://240.0.0.1', allowed: false, desc: '240.0.0.1 reserved' },
    { url: 'https://255.255.255.255', allowed: false, desc: '255.255.255.255 broadcast' },

    // ── IPv6 literals (rejected) ────────────────────────────────────
    { url: 'https://[::1]', allowed: false, desc: 'IPv6 loopback [::1]' },
    { url: 'https://[::1]:8080', allowed: false, desc: 'IPv6 loopback with port' },
    { url: 'https://[fe80::1]', allowed: false, desc: 'IPv6 link-local' },
    { url: 'https://[2001:db8::1]', allowed: false, desc: 'IPv6 bracketed literal' },
    { url: 'https://[::ffff:127.0.0.1]', allowed: false, desc: 'IPv4-mapped IPv6' },

    // ── Bare hostnames & internal suffixes (rejected) ───────────────
    { url: 'https://myhost', allowed: false, desc: 'bare hostname no dot' },
    { url: 'https://intranet/docs', allowed: false, desc: 'bare intranet hostname' },
    { url: 'https://server:443', allowed: false, desc: 'bare hostname with port' },
    { url: 'https://service.internal', allowed: false, desc: '.internal suffix' },
    { url: 'https://api.corp.internal/v1', allowed: false, desc: 'nested .internal suffix' },
    { url: 'https://app.local', allowed: false, desc: '.local suffix' },
    { url: 'https://router.home.arpa', allowed: false, desc: '.home.arpa suffix' },

    // ── Malformed & non-string inputs (rejected) ────────────────────
    { url: '', allowed: false, desc: 'empty string' },
    { url: '   ', allowed: false, desc: 'whitespace string' },
    { url: null, allowed: false, desc: 'null' },
    { url: undefined, allowed: false, desc: 'undefined' },
    { url: 'not a url', allowed: false, desc: 'plain text' },
    { url: 'https://', allowed: false, desc: 'empty https target' },
  ];

  for (const c of cases) {
    eq(`url-guard: ${c.desc} (${c.url})`, isFetchableUrl(c.url), c.allowed);
  }

  return report;
}
