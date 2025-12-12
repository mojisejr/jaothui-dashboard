/**
 * CardGrid Component Tests (TDD - RED Phase)
 * 
 * Tests for responsive grid layout
 * Expected to FAIL until implementation is complete
 */

import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import CardGrid from '../CardGrid'

describe('CardGrid', () => {
  it('should render children', () => {
    render(
      <CardGrid>
        <div data-testid="child-1">Child 1</div>
        <div data-testid="child-2">Child 2</div>
      </CardGrid>
    )
    
    expect(screen.getByTestId('child-1')).toBeInTheDocument()
    expect(screen.getByTestId('child-2')).toBeInTheDocument()
  })

  it('should have grid display', () => {
    const { container } = render(
      <CardGrid>
        <div>Child</div>
      </CardGrid>
    )
    
    const grid = container.firstChild as HTMLElement
    expect(grid).toHaveClass('grid')
  })

  it('should have 2 columns on desktop', () => {
    const { container } = render(
      <CardGrid>
        <div>Child</div>
      </CardGrid>
    )
    
    const grid = container.firstChild as HTMLElement
    expect(grid.className).toMatch(/grid-cols-2/)
  })

  it('should have 1 column on mobile', () => {
    const { container } = render(
      <CardGrid>
        <div>Child</div>
      </CardGrid>
    )
    
    const grid = container.firstChild as HTMLElement
    // Should have responsive breakpoint
    expect(grid.className).toMatch(/md:grid-cols/)
  })

  it('should have proper gap spacing', () => {
    const { container } = render(
      <CardGrid>
        <div>Child</div>
      </CardGrid>
    )
    
    const grid = container.firstChild as HTMLElement
    expect(grid.className).toMatch(/gap-/)
  })

  it('should have max-width constraint', () => {
    const { container } = render(
      <CardGrid>
        <div>Child</div>
      </CardGrid>
    )
    
    const grid = container.firstChild as HTMLElement
    expect(grid.className).toMatch(/max-w-/)
  })

  it('should center grid', () => {
    const { container } = render(
      <CardGrid>
        <div>Child</div>
      </CardGrid>
    )
    
    const grid = container.firstChild as HTMLElement
    expect(grid.className).toMatch(/mx-auto|justify-center/)
  })

  it('should accept custom className', () => {
    const { container } = render(
      <CardGrid className="custom-class">
        <div>Child</div>
      </CardGrid>
    )
    
    const grid = container.firstChild as HTMLElement
    expect(grid).toHaveClass('custom-class')
  })

  it('should render multiple children correctly', () => {
    render(
      <CardGrid>
        <div data-testid="card-1">Card 1</div>
        <div data-testid="card-2">Card 2</div>
        <div data-testid="card-3">Card 3</div>
        <div data-testid="card-4">Card 4</div>
      </CardGrid>
    )
    
    expect(screen.getByTestId('card-1')).toBeInTheDocument()
    expect(screen.getByTestId('card-2')).toBeInTheDocument()
    expect(screen.getByTestId('card-3')).toBeInTheDocument()
    expect(screen.getByTestId('card-4')).toBeInTheDocument()
  })

  it('should match snapshot', () => {
    const { container } = render(
      <CardGrid>
        <div>Child 1</div>
        <div>Child 2</div>
      </CardGrid>
    )
    expect(container.firstChild).toMatchSnapshot()
  })
})
