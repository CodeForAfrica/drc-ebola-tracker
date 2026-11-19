/** Design tokens live as CSS variables in src/index.css; Tailwind only maps names to them. */
const v = (n) => `rgb(var(--${n}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    screens: { sm: '390px', md: '768px', lg: '1024px', xl: '1280px' },
    extend: {
      colors: {
        paper: v('paper'), 'paper-2': v('paper-2'), 'paper-3': v('paper-3'),
        ink: v('ink'), 'ink-2': v('ink-2'), 'ink-3': v('ink-3'), rule: v('rule'),
        accent: v('accent'), 'accent-soft': v('accent-soft'), 'accent-dark': v('accent-dark'),
        case: v('case'), death: v('death'), recov: v('recov'),
        'st-active': v('st-active'), 'st-over': v('st-over'), 'st-none': v('st-none'),
        warn: v('warn'),
        'flow-in': v('flow-in'), 'flow-out': v('flow-out'),
        'ew-normal': v('ew-normal'), 'ew-alert': v('ew-alert'), 'ew-critical': v('ew-critical'),
      },
      fontFamily: {
        display: ['"Open Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Open Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Merriweather', 'Georgia', 'serif'],
        mono: ['"Open Sans"', 'ui-sans-serif', 'sans-serif'],
      },
      maxWidth: { prose: '42rem', wide: '72.5rem' },
    },
  },
  plugins: [],
};
