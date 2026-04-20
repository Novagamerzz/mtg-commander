import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function NavBar() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <nav
      className="shrink-0 flex items-center gap-1 px-4"
      style={{
        height: 48,
        background: 'rgba(10,10,12,0.95)',
        borderBottom: '1px solid rgba(161,122,43,0.25)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Brand */}
      <span
        className="text-sm font-black tracking-wide mr-4 select-none"
        style={{ color: '#c9a84c' }}
      >
        ⚔ MTG Commander
      </span>

      {/* Nav links */}
      <NavLink
        to="/profile"
        className={({ isActive }) =>
          `text-sm font-semibold px-3 py-1.5 rounded-md transition-colors ${
            isActive
              ? 'text-yellow-400 bg-yellow-900/30'
              : 'text-gray-400 hover:text-gray-100 hover:bg-white/5'
          }`
        }
      >
        My Decks
      </NavLink>

      <NavLink
        to="/lobby"
        className={({ isActive }) =>
          `text-sm font-semibold px-3 py-1.5 rounded-md transition-colors ${
            isActive
              ? 'text-yellow-400 bg-yellow-900/30'
              : 'text-gray-400 hover:text-gray-100 hover:bg-white/5'
          }`
        }
      >
        Play
      </NavLink>

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        className="ml-auto text-sm font-semibold px-3 py-1.5 rounded-md transition-colors text-gray-500 hover:text-red-400 hover:bg-red-950/30"
      >
        Sign Out
      </button>
    </nav>
  );
}
