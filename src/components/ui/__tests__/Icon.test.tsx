/**
 * Icon Component Tests (TDD - RED Phase)
 * 
 * Tests for standardized icon wrapper
 * Expected to FAIL until implementation is complete
 */

import { render } from '@testing-library/react'
import '@testing-library/jest-dom'
import Icon from '../Icon'

describe('Icon', () => {
  const TestIconComponent = () => <svg data-testid="test-svg"><path /></svg>

  it('should render icon children', () => {
    const { getByTestId } = render(
      <Icon>
        <TestIconComponent />
      </Icon>
    )
    
    expect(getByTestId('test-svg')).toBeInTheDocument()
  })

  it('should apply size classes', () => {
    const { container } = render(
      <Icon size="lg">
        <TestIconComponent />
      </Icon>
    )
    
    const icon = container.firstChild as HTMLElement
    expect(icon.className).toMatch(/text-/)
  })

  it('should support small size', () => {
    const { container } = render(
      <Icon size="sm">
        <TestIconComponent />
      </Icon>
    )
    
    const icon = container.firstChild as HTMLElement
    expect(icon).toHaveClass('text-2xl')
  })

  it('should support medium size (default)', () => {
    const { container } = render(
      <Icon>
        <TestIconComponent />
      </Icon>
    )
    
    const icon = container.firstChild as HTMLElement
    expect(icon.className).toMatch(/text-/)
  })

  it('should support large size', () => {
    const { container } = render(
      <Icon size="lg">
        <TestIconComponent />
      </Icon>
    )
    
    const icon = container.firstChild as HTMLElement
    expect(icon).toHaveClass('text-5xl')
  })

  it('should support extra large size', () => {
    const { container } = render(
      <Icon size="xl">
        <TestIconComponent />
      </Icon>
    )
    
    const icon = container.firstChild as HTMLElement
    expect(icon.className).toMatch(/text-4xl|text-5xl|text-6xl/)
  })

  it('should apply color classes', () => {
    const { container } = render(
      <Icon color="text-primary-orange">
        <TestIconComponent />
      </Icon>
    )
    
    const icon = container.firstChild as HTMLElement
    expect(icon).toHaveClass('text-primary-orange')
  })

  it('should support glow effect', () => {
    const { container } = render(
      <Icon glow="orange">
        <TestIconComponent />
      </Icon>
    )
    
    const icon = container.firstChild as HTMLElement
    expect(icon.className).toContain('[text-shadow:0_0_15px_rgba(255,140,0,0.5)]')
    expect(icon.className).toContain('text-primary-orange-glow')
  })

  it('should support purple glow effect', () => {
    const { container } = render(
      <Icon glow="purple">
        <TestIconComponent />
      </Icon>
    )
    
    const icon = container.firstChild as HTMLElement
    expect(icon.className).toContain('[text-shadow:0_0_15px_rgba(157,0,255,0.5)]')
    expect(icon.className).toContain('text-accent-purple-glow')
  })

  it('should accept custom className', () => {
    const { container } = render(
      <Icon className="custom-icon-class">
        <TestIconComponent />
      </Icon>
    )
    
    const icon = container.firstChild as HTMLElement
    expect(icon).toHaveClass('custom-icon-class')
  })

  it('should support transition for hover effects', () => {
    const { container } = render(
      <Icon>
        <TestIconComponent />
      </Icon>
    )
    
    const icon = container.firstChild as HTMLElement
    expect(icon.className).toMatch(/transition/)
  })

  it('should match snapshot with default props', () => {
    const { container } = render(
      <Icon>
        <TestIconComponent />
      </Icon>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('should match snapshot with all props', () => {
    const { container } = render(
      <Icon size="lg" color="primary-orange" glow="orange" className="custom">
        <TestIconComponent />
      </Icon>
    )
    expect(container.firstChild).toMatchSnapshot()
  })
})
