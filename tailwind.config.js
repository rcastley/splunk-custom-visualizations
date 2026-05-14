/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./test-harness.html'],
  theme: {
    extend: {
      colors: {
        gh: {
          bg: 'var(--bg)',
          card: 'var(--card)',
          border: 'var(--border)',
          text: 'var(--text)',
          muted: 'var(--muted)',
          subtle: 'var(--subtle)',
          accent: 'var(--accent)',
          btn: 'var(--btn)',
          ok: 'var(--ok)',
          warn: 'var(--warn)',
          err: 'var(--err)'
        }
      },
      fontFamily: {
        sans: ['"Host Grotesk"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      }
    }
  }
};
