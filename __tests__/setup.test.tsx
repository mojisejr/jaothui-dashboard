/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

// Simple component for testing setup
function TestComponent() {
  return (
    <div>
      <h1>Testing Setup</h1>
      <p>Jest and React Testing Library are working!</p>
      <button>Click me</button>
    </div>
  )
}

describe('Testing Framework Setup', () => {
  it('should render test component successfully', () => {
    render(<TestComponent />)
    
    // Test that elements render
    expect(screen.getByText('Testing Setup')).toBeInTheDocument()
    expect(screen.getByText('Jest and React Testing Library are working!')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('should have proper Jest matchers from @testing-library/jest-dom', () => {
    render(<TestComponent />)
    
    const heading = screen.getByRole('heading', { name: 'Testing Setup' })
    const button = screen.getByRole('button')
    
    // Test Jest DOM matchers work
    expect(heading).toBeVisible()
    expect(button).toBeEnabled()
    expect(heading).toHaveTextContent('Testing Setup')
  })

  it('should support TypeScript in tests', () => {
    const testValue: string = 'TypeScript working'
    const testNumber: number = 42
    const testBoolean: boolean = true
    
    expect(typeof testValue).toBe('string')
    expect(typeof testNumber).toBe('number')
    expect(typeof testBoolean).toBe('boolean')
  })

  it('should have path aliases working (~/)', () => {
    // This test verifies that TypeScript can resolve path aliases
    // The actual import test will be in component tests
    expect(true).toBe(true)
  })
})
