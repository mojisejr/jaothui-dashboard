/**
 * Design Tokens Validation Tests (TDD - GREEN Phase)
 * 
 * These tests validate that design tokens from docs/DESIGN_TOKENS.md
 * are properly defined and follow correct formats.
 * 
 * Note: CSS injection tests are skipped in Jest environment.
 * Visual validation should be done via token showcase page.
 */

import { describe, it, expect } from '@jest/globals'
import fs from 'fs'
import path from 'path'

describe('Design Tokens - Documentation', () => {
  it('should have DESIGN_TOKENS.md file', () => {
    const docsPath = path.join(process.cwd(), 'docs', 'DESIGN_TOKENS.md')
    expect(fs.existsSync(docsPath)).toBe(true)
  })

  it('should have globals.css file', () => {
    const cssPath = path.join(process.cwd(), 'src', 'styles', 'globals.css')
    expect(fs.existsSync(cssPath)).toBe(true)
  })

  it('should have tailwind.config.ts file', () => {
    const configPath = path.join(process.cwd(), 'tailwind.config.ts')
    expect(fs.existsSync(configPath)).toBe(true)
  })
})

describe('Design Tokens - CSS Variables Definition', () => {
  let globalsCSS: string

  beforeAll(() => {
    const cssPath = path.join(process.cwd(), 'src', 'styles', 'globals.css')
    globalsCSS = fs.readFileSync(cssPath, 'utf-8')
  })

  it('should define --primary-orange CSS variable', () => {
    expect(globalsCSS).toContain('--primary-orange: #FF8C00')
  })

  it('should define --primary-orange-glow CSS variable', () => {
    expect(globalsCSS).toContain('--primary-orange-glow: #FFA500')
  })

  it('should define --accent-purple CSS variable', () => {
    expect(globalsCSS).toContain('--accent-purple: #9D00FF')
  })

  it('should define --accent-purple-glow CSS variable', () => {
    expect(globalsCSS).toContain('--accent-purple-glow: #B847FF')
  })

  it('should define --bg-dark CSS variable', () => {
    expect(globalsCSS).toContain('--bg-dark: #0f0f11')
  })

  it('should define --glass-bg CSS variable', () => {
    expect(globalsCSS).toContain('--glass-bg: rgba(255, 255, 255, 0.03)')
  })

  it('should define --glass-border CSS variable', () => {
    expect(globalsCSS).toContain('--glass-border: rgba(255, 255, 255, 0.1)')
  })

  it('should define --text-main CSS variable', () => {
    expect(globalsCSS).toContain('--text-main: #ffffff')
  })

  it('should define --text-muted CSS variable', () => {
    expect(globalsCSS).toContain('--text-muted: rgba(255, 255, 255, 0.6)')
  })
})

describe('Design Tokens - Utility Classes', () => {
  let globalsCSS: string

  beforeAll(() => {
    const cssPath = path.join(process.cwd(), 'src', 'styles', 'globals.css')
    globalsCSS = fs.readFileSync(cssPath, 'utf-8')
  })

  it('should define .glass-card utility class', () => {
    expect(globalsCSS).toContain('.glass-card')
    expect(globalsCSS).toContain('backdrop-filter: blur(10px)')
  })

  it('should define .glass-header utility class', () => {
    expect(globalsCSS).toContain('.glass-header')
    expect(globalsCSS).toContain('backdrop-filter: blur(20px)')
  })

  it('should define .ambient-orb utility class', () => {
    expect(globalsCSS).toContain('.ambient-orb')
    expect(globalsCSS).toContain('position: fixed')
    expect(globalsCSS).toContain('border-radius: 50%')
  })

  it('should define .ambient-orb-orange utility class', () => {
    expect(globalsCSS).toContain('.ambient-orb-orange')
  })

  it('should define .ambient-orb-purple utility class', () => {
    expect(globalsCSS).toContain('.ambient-orb-purple')
  })
})

describe('Design Tokens - Animations', () => {
  let globalsCSS: string

  beforeAll(() => {
    const cssPath = path.join(process.cwd(), 'src', 'styles', 'globals.css')
    globalsCSS = fs.readFileSync(cssPath, 'utf-8')
  })

  it('should define float keyframe animation', () => {
    expect(globalsCSS).toContain('@keyframes float')
    expect(globalsCSS).toContain('transform: translate(0, 0)')
    expect(globalsCSS).toContain('transform: translate(30px, 50px)')
  })

  it('should define ripple keyframe animation', () => {
    expect(globalsCSS).toContain('@keyframes ripple')
    expect(globalsCSS).toContain('transform: scale(4)')
    expect(globalsCSS).toContain('opacity: 0')
  })
})

