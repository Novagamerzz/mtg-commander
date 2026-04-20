import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight text-mtg-gold mb-2">MTG Commander</h1>
        <p className="text-gray-400 text-lg">Multiplayer Commander — online</p>
      </div>

      <div className="flex gap-3">
        {user ? (
          <>
            <Link
              to="/profile"
              className="bg-mtg-gold hover:bg-yellow-500 text-gray-950 font-semibold px-6 py-2.5 rounded-lg transition"
            >
              My Profile
            </Link>
            <button
              className="bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold px-6 py-2.5 rounded-lg transition"
              disabled
            >
              Find Game (soon)
            </button>
          </>
        ) : (
          <>
            <Link
              to="/login"
              className="bg-mtg-gold hover:bg-yellow-500 text-gray-950 font-semibold px-6 py-2.5 rounded-lg transition"
            >
              Sign In
            </Link>
            <Link
              to="/signup"
              className="bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold px-6 py-2.5 rounded-lg transition"
            >
              Sign Up
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
