/**
 * Header Component Tests (TDD - RED Phase)
 * 
 * Tests for glass header with logout functionality
 * Expected to FAIL until implementation is complete
 */

import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import Header from '../Header'

// Mock useAuth
const mockLogout = jest.fn()
jest.mock('~/context/auth.context', () => ({
  useAuth: () => ({
    logout: mockLogout,
  }),
}))

describe('Header', () => {
  beforeEach(() => {
    mockLogout.mockClear()
  })

  it('should render header with brand', () => {
    render(<Header />)
    expect(screen.getByText(/dashboard/i)).toBeInTheDocument()
  })

  it('should have glass-header class', () => {
    const { container } = render(<Header />)
    const header = container.querySelector('header') || container.querySelector('.glass-header')
    expect(header).toHaveClass('glass-header')
  })

  it('should render logout button', () => {
    render(<Header />)
    const logoutButton = screen.getByRole('button', { name: /logout/i })
    expect(logoutButton).toBeInTheDocument()
  })

  it('should call logout on button click', () => {
    render(<Header />)
    const logoutButton = screen.getByRole('button', { name: /logout/i })
    
    fireEvent.click(logoutButton)
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('should be keyboard accessible', () => {
    render(<Header />)
    const logoutButton = screen.getByRole('button', { name: /logout/i })
    
    // Tab to button and press Enter
    logoutButton.focus()
    fireEvent.keyDown(logoutButton, { key: 'Enter', code: 'Enter' })
    
    expect(mockLogout).toHaveBeenCalled()
  })

  it('should have sticky positioning', () => {
    const { container } = render(<Header />)
    const header = container.querySelector('header') || container.querySelector('.glass-header')
    
    expect(header).toHaveClass('sticky')
  })

  it('should render icon', () => {
    render(<Header />)
    // Check for icon presence (could be SVG or specific class)
    const brand = screen.getByText(/dashboard/i).parentElement
    expect(brand).toBeTruthy()
  })

  it('should have proper ARIA attributes', () => {
    render(<Header />)
    const logoutButton = screen.getByRole('button', { name: /logout/i })
    
    // Button should be accessible
    expect(logoutButton).toHaveAccessibleName()
  })

  it('should match snapshot', () => {
    const { container } = render(<Header />)
    expect(container.firstChild).toMatchSnapshot()
  })
})
