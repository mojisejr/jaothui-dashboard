import { type ReactNode } from 'react'

interface CardGridProps {
  children: ReactNode
  className?: string
}

/**
 * Responsive grid layout for dashboard cards
 * 2 columns on desktop, 1 column on mobile
 */
export default function CardGrid({ children, className = '' }: CardGridProps) {
  return (
    <div
      className={`mx-auto grid max-w-3xl grid-cols-1 gap-5 md:grid-cols-2 ${className}`}
    >
      {children}
    </div>
  )
}
