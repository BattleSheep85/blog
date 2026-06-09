/**
 * TrueRank - shared Tailwind (Play CDN) configuration.
 * Loaded on every page right after the Tailwind CDN script so all pages
 * share one design system. Colors alias CSS variables (see css/app.css), so a
 * single `.dark` class on <html> flips every token with no `dark:` variants.
 *
 * Colors are defined as functions so Tailwind alpha modifiers (e.g.
 * `ring-accent/60`, `bg-surface-2/60`) resolve via color-mix. A plain string
 * like 'var(--accent)' would make those modifiers compile to nothing.
 */
(function () {
    function alpha(name) {
        return function (opts) {
            var o = opts && opts.opacityValue;
            if (o === undefined || o === 1) return 'var(' + name + ')';
            return 'color-mix(in srgb, var(' + name + ') ' + (o * 100) + '%, transparent)';
        };
    }

    tailwind.config = {
        darkMode: 'class',
        theme: {
            extend: {
                colors: {
                    bg: alpha('--bg'),
                    'surface-1': alpha('--surface-1'),
                    'surface-2': alpha('--surface-2'),
                    'surface-3': alpha('--surface-3'),
                    line: alpha('--line'),
                    'line-strong': alpha('--line-strong'),
                    ink: alpha('--ink'),
                    'ink-2': alpha('--ink-2'),
                    'ink-3': alpha('--ink-3'),
                    accent: {
                        DEFAULT: alpha('--accent'),
                        hover: alpha('--accent-hover'),
                        quiet: alpha('--accent-quiet'),
                    },
                    'trust-high': alpha('--trust-high'),
                    'trust-high-bg': alpha('--trust-high-bg'),
                    'trust-medium': alpha('--trust-medium'),
                    'trust-medium-bg': alpha('--trust-medium-bg'),
                    'trust-low': alpha('--trust-low'),
                    'trust-low-bg': alpha('--trust-low-bg'),
                },
                fontFamily: {
                    serif: ['Newsreader', 'Georgia', 'serif'],
                    sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
                    mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
                },
                fontSize: {
                    overline: ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.12em' }],
                    caption: ['0.8125rem', { lineHeight: '1.5' }],
                    'body-sm': ['0.9375rem', { lineHeight: '1.6' }],
                    body: ['1.0625rem', { lineHeight: '1.7' }],
                    'mono-data': ['0.875rem', { lineHeight: '1.4' }],
                    lead: ['1.25rem', { lineHeight: '1.6' }],
                    h3: ['1.375rem', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
                    h2: ['1.875rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
                    h1: ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
                    display: ['3.5rem', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
                },
                borderRadius: {
                    sm: '0.375rem',
                    DEFAULT: '0.625rem',
                    lg: '0.875rem',
                    xl: '1.125rem',
                    '2xl': '1.5rem',
                },
                boxShadow: {
                    xs: 'var(--xs)',
                    card: 'var(--card)',
                    lift: 'var(--lift)',
                },
                keyframes: {
                    'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
                    shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
                },
                animation: {
                    'fade-in': 'fade-in 0.4s ease both',
                    shimmer: 'shimmer 1.6s linear infinite',
                },
            },
        },
    };
})();
