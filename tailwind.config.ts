import { type Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

export default {
  content: ["./src/**/*.tsx"],
  theme: {
    extend: {
      // Color Tokens
      colors: {
        'primary-orange': '#FF8C00',
        'primary-orange-glow': '#FFA500',
        'accent-purple': '#9D00FF',
        'accent-purple-glow': '#B847FF',
        'dark': '#0f0f11',
        'glass': {
          DEFAULT: 'rgba(255, 255, 255, 0.03)',
          border: 'rgba(255, 255, 255, 0.1)',
          highlight: 'rgba(255, 255, 255, 0.15)',
        },
        'text': {
          main: '#ffffff',
          muted: 'rgba(255, 255, 255, 0.6)',
        },
      },

      // Typography Tokens
      fontFamily: {
        sans: ['var(--font-kanit)', 'var(--font-inter)', ...fontFamily.sans],
        kanit: ['var(--font-kanit)', 'sans-serif'],
        inter: ['var(--font-inter)', 'sans-serif'],
      },

      // Shadow Tokens
      boxShadow: {
        'glass-header': '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
        'glass-card': '0 4px 6px rgba(0,0,0,0.1)',
        'glass-card-hover': '0 20px 40px rgba(0,0,0,0.4)',
        'orange-glow': '0 20px 40px rgba(255, 140, 0, 0.15), inset 0 0 20px rgba(255, 140, 0, 0.1)',
        'purple-glow': '0 20px 40px rgba(157, 0, 255, 0.15), inset 0 0 20px rgba(157, 0, 255, 0.1)',
        'orange-inset': 'inset 0 0 0 1px rgba(255, 140, 0, 0.1)',
        'purple-inset': 'inset 0 0 0 1px rgba(157, 0, 255, 0.1)',
      },

      // Animation Tokens
      keyframes: {
        float: {
          '0%': { transform: 'translate(0, 0)' },
          '100%': { transform: 'translate(30px, 50px)' },
        },
        ripple: {
          to: {
            transform: 'scale(4)',
            opacity: '0',
          },
        },
      },
      animation: {
        float: 'float 10s ease-in-out infinite alternate',
        ripple: 'ripple 0.6s linear',
      },

      // Border Radius Tokens
      borderRadius: {
        '3xl': '24px',
      },

      // Backdrop Blur Tokens
      blur: {
        '3xl': '100px',
      },

      // Transition Tokens
      transitionTimingFunction: {
        card: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
        icon: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        '400': '400ms',
      },
    },
  },
  daisyui: {
    themes: [
      {
        halloween: {
          ...require("daisyui/src/theming/themes")["halloween"],
          "base-100": "#0f0f11",  // Override background to match design
          "primary": "#FF8C00",    // Override primary orange
          "secondary": "#9D00FF",  // Override secondary purple
        },
      },
    ],
  },
  plugins: [require("daisyui")],
} satisfies Config;
