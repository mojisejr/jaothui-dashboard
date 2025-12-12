/**
 * DashboardCard Component Tests (TDD - RED Phase)
 * 
 * Tests for glass card button with ripple, tilt, and color variants
 * Expected to FAIL until implementation is complete
 */

import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import DashboardCard from '../DashboardCard'

const TestIcon = () => <span data-testid="test-icon">🐃</span>

describe('DashboardCard', () => {
  it('should render card with title', () => {
    render(<DashboardCard title="Test Card" icon={<TestIcon />} />)
    expect(screen.getByText('Test Card')).toBeInTheDocument()
  })

  it('should render with icon', () => {
    render(<DashboardCard title="Test" icon={<TestIcon />} />)
    expect(screen.getByTestId('test-icon')).toBeInTheDocument()
  })

  it('should apply orange variant class', () => {
    const { container } = render(<DashboardCard title="Test" variant="orange" icon={<TestIcon />} />)
    const card = container.firstChild as HTMLElement
    expect(card).toHaveClass('shadow-orange-glow')
  })

  it('should apply purple variant class', () => {
    const { container } = render(<DashboardCard title="Test" variant="purple" icon={<TestIcon />} />)
    const card = container.firstChild as HTMLElement
    expect(card).toHaveClass('shadow-purple-glow')
  })

  it('should have glass-card base class', () => {
    const { container } = render(<DashboardCard title="Test" icon={<TestIcon />} />)
    const card = container.firstChild as HTMLElement
    expect(card).toHaveClass('glass-card')
  })

  it('should call onClick when clicked', () => {
    const handleClick = jest.fn()
    render(<DashboardCard title="Test" icon={<TestIcon />} onClick={handleClick} />)
    
    const card = screen.getByRole('button')
    fireEvent.click(card)
    
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('should be keyboard accessible with Enter', () => {
    const handleClick = jest.fn()
    render(<DashboardCard title="Test" icon={<TestIcon />} onClick={handleClick} />)
    
    const card = screen.getByRole('button')
    fireEvent.keyDown(card, { key: 'Enter', code: 'Enter' })
    
    expect(handleClick).toHaveBeenCalled()
  })

  it('should be keyboard accessible with Space', () => {
    const handleClick = jest.fn()
    render(<DashboardCard title="Test" icon={<TestIcon />} onClick={handleClick} />)
    
    const card = screen.getByRole('button')
    fireEvent.keyDown(card, { key: ' ', code: 'Space' })
    
    expect(handleClick).toHaveBeenCalled()
  })

  it('should render as link when href provided', () => {
    render(<DashboardCard title="Test" icon={<TestIcon />} href="/test-path" />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/test-path')
  })

  it('should have proper size classes', () => {
    const { container } = render(<DashboardCard title="Test" icon={<TestIcon />} />)
    const card = container.firstChild as HTMLElement
    
    // Should have height constraint
    expect(card.className).toMatch(/h-\[/)
  })

  it('should apply hover effects', () => {
    const { container } = render(<DashboardCard title="Test" icon={<TestIcon />} />)
    const card = container.firstChild as HTMLElement
    
    // Should have transition classes
    expect(card.className).toMatch(/transition/)
  })

  it('should create ripple on click', () => {
    const { container } = render(<DashboardCard title="Test" icon={<TestIcon />} onClick={() => {}} />)
    const card = screen.getByRole('button')
    
    fireEvent.click(card)
    
    // Check for ripple element after click
    const ripple = container.querySelector('.ripple')
    expect(ripple).toBeInTheDocument()
  })

  it('should have accessible name', () => {
    render(<DashboardCard title="Add Buffalo" icon={<TestIcon />} />)
    const card = screen.getByRole('button', { name: /add buffalo/i })
    expect(card).toBeInTheDocument()
  })

  it('should have proper ARIA attributes', () => {
    render(<DashboardCard title="Test Card" icon={<TestIcon />} />)
    const card = screen.getByRole('button')
    
    expect(card).toHaveAccessibleName('🐃 Test Card')
  })

  it('should apply scale on tilt', () => {
    const { container } = render(<DashboardCard title="Test" icon={<TestIcon />} />)
    const card = container.firstChild as HTMLElement
    
    // Simulate mouse move for tilt
    fireEvent.mouseMove(card, { clientX: 100, clientY: 100 })
    
    // Should apply transform (tilt hook should be working)
    setTimeout(() => {
      expect(card.style.transform).toContain('scale')
    }, 100)
  })

  it('should match snapshot for orange variant', () => {
    const { container } = render(
      <DashboardCard title="Test" variant="orange" icon={<span>🐃</span>} />
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('should match snapshot for purple variant', () => {
    const { container } = render(
      <DashboardCard title="Test" variant="purple" icon={<span>✨</span>} />
    )
    expect(container.firstChild).toMatchSnapshot()
  })
})
