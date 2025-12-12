import Link from 'next/link'
import { type ReactNode } from 'react'
import { useRipple } from '~/hooks/useRipple'
import { useTilt } from '~/hooks/useTilt'
import Icon from './Icon'

interface DashboardCardProps {
  title: string
  icon: ReactNode
  variant?: 'orange' | 'purple'
  onClick?: () => void
  href?: string
  className?: string
}

/**
 * Interactive dashboard card with ripple, tilt effects, and glassmorphism
 * รองรับทั้ง onClick และ href สำหรับ navigation
 */
export default function DashboardCard({
  title,
  icon,
  variant = 'orange',
  onClick,
  href,
  className = '',
}: DashboardCardProps) {
  const { createRipple } = useRipple()
  const { onMouseMove, onMouseLeave } = useTilt({ intensity: 5, scale: 1.03 })

  const shadowClasses = {
    orange: 'shadow-orange-glow hover:shadow-orange-glow/70',
    purple: 'shadow-purple-glow hover:shadow-purple-glow/70',
  }

  const classes = [
    'glass-card',
    'group relative overflow-hidden cursor-pointer',
    'flex flex-col items-center justify-center gap-4 p-8',
    'h-[140px] md:flex-col md:justify-center md:px-8',
    'md:h-[140px] h-[100px] flex-row justify-start px-6',
    'rounded-2xl',
    'transition-all duration-[400ms] ease-card',
    shadowClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    createRipple(event)
    if (onClick) onClick()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const mouseEvent = {
        currentTarget: event.currentTarget,
        clientX: event.currentTarget.getBoundingClientRect().left + event.currentTarget.getBoundingClientRect().width / 2,
        clientY: event.currentTarget.getBoundingClientRect().top + event.currentTarget.getBoundingClientRect().height / 2,
      } as React.MouseEvent<HTMLElement>
      createRipple(mouseEvent)
      if (onClick) onClick()
    }
  }

  const content = (
    <>
      <Icon size="xl" glow={variant}>
        {icon}
      </Icon>
      <h3 className="text-center text-xl font-semibold text-white">{title}</h3>
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {content}
      </Link>
    )
  }

  return (
    <button
      className={classes}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      type="button"
    >
      {content}
    </button>
  )
}
