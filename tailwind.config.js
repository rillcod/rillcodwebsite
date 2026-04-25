/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: 'var(--primary)',
        'primary-foreground': 'var(--primary-foreground)',
        secondary: 'var(--secondary)',
        'secondary-foreground': 'var(--secondary-foreground)',
        muted: 'var(--muted)',
        'muted-foreground': 'var(--muted-foreground)',
        accent: 'var(--accent)',
        'accent-foreground': 'var(--accent-foreground)',
        destructive: 'var(--destructive)',
        'destructive-foreground': 'var(--destructive-foreground)',
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        card: 'var(--card)',
        'card-foreground': 'var(--card-foreground)',
        popover: 'var(--popover)',
        'popover-foreground': 'var(--popover-foreground)',
        // Brand colors
        'whatsapp-green': 'var(--whatsapp-green)',
        'whatsapp-green-hover': 'var(--whatsapp-green-hover)',
        'linkedin-blue': 'var(--linkedin-blue)',
        'github-dark': 'var(--github-dark)',
        // ── Remap orange → Rillcod brand blue ──────────────────────────
        // All existing text-orange-*, bg-orange-*, border-orange-* etc.
        // now render as the brand blue scale automatically.
        orange: {
          50:  '#EEF2FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B6FE8',
          600: '#3B6FE8',
          700: '#1A3A8F',
          800: '#1A3A8F',
          900: '#0D1B2A',
          950: '#0D1B2A',
        },
        // ── Brand red scale (for accent/destructive uses) ───────────────
        // Use brand-red-* for explicit red brand moments
        'brand-red': {
          50:  '#FFF1F2',
          100: '#FFE4E6',
          200: '#FECDD3',
          300: '#FDA4AF',
          400: '#FB7185',
          500: '#E8334A',
          600: '#C41E3A',
          700: '#9F1239',
          800: '#881337',
          900: '#4C0519',
          950: '#27030E',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
} 