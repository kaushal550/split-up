import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Wallet, Users, LogOut, SplitSquareVertical } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/personal', icon: Wallet, label: 'My Expenses' },
  { to: '/groups', icon: Users, label: 'Groups' },
]

export default function Layout({ children }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col fixed h-full z-10">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-2">
          <SplitSquareVertical className="text-teal-600 w-6 h-6" />
          <span className="font-bold text-gray-900 text-lg">SplitUp</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-teal-50 text-teal-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-semibold text-sm">
              {profile?.name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{profile?.name || 'You'}</p>
              <p className="text-xs text-gray-500 truncate">{profile?.phone || profile?.email}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 md:ml-64 p-4 md:p-8 pb-24 md:pb-8 min-w-0">
        {/* Mobile top bar */}
        <div className="flex md:hidden items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <SplitSquareVertical className="text-teal-600 w-5 h-5" />
            <span className="font-bold text-gray-900">SplitUp</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-semibold text-xs">
              {profile?.name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <button onClick={handleSignOut} className="text-gray-400 hover:text-red-500 p-1">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {children}
      </main>

      {/* Bottom nav — mobile only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-10">
        <div className="flex">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center gap-0.5 py-3 text-xs font-medium transition-colors ${
                  isActive ? 'text-teal-600' : 'text-gray-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-5 h-5 ${isActive ? 'text-teal-600' : 'text-gray-400'}`} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

    </div>
  )
}
