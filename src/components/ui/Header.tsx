import { IoLogOut } from 'react-icons/io5'
import { RiUserHeartFill } from 'react-icons/ri'
import { useAuth } from '~/context/auth.context'

/**
 * Glass morphism header with brand and logout button
 * ใช้สำหรับ authenticated pages
 */
export default function Header() {
  const { logout } = useAuth()

  const handleLogout = () => {
    logout()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleLogout()
    }
  }

  return (
    <header className="glass-header sticky top-0 z-50 w-full px-6 py-4">
      <nav className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-3">
          <RiUserHeartFill className="text-3xl text-orange-400" aria-hidden="true" />
          <h1 className="text-xl font-bold text-white">Jaothui Dashboard</h1>
        </div>

        <button
          onClick={handleLogout}
          onKeyDown={handleKeyDown}
          className="flex items-center gap-2 rounded-xl bg-red-500/20 px-4 py-2 text-white transition-all duration-300 hover:bg-red-500/30 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-red-500/50"
          type="button"
        >
          <IoLogOut className="text-xl" aria-hidden="true" />
          <span>Logout</span>
        </button>
      </nav>
    </header>
  )
}
