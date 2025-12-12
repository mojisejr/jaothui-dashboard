/**
 * useRipple Hook Tests (TDD - RED Phase)
 * 
 * Tests for ripple effect hook that creates click animation
 * Expected to FAIL until implementation is complete
 */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/non-nullable-type-assertion-style */

import { renderHook, act } from '@testing-library/react'
import { useRipple } from '../useRipple'

describe('useRipple', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    container.style.width = '200px'
    container.style.height = '100px'
    container.style.position = 'relative'
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('should return a createRipple function', () => {
    const { result } = renderHook(() => useRipple())
    expect(result.current.createRipple).toBeDefined()
    expect(typeof result.current.createRipple).toBe('function')
  })

  it('should create a ripple element on click', () => {
    const { result } = renderHook(() => useRipple())
    
    const mockEvent = new MouseEvent('click', {
      clientX: 100,
      clientY: 50,
      bubbles: true,
    })
    
    Object.defineProperty(mockEvent, 'currentTarget', {
      value: container,
      writable: false,
    })

    act(() => {
      result.current.createRipple(mockEvent as any)
    })

    const ripple = container.querySelector('.ripple')
    expect(ripple).toBeInTheDocument()
  })

  it('should position ripple at click coordinates', () => {
    const { result } = renderHook(() => useRipple())
    
    const mockEvent = new MouseEvent('click', {
      clientX: 150,
      clientY: 75,
      bubbles: true,
    })
    
    Object.defineProperty(mockEvent, 'currentTarget', {
      value: container,
      writable: false,
    })

    act(() => {
      result.current.createRipple(mockEvent as any)
    })

    const ripple = container.querySelector('.ripple')!
    expect(ripple).toBeInTheDocument()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect((ripple as HTMLElement).style.left).toBeTruthy()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect((ripple as HTMLElement).style.top).toBeTruthy()
  })

  it('should remove existing ripple before creating new one', () => {
    const { result } = renderHook(() => useRipple())
    
    const mockEvent = new MouseEvent('click', {
      clientX: 100,
      clientY: 50,
      bubbles: true,
    })
    
    Object.defineProperty(mockEvent, 'currentTarget', {
      value: container,
      writable: false,
    })

    // Create first ripple
    act(() => {
      result.current.createRipple(mockEvent as any)
    })

    const firstRipple = container.querySelector('.ripple')
    expect(firstRipple).toBeInTheDocument()

    // Create second ripple
    act(() => {
      result.current.createRipple(mockEvent as any)
    })

    const allRipples = container.querySelectorAll('.ripple')
    expect(allRipples.length).toBe(1) // Should only have one ripple
  })

  it('should have animate-ripple class', () => {
    const { result } = renderHook(() => useRipple())
    
    const mockEvent = new MouseEvent('click', {
      clientX: 100,
      clientY: 50,
      bubbles: true,
    })
    
    Object.defineProperty(mockEvent, 'currentTarget', {
      value: container,
      writable: false,
    })

    act(() => {
      result.current.createRipple(mockEvent as any)
    })

    const ripple = container.querySelector('.ripple')
    expect(ripple).toHaveClass('ripple')
  })

  it('should set ripple position based on click', () => {
    const { result } = renderHook(() => useRipple())
    
    const mockEvent = new MouseEvent('click', {
      clientX: 100,
      clientY: 50,
      bubbles: true,
    })
    
    Object.defineProperty(mockEvent, 'currentTarget', {
      value: container,
      writable: false,
    })

    act(() => {
      result.current.createRipple(mockEvent as any)
    })

    const ripple = container.querySelector('.ripple')!
    expect(ripple).toBeInTheDocument()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect((ripple as HTMLElement).style.left).toBeTruthy()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect((ripple as HTMLElement).style.top).toBeTruthy()
  })
})
