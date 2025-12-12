/**
 * Animated ambient orbs for background decoration
 * ใช้สำหรับสร้างบรรยากาศ glassmorphism
 */
export default function AmbientOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="ambient-orb-orange absolute left-[10%] top-[20%] h-64 w-64 animate-float blur-[100px]"
        aria-hidden="true"
      />
      <div
        className="ambient-orb-purple absolute right-[15%] top-[60%] h-80 w-80 animate-float-delayed blur-[120px]"
        aria-hidden="true"
      />
      <div
        className="ambient-orb-red absolute bottom-[10%] left-[40%] h-72 w-72 animate-float blur-[110px]"
        aria-hidden="true"
      />
    </div>
  )
}
