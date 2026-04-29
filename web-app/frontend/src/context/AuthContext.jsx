/**
 * Authentication Context — Provider Pattern implementation.
 *
 * Centralizes authentication state (user, token, role) and exposes it
 * to all child components via React Context API, eliminating prop drilling.
 *
 * Design Pattern: Provider Pattern (React Context)
 * SOLID Principle: Single Responsibility — auth state management only
 *
 * Usage:
 *   // In App.jsx: wrap with <AuthProvider>
 *   // In any component: const { user, login, logout } = useAuth();
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

const API_BASE = import.meta.env.VITE_API_URL || '';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }

    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(data => {
        setUser({
          userId: data.userId,
          name: data.name,
          role: data.role.toLowerCase(),
          email: data.email,
        });
      })
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback((token, userData) => {
    localStorage.setItem('token', token);
    setUser({
      userId: userData.userId,
      name: userData.name,
      role: (userData.role || '').toLowerCase(),
      email: userData.email,
    });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setUser(null);
  }, []);

  const updateName = useCallback((newName) => {
    setUser(prev => prev ? { ...prev, name: newName } : null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateName, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Custom hook for consuming auth context.
 * Throws if used outside AuthProvider (fail-fast principle).
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
