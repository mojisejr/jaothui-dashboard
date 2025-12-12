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
    xl: 'text-6xl md:text-6xl text-5xl',  // Responsive: 2rem mobile, 2.5rem desktop
  }

  const glowClasses = {
    orange: 'text-primary-orange-glow [text-shadow:0_0_15px_rgba(255,140,0,0.5)]',
    purple: 'text-accent-purple-glow [text-shadow:0_0_15px_rgba(157,0,255,0.5)]',
  }

  const classes = [
    sizeClasses[size],
    glow ? glowClasses[glow] : color,
    'transition-all duration-300 ease-icon group-hover:scale-120 group-hover:rotate-[5deg]',
    'md:mb-0',  // Remove bottom margin on mobile
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return <div className={classes}>{children}</div>
}