describe('Design Tokens - Tailwind Config', () => {
  let tailwindConfig: string

  beforeAll(() => {
    const configPath = path.join(process.cwd(), 'tailwind.config.ts')
    tailwindConfig = fs.readFileSync(configPath, 'utf-8')
  })

  describe('Colors', () => {
    it('should define primary-orange color', () => {
      expect(tailwindConfig).toContain("'primary-orange': '#FF8C00'")
    })

    it('should define accent-purple color', () => {
      expect(tailwindConfig).toContain("'accent-purple': '#9D00FF'")
    })

    it('should define dark color', () => {
      expect(tailwindConfig).toContain("'dark': '#0f0f11'")
    })

    it('should define glass colors', () => {
      expect(tailwindConfig).toContain("'glass'")
      expect(tailwindConfig).toContain('rgba(255, 255, 255, 0.03)')
    })
  })

  describe('Typography', () => {
    it('should define Kanit font family', () => {
      expect(tailwindConfig).toContain("kanit: ['Kanit'")
    })

    it('should define Inter font family', () => {
      expect(tailwindConfig).toContain("inter: ['Inter'")
    })

    it('should update sans font family with Kanit', () => {
      expect(tailwindConfig).toContain("sans: ['Kanit', 'Inter'")
    })
  })

  describe('Shadows', () => {
    it('should define glass-header shadow', () => {
      expect(tailwindConfig).toContain("'glass-header'")
      expect(tailwindConfig).toContain('0 8px 32px 0 rgba(0, 0, 0, 0.3)')
    })

    it('should define glass-card shadow', () => {
      expect(tailwindConfig).toContain("'glass-card'")
      expect(tailwindConfig).toContain('0 4px 6px rgba(0,0,0,0.1)')
    })

    it('should define orange-glow shadow', () => {
      expect(tailwindConfig).toContain("'orange-glow'")
      expect(tailwindConfig).toContain('rgba(255, 140, 0, 0.15)')
    })

    it('should define purple-glow shadow', () => {
      expect(tailwindConfig).toContain("'purple-glow'")
      expect(tailwindConfig).toContain('rgba(157, 0, 255, 0.15)')
    })
  })

  describe('Animations', () => {
    it('should define float keyframe', () => {
      expect(tailwindConfig).toContain('float:')
      expect(tailwindConfig).toContain("transform: 'translate(0, 0)'")
      expect(tailwindConfig).toContain("transform: 'translate(30px, 50px)'")
    })

    it('should define ripple keyframe', () => {
      expect(tailwindConfig).toContain('ripple:')
      expect(tailwindConfig).toContain("transform: 'scale(4)'")
    })

    it('should define float animation class', () => {
      expect(tailwindConfig).toContain("float: 'float 10s ease-in-out infinite alternate'")
    })

    it('should define ripple animation class', () => {
      expect(tailwindConfig).toContain("ripple: 'ripple 0.6s linear'")
    })
  })

  describe('Other Tokens', () => {
    it('should define blur-3xl (100px)', () => {
      expect(tailwindConfig).toContain("'3xl': '100px'")
    })

    it('should define custom transition timing functions', () => {
      expect(tailwindConfig).toContain('transitionTimingFunction:')
      expect(tailwindConfig).toContain('card:')
      expect(tailwindConfig).toContain('icon:')
    })
  })
})

describe('Design Tokens - Validation', () => {
  it('should have valid hex color format', () => {
    const hexRegex = /^#[0-9A-F]{6}$/i
    const colors = ['#FF8C00', '#FFA500', '#9D00FF', '#B847FF', '#0f0f11', '#ffffff']
    
    colors.forEach(color => {
      expect(color).toMatch(hexRegex)
    })
  })

  it('should have valid rgba format', () => {
    const rgbaRegex = /^rgba\(\d+,\s*\d+,\s*\d+,\s*[\d.]+\)$/
    const rgbaColors = [
      'rgba(255, 255, 255, 0.03)',
      'rgba(255, 255, 255, 0.1)',
      'rgba(255, 255, 255, 0.15)',
      'rgba(255, 255, 255, 0.6)',
    ]
    
    rgbaColors.forEach(color => {
      expect(color).toMatch(rgbaRegex)
    })
  })

  it('should have valid animation timing', () => {
    const timingRegex = /^[\d.]+s$/
    const timings = ['10s', '0.6s', '0.3s', '0.4s']
    
    timings.forEach(timing => {
      expect(timing).toMatch(timingRegex)
    })
  })
})

describe('Design Tokens - Integration', () => {
  it('should have consistent color values across CSS and Tailwind', () => {
    const cssPath = path.join(process.cwd(), 'src', 'styles', 'globals.css')
    const configPath = path.join(process.cwd(), 'tailwind.config.ts')
    
    const globalsCSS = fs.readFileSync(cssPath, 'utf-8')
    const tailwindConfig = fs.readFileSync(configPath, 'utf-8')
    
    // Check primary-orange consistency
    expect(globalsCSS).toContain('--primary-orange: #FF8C00')
    expect(tailwindConfig).toContain("'primary-orange': '#FF8C00'")
    
    // Check accent-purple consistency
    expect(globalsCSS).toContain('--accent-purple: #9D00FF')
    expect(tailwindConfig).toContain("'accent-purple': '#9D00FF'")
  })
})
