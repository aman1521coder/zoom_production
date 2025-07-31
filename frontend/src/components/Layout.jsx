import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Home, 
  FileText, 
  Settings, 
  Activity,
  Radio,
  LogOut,
  User
} from 'lucide-react';

const Layout = ({ children, user, onLogout }) => {
  const location = useLocation();

  const navigation = [
    { name: 'Dashboard', href: '/', icon: Home },
    { name: 'Transcripts', href: '/transcripts', icon: FileText },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const isActive = (href) => {
    return location.pathname === href;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* Sidebar */}
        <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg border-r border-gray-200">
          {/* Logo */}
          <div className="flex h-16 items-center px-6 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                <Radio className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">RecordFlow</h1>
                <p className="text-xs text-gray-500">Meeting Intelligence</p>
              </div>
            </div>
          </div>
          
          {/* Navigation */}
          <nav className="mt-8 px-3">
            <ul className="space-y-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.name}>
                    <Link
                      to={item.href}
                      className={`
                        group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200
                        ${isActive(item.href)
                          ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
                          : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                        }
                      `}
                    >
                      <Icon
                        className={`mr-3 h-5 w-5 ${
                          isActive(item.href) ? 'text-blue-700' : 'text-gray-400 group-hover:text-gray-500'
                        }`}
                      />
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* User section */}
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-white">
            <div className="flex items-center space-x-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
                <User className="h-4 w-4 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user?.name || 'User'}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user?.email || 'user@company.com'}
                </p>
              </div>
              <button
                onClick={onLogout}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 ml-64">
          <main className="py-8 px-6">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Layout; 