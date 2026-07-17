import animate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Geist (self-hosted via @fontsource-variable). Geist Mono carries all
      // numerics / IDs / code so figures stay tabular and the "console" reads true.
      fontFamily: {
        sans: ['"Geist Variable"', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['"Geist Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      // One locked heading rhythm: tighter tracking for large display type.
      letterSpacing: {
        tightest: '-0.03em',
      },
      // Kinetics motion vocabulary (github.com/ckissi/kinetics):
      // spring = playful overshoot for presses/pills/chips; glide = smooth decel
      // for entrances/lifts/reveals.
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        glide: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      // Tinted shadows only — never pure black. Slate-tinted for surfaces,
      // blue-tinted for the single accent. (redesign-skill: colored/tinted shadows)
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        'card-hover': '0 6px 20px -4px rgb(15 23 42 / 0.10), 0 2px 8px -3px rgb(15 23 42 / 0.06)',
        accent: '0 10px 28px -8px rgb(37 99 235 / 0.42)',
        'accent-sm': '0 3px 12px -3px rgb(37 99 235 / 0.34)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.5)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-6px)' },
          '40%': { transform: 'translateX(6px)' },
          '60%': { transform: 'translateX(-4px)' },
          '80%': { transform: 'translateX(4px)' },
        },
        'menu-in': {
          '0%': { opacity: '0', transform: 'scale(0.9) translateY(-8px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.55s cubic-bezier(0.16, 1, 0.3, 1) both',
        'pop-in': 'pop-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        shake: 'shake 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97) both',
        'menu-in': 'menu-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both',
      },
    },
  },
  plugins: [animate],
}
