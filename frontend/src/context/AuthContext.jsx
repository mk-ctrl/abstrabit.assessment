import React, { createContext, useState, useEffect, useContext } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('session_token') || null);
  const [username, setUsername] = useState(localStorage.getItem('session_username') || null);
  const [userId, setUserId] = useState(localStorage.getItem('session_user_id') || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Basic verification of stored details
    setLoading(false);
  }, [token]);

  const login = (newToken, newUsername, newUserId) => {
    localStorage.setItem('session_token', newToken);
    localStorage.setItem('session_username', newUsername);
    localStorage.setItem('session_user_id', newUserId);
    setToken(newToken);
    setUsername(newUsername);
    setUserId(newUserId);
  };

  const logout = () => {
    localStorage.removeItem('session_token');
    localStorage.removeItem('session_username');
    localStorage.removeItem('session_user_id');
    setToken(null);
    setUsername(null);
    setUserId(null);
  };

  return (
    <AuthContext.Provider value={{ token, username, userId, isAuthenticated: !!token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
