import { useCallback } from 'react'

interface TiltOptions {
  intensity?: number
  scale?: number
  disableOnTouch?: boolean
}

/**
 * Hook สำหรับสร้าง 3D tilt effect เมื่อเลื่อน mouse บน element
 * ใช้สำหรับ interactive cards, buttons
 */
export function useTilt(options: TiltOptions = {}) {
  const { intensity = 10, scale = 1.02, disableOnTouch = true } = options

  const onMouseMove = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (disableOnTouch && 'ontouchstart' in window) {
        return
      }

      const element = event.currentTarget
      const rect = element.getBoundingClientRect()

      const x = event.clientX - rect.left
      const y = event.clientY - rect.top

      const centerX = rect.width / 2
      const centerY = rect.height / 2

      const rotateX = ((y - centerY) / centerY) * -intensity
      const rotateY = ((x - centerX) / centerX) * intensity

      element.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`
    },
    [intensity, scale, disableOnTouch]
  )

  const onMouseLeave = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const element = event.currentTarget
    element.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)'
  }, [])

  return { onMouseMove, onMouseLeave }
}
