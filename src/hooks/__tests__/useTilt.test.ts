/**
 * useTilt Hook Tests (TDD - GREEN Phase)
 * 
 * Tests for 3D tilt effect hook (mousemove-based)
 */

import { renderHook, act } from '@testing-library/react'
import { useTilt } from '../useTilt'

describe('useTilt', () => {
  let container: HTMLDivElement

  const mockGetBoundingClientRect = () => {
    Object.defineProperty(container, 'getBoundingClientRect', {
      writable: true,
      value: jest.fn(() => ({
        width: 200,
        height: 200,
        top: 0,
        left: 0,
        bottom: 200,
        right: 200,
        x: 0,
        y: 0,
        toJSON: () => {},
      })),
    })
  }

  beforeEach(() => {
    container = document.createElement('div')
    container.style.width = '200px'
    container.style.height = '200px'
    document.body.appendChild(container)
    mockGetBoundingClientRect()
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('should return tilt handlers', () => {
    const { result } = renderHook(() => useTilt())
    expect(result.current.onMouseMove).toBeDefined()
    expect(result.current.onMouseLeave).toBeDefined()
    expect(typeof result.current.onMouseMove).toBe('function')
    expect(typeof result.current.onMouseLeave).toBe('function')
  })

  it('should apply tilt transform on mouse move', () => {
    const { result } = renderHook(() => useTilt())
    
    const mockEvent = {
      currentTarget: container,
      clientX: 150,
      clientY: 150,
    } as any

    act(() => {
      result.current.onMouseMove(mockEvent)
    })

    const transform = container.style.transform
    expect(transform).toBeTruthy()
    expect(transform).toContain('perspective')
    expect(transform).toContain('rotateX')
    expect(transform).toContain('rotateY')
    expect(transform).toContain('scale')
  })

  it('should reset transform on mouse leave', () => {
    const { result } = renderHook(() => useTilt())
    
    const mockMoveEvent = {
      currentTarget: container,
      clientX: 150,
      clientY: 150,
    } as any

    act(() => {
      result.current.onMouseMove(mockMoveEvent)
    })

    expect(container.style.transform).toBeTruthy()

    const mockLeaveEvent = {
      currentTarget: container,
    } as any

    act(() => {
      result.current.onMouseLeave(mockLeaveEvent)
    })

    const transform = container.style.transform
    expect(transform).toContain('rotateX(0deg)')
    expect(transform).toContain('rotateY(0deg)')
    expect(transform).toContain('scale(1)')
  })

  it('should calculate tilt based on mouse position', () => {
    const { result } = renderHook(() => useTilt())

    const centerEvent = {
      currentTarget: container,
      clientX: 100,
      clientY: 100,
    } as any

    act(() => {
      result.current.onMouseMove(centerEvent)
    })

    const centerTransform = container.style.transform
    expect(centerTransform).toBeTruthy()

    const cornerEvent = {
      currentTarget: container,
      clientX: 0,
      clientY: 0,
    } as any

    act(() => {
      result.current.onMouseMove(cornerEvent)
    })

    const cornerTransform = container.style.transform
    expect(cornerTransform).toBeTruthy()
    expect(cornerTransform).not.toBe(centerTransform)
  })

  it('should support custom tilt intensity', () => {
    const { result } = renderHook(() => useTilt({ intensity: 20 }))

    const mockEvent = {
      currentTarget: container,
      clientX: 0,
      clientY: 0,
    } as any

    act(() => {
      result.current.onMouseMove(mockEvent)
    })

    expect(container.style.transform).toBeTruthy()
    expect(container.style.transform).toContain('rotateX')
    expect(container.style.transform).toContain('rotateY')
  })

  it('should be disabled on touch devices', () => {
    const originalOntouchstart = 'ontouchstart' in window
    Object.defineProperty(window, 'ontouchstart', {
      writable: true,
      value: {},
    })

    const { result } = renderHook(() => useTilt({ disableOnTouch: true }))

    const mockEvent = {
      currentTarget: container,
      clientX: 150,
      clientY: 150,
    } as any

    act(() => {
      result.current.onMouseMove(mockEvent)
    })

    expect(container.style.transform).toBe('')

    if (!originalOntouchstart) {
      delete (window as any).ontouchstart
    }
  })

  it('should include scale on tilt', () => {
    const { result } = renderHook(() => useTilt({ scale: 1.05 }))

    const mockEvent = {
      currentTarget: container,
      clientX: 150,
      clientY: 150,
    } as any

    act(() => {
      result.current.onMouseMove(mockEvent)
    })

    expect(container.style.transform).toContain('scale(1.05)')
  })
})
