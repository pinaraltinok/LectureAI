/**
 * Authentication Context — Provider Pattern implementation.
 *
 * JWT token is stored in an httpOnly cookie (set by backend).
 * Browser sends the cookie automatically — NO token in localStorage.
 * This prevents XSS attacks from reading the token via F12 DevTools.
 *
 * Design Pattern: Provider Pattern (React Context)
 * SOLID Principle: Single Responsibility — auth state management only
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

const API_BASE = import.meta.env.VITE_API_URL || '';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from httpOnly cookie on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/auth/me`, {
      credentials: 'include', // Send httpOnly cookie
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
      .catch(() => {/* No valid session — stay logged out */})
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback((userData) => {
    // Token is already set as httpOnly cookie by backend
    // We only store non-sensitive user info in React state
    setUser({
      userId: userData.userId,
      name: userData.name,
      role: (userData.role || '').toLowerCase(),
      email: userData.email,
    });
  }, []);

  const logout = useCallback(async () => {
    // Tell backend to clear the httpOnly cookie
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
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
