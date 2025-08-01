import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Transcripts from './pages/Transcripts';
import Settings from './pages/Settings';
import useAuth from './hooks/useAuth';

function App() {
  const { user, loading, isAuthenticated, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="*" element={
          !isAuthenticated ? <Home /> : (
      <Layout user={user} onLogout={logout}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transcripts" element={<Transcripts />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
          )
        } />
      </Routes>
    </Router>
  );
}

export default App; 