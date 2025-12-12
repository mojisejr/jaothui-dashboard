import { type ReactNode } from 'react'

interface IconProps {
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  color?: string
  glow?: 'orange' | 'purple'
  className?: string
}

/**
 * Icon wrapper component with size variants and glow effects
 * ใช้ห่อ react-icons components
 */
export default function Icon({ children, size = 'md', color, glow, className = '' }: IconProps) {
  const sizeClasses = {
    sm: 'text-2xl',
    md: 'text-4xl',
    lg: 'text-5xl',
    xl: 'text-6xl',
  }

  const glowClasses = {
    orange: '[text-shadow:0_0_20px_rgba(251,146,60,0.5)]',
    purple: '[text-shadow:0_0_20px_rgba(168,85,247,0.5)]',
  }

  const classes = [
    sizeClasses[size],
    color,
    glow ? glowClasses[glow] : '',
    'transition-all duration-300',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return <div className={classes}>{children}</div>
}
