/**
 * AmbientOrbs Component Tests (TDD - RED Phase)
 * 
 * Tests for animated background orbs
 * Expected to FAIL until implementation is complete
 */

import { render } from '@testing-library/react'
import '@testing-library/jest-dom'
import AmbientOrbs from '../AmbientOrbs'

describe('AmbientOrbs', () => {
  it('should render three orbs', () => {
    const { container } = render(<AmbientOrbs />)
    const orbs = container.querySelectorAll('.ambient-orb, .ambient-orb-orange, .ambient-orb-purple, .ambient-orb-red')
    
    expect(orbs.length).toBeGreaterThanOrEqual(3)
  })

  it('should have orange orb', () => {
    const { container } = render(<AmbientOrbs />)
    const orangeOrb = container.querySelector('.ambient-orb-orange')
    
    expect(orangeOrb).toBeInTheDocument()
  })

  it('should have purple orb', () => {
    const { container } = render(<AmbientOrbs />)
    const purpleOrb = container.querySelector('.ambient-orb-purple')
    
    expect(purpleOrb).toBeInTheDocument()
  })

  it('should have red orb', () => {
    const { container } = render(<AmbientOrbs />)
    const redOrb = container.querySelector('.ambient-orb-red')
    
    expect(redOrb).toBeInTheDocument()
  })

  it('should have fixed positioning on orbs', () => {
    const { container } = render(<AmbientOrbs />)
    // Parent container should be fixed
    const orbContainer = container.firstChild as HTMLElement
    expect(orbContainer).toHaveClass('fixed')
    
    // Individual orbs should be absolute
    const orbs = container.querySelectorAll('[class*="ambient-orb"]')
    orbs.forEach(orb => {
      expect(orb).toHaveClass('absolute')
    })
  })

  it('should have animate-float on orbs', () => {
    const { container } = render(<AmbientOrbs />)
    const orbs = container.querySelectorAll('[class*="ambient-orb"]')
    
    // At least one should have float animation
    const hasFloatAnimation = Array.from(orbs).some(orb => 
      orb.className.includes('animate-float')
    )
    expect(hasFloatAnimation).toBe(true)
  })

  it('should have delayed animation on some orbs', () => {
    const { container } = render(<AmbientOrbs />)
    const delayedOrb = container.querySelector('.animate-float-delayed')
    
    expect(delayedOrb).toBeInTheDocument()
  })

  it('should have proper z-index (behind content)', () => {
    const { container } = render(<AmbientOrbs />)
    const orbContainer = container.firstChild as HTMLElement
    
    // Container should have z-0 (behind content)
    expect(orbContainer).toHaveClass('z-0')
  })

  it('should have blur filter', () => {
    const { container } = render(<AmbientOrbs />)
    const orbs = container.querySelectorAll('[class*="ambient-orb"]')
    
    // Orbs should have blur class or style
    orbs.forEach(orb => {
      expect(orb.className).toMatch(/blur/)
    })
  })

  it('should have circular shape', () => {
    const { container } = render(<AmbientOrbs />)
    const orbs = container.querySelectorAll('[class*="ambient-orb"]')
    
    // Orbs should have width and height (circular shape comes from CSS)
    orbs.forEach(orb => {
      const hasSize = orb.className.includes('h-') && orb.className.includes('w-')
      expect(hasSize).toBe(true)
    })
  })

  it('should have different sizes for orbs', () => {
    const { container } = render(<AmbientOrbs />)
    const orbs = container.querySelectorAll('[class*="ambient-orb"]')
    
    const sizes = new Set<string>()
    orbs.forEach(orb => {
      const sizeMatch = orb.className.match(/w-\d+/)
      if (sizeMatch) sizes.add(sizeMatch[0])
    })
    
    // Should have at least 2 different sizes
    expect(sizes.size).toBeGreaterThanOrEqual(2)
  })

  it('should match snapshot', () => {
    const { container } = render(<AmbientOrbs />)
    expect(container.firstChild).toMatchSnapshot()
  })
})
