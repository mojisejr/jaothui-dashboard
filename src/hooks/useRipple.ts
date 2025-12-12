import { useCallback } from 'react'

/**
 * Hook สำหรับสร้าง ripple effect เมื่อคลิก element
 * ใช้สำหรับ interactive components เช่น buttons, cards
 */
export function useRipple() {
  const createRipple = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const element = event.currentTarget

    // ลบ ripples เก่าก่อน
    const existingRipples = element.querySelectorAll('.ripple')
    existingRipples.forEach((ripple) => ripple.remove())

    // คำนวณตำแหน่งของ ripple
    const rect = element.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    // สร้าง ripple element
    const ripple = document.createElement('span')
    ripple.classList.add('ripple')
    ripple.style.left = `${x}px`
    ripple.style.top = `${y}px`

    element.appendChild(ripple)

    // ลบ ripple หลังจาก animation เสร็จ
    setTimeout(() => {
      ripple.remove()
    }, 600)
  }, [])

  return { createRipple }
}
