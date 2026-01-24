import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, FolderOpen, Settings } from 'lucide-react';
import { clsx } from 'clsx';

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Projects', icon: Home },
    { path: '/settings', label: 'Settings', icon: Settings }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <FolderOpen className="h-8 w-8 text-blue-600" />
                <span className="ml-2 text-xl font-bold text-gray-900">Talos</span>
              </div>
              <div className="hidden sm:ml-8 sm:flex sm:space-x-8">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={clsx(
                        'inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium',
                        isActive
                          ? 'border-blue-500 text-gray-900'
                          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                      )}
                    >
                      <Icon size={18} className="mr-2" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
};

