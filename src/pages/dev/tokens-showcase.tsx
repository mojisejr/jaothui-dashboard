/**
 * Design Tokens Showcase Page
 * 
 * หน้านี้แสดง visual verification ของ design tokens ทั้งหมด
 * เพื่อให้นักพัฒนาสามารถตรวจสอบว่า tokens ทำงานถูกต้องในทุก breakpoint
 */

export default function TokensShowcase() {
  return (
    <div className="min-h-screen bg-dark text-text-main p-8 relative overflow-hidden">
      {/* Ambient Background Orbs */}
      <div className="ambient-orb-orange w-96 h-96 top-[-100px] left-[-100px]" />
      <div className="ambient-orb-purple w-80 h-80 bottom-[-50px] right-[-50px] animate-float-delayed" />
      <div className="ambient-orb-red w-52 h-52 top-[40%] left-[50%] translate-x-[-50%] translate-y-[-50%]" />

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        <div className="glass-header sticky top-5 mb-8 p-5 rounded-3xl">
          <h1 className="text-3xl font-semibold">🎨 Design Tokens Showcase</h1>
          <p className="text-text-muted mt-2">
            Visual verification สำหรับ design tokens ทั้งหมดจาก DESIGN_TOKENS.md
          </p>
        </div>

        {/* Colors Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">สีหลัก (Primary Colors)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <ColorCard
              name="Primary Orange"
              className="bg-primary-orange"
              value="#FF8C00"
            />
            <ColorCard
              name="Primary Orange Glow"
              className="bg-primary-orange-glow"
              value="#FFA500"
            />
            <ColorCard
              name="Accent Purple"
              className="bg-accent-purple"
              value="#9D00FF"
            />
            <ColorCard
              name="Accent Purple Glow"
              className="bg-accent-purple-glow"
              value="#B847FF"
            />
          </div>
        </section>

        {/* Background & Text Colors */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">
            สีพื้นหลังและข้อความ (Background & Text)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ColorCard name="Dark Background" className="bg-dark border border-glass-border" value="#0f0f11" />
            <ColorCard name="Text Main" className="bg-text-main" value="#ffffff" textDark />
            <ColorCard name="Text Muted" className="bg-text-muted" value="rgba(255,255,255,0.6)" textDark />
          </div>
        </section>

        {/* Glassmorphism Cards */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">
            Glassmorphism Effects
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-card p-6 rounded-3xl">
              <h3 className="text-xl font-medium mb-2">Glass Card</h3>
              <p className="text-text-muted mb-4">
                การ์ดแบบกระจกโปร่งแสงพร้อม backdrop blur 10px
              </p>
              <code className="text-sm bg-dark/50 px-3 py-1 rounded">
                .glass-card
              </code>
            </div>

            <div className="glass-header p-6 rounded-3xl">
              <h3 className="text-xl font-medium mb-2">Glass Header</h3>
              <p className="text-text-muted mb-4">
                Header แบบกระจกโปร่งแสงพร้อม backdrop blur 20px
              </p>
              <code className="text-sm bg-dark/50 px-3 py-1 rounded">
                .glass-header
              </code>
            </div>
          </div>
        </section>

        {/* Shadows */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">Shadows & Glows</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="glass-card p-6 rounded-3xl shadow-glass-card">
              <h3 className="font-medium mb-2">Glass Card Shadow</h3>
              <code className="text-xs text-text-muted">shadow-glass-card</code>
            </div>

            <div className="glass-card p-6 rounded-3xl shadow-glass-card-hover">
              <h3 className="font-medium mb-2">Glass Card Hover</h3>
              <code className="text-xs text-text-muted">shadow-glass-card-hover</code>
            </div>

            <div className="glass-card p-6 rounded-3xl shadow-glass-header">
              <h3 className="font-medium mb-2">Glass Header Shadow</h3>
              <code className="text-xs text-text-muted">shadow-glass-header</code>
            </div>

            <div className="glass-card p-6 rounded-3xl shadow-orange-glow">
              <h3 className="font-medium mb-2 text-primary-orange-glow">
                Orange Glow
              </h3>
              <code className="text-xs text-text-muted">shadow-orange-glow</code>
            </div>

            <div className="glass-card p-6 rounded-3xl shadow-purple-glow">
              <h3 className="font-medium mb-2 text-accent-purple-glow">
                Purple Glow
              </h3>
              <code className="text-xs text-text-muted">shadow-purple-glow</code>
            </div>

            <div className="glass-card p-6 rounded-3xl shadow-orange-inset">
              <h3 className="font-medium mb-2 text-primary-orange">
                Orange Inset
              </h3>
              <code className="text-xs text-text-muted">shadow-orange-inset</code>
            </div>
          </div>
        </section>

        {/* Typography */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">Typography</h2>
          <div className="glass-card p-6 rounded-3xl space-y-4">
            <div>
              <p className="text-sm text-text-muted mb-1">Font Family: Kanit</p>
              <p className="font-kanit text-2xl">
                The quick brown fox jumps over the lazy dog
              </p>
              <p className="font-kanit text-xl">
                กอไก่ ขอขวด คอควาย งองาน
              </p>
            </div>

            <div>
              <p className="text-sm text-text-muted mb-1">Font Family: Inter</p>
              <p className="font-inter text-2xl">
                The quick brown fox jumps over the lazy dog
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div>
                <p className="text-text-muted text-sm mb-2">font-light (300)</p>
                <p className="font-light text-xl">ควาย Buffalo</p>
              </div>
              <div>
                <p className="text-text-muted text-sm mb-2">font-normal (400)</p>
                <p className="font-normal text-xl">ควาย Buffalo</p>
              </div>
              <div>
                <p className="text-text-muted text-sm mb-2">font-medium (500)</p>
                <p className="font-medium text-xl">ควาย Buffalo</p>
              </div>
              <div>
                <p className="text-text-muted text-sm mb-2">font-semibold (600)</p>
                <p className="font-semibold text-xl">ควาย Buffalo</p>
              </div>
            </div>
          </div>
        </section>

        {/* Animations */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">Animations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-card p-6 rounded-3xl">
              <h3 className="text-xl font-medium mb-4">Float Animation</h3>
              <div className="relative h-32 bg-dark/30 rounded-xl overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-primary-orange rounded-full animate-float opacity-60" />
              </div>
              <code className="text-xs text-text-muted mt-4 block">
                animate-float
              </code>
            </div>

            <div className="glass-card p-6 rounded-3xl">
              <h3 className="text-xl font-medium mb-4">Ripple Effect</h3>
              <p className="text-text-muted text-sm mb-4">
                (Ripple effect จะถูกใช้ผ่าน JavaScript hook ใน components)
              </p>
              <code className="text-xs text-text-muted">
                animate-ripple (triggered by click)
              </code>
            </div>
          </div>
        </section>

        {/* Responsive Test */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">
            Responsive Breakpoints Test
          </h2>
          <div className="glass-card p-6 rounded-3xl">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-primary-orange/20 p-4 rounded-xl text-center">
                <p className="font-medium">Mobile</p>
                <p className="text-xs text-text-muted mt-1">&lt; 768px</p>
                <p className="text-sm mt-2">1 column</p>
              </div>
              <div className="bg-accent-purple/20 p-4 rounded-xl text-center">
                <p className="font-medium">Tablet</p>
                <p className="text-xs text-text-muted mt-1">≥ 768px</p>
                <p className="text-sm mt-2">2 columns</p>
              </div>
              <div className="bg-primary-orange/20 p-4 rounded-xl text-center">
                <p className="font-medium">Desktop</p>
                <p className="text-xs text-text-muted mt-1">≥ 1024px</p>
                <p className="text-sm mt-2">4 columns</p>
              </div>
              <div className="bg-accent-purple/20 p-4 rounded-xl text-center">
                <p className="font-medium">Large</p>
                <p className="text-xs text-text-muted mt-1">≥ 1280px</p>
                <p className="text-sm mt-2">4 columns</p>
              </div>
            </div>
          </div>
        </section>

        {/* Icon & Text Shadow Examples */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">
            Icon Glow Effects
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-card p-8 rounded-3xl text-center">
              <div className="text-6xl mb-4 text-primary-orange-glow text-shadow-orange">
                🐃
              </div>
              <p className="font-medium">Orange Glow</p>
              <code className="text-xs text-text-muted">text-shadow-orange</code>
            </div>

            <div className="glass-card p-8 rounded-3xl text-center">
              <div className="text-6xl mb-4 text-accent-purple-glow text-shadow-purple">
                ✨
              </div>
              <p className="font-medium">Purple Glow</p>
              <code className="text-xs text-text-muted">text-shadow-purple</code>
            </div>
          </div>
        </section>

        {/* Footer Info */}
        <div className="glass-card p-6 rounded-3xl text-center">
          <p className="text-text-muted">
            📚 สำหรับรายละเอียดเพิ่มเติม กรุณาดูที่{' '}
            <code className="bg-dark/50 px-2 py-1 rounded">
              docs/DESIGN_TOKENS.md
            </code>
          </p>
          <p className="text-text-muted mt-2 text-sm">
            Last Updated: 2025-12-12 | Phase 1: Design Tokens Setup ✅
          </p>
        </div>
      </div>
    </div>
  )
}

// Helper Component
interface ColorCardProps {
  name: string
  className: string
  value: string
  textDark?: boolean
}

function ColorCard({ name, className, value, textDark }: ColorCardProps) {
  return (
    <div className={`${className} p-6 rounded-3xl shadow-glass-card`}>
      <div className={textDark ? 'text-dark' : 'text-white'}>
        <p className="font-medium text-lg mb-1">{name}</p>
        <code className="text-xs opacity-80">{value}</code>
      </div>
    </div>
  )
}
