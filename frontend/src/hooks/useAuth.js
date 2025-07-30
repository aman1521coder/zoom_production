import { useState, useEffect } from 'react';

const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token');
      const userParam = urlParams.get('user');

      if (token && userParam) {
        try {
          const userData = JSON.parse(decodeURIComponent(userParam));
          localStorage.setItem('authToken', token);
          setUser(userData);
          
          window.history.replaceState({}, document.title, '/');
        } catch (error) {
          console.error('Error parsing user data:', error);
        }
        setLoading(false);
      } else {
        const existingToken = localStorage.getItem('authToken');
        if (existingToken) {
          await verifyToken(existingToken);
        }
        setLoading(false);
      }
    };

    const verifyToken = async (token) => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'https://aizoomai.com/api';
        
        const response = await fetch(`${apiUrl}/auth/verify`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setUser(data.user);
          } else {
            localStorage.removeItem('authToken');
            setUser(null);
          }
        } else {
          localStorage.removeItem('authToken');
          setUser(null);
        }
      } catch (error) {
        console.error('Token verification failed:', error);
        localStorage.removeItem('authToken');
        setUser(null);
      }
    };

    initializeAuth();
  }, []);

  const logout = () => {
    localStorage.removeItem('authToken');
    setUser(null);
    window.location.href = '/';
  };

  const isAuthenticated = !!user;

  return {
    user,
    loading,
    isAuthenticated,
    logout
  };
};

export default useAuth; 