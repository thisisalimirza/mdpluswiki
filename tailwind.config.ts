import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}', './content/**/*.{md,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#534AB7',
          50: '#F4F3FB',
          100: '#E6E4F5',
          200: '#C8C4E8',
          300: '#A39DD6',
          400: '#7A72C5',
          500: '#534AB7',
          600: '#433B9F',
          700: '#352F7E',
          800: '#28235E',
          900: '#1C1944',
        },
        ink: '#1A1A1A',
        muted: '#5C5C5C',
        sidebar: '#F7F6F3',
        hairline: 'rgba(0,0,0,0.1)',
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-dm-serif)', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderColor: {
        DEFAULT: 'rgba(0,0,0,0.1)',
      },
      borderRadius: {
        DEFAULT: '8px',
        card: '12px',
      },
      fontSize: {
        xs: ['12px', '16px'],
        sm: ['13px', '18px'],
        base: ['14px', '22px'],
        lg: ['16px', '24px'],
        xl: ['18px', '26px'],
        '2xl': ['22px', '30px'],
        '3xl': ['28px', '34px'],
        '4xl': ['36px', '42px'],
      },
    },
  },
  plugins: [],
};

export default config;
