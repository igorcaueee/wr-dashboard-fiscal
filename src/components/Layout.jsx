import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  FileSpreadsheet,
  Upload,
  History,
  Lock,
  ChevronDown,
  ChevronRight,
  Building,
  LogOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { base44 } from '@/api/base44Client';

const navItems = [
  {
    label: 'Dashboard',
    path: '/',
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: 'Empresas',
    path: '/empresas',
    icon: Building2,
  },
  {
    label: 'Simples Nacional',
    icon: FileSpreadsheet,
    children: [
      { label: 'Upload de Relatórios', path: '/simples-nacional/upload', icon: Upload },
      { label: 'Histórico de Apurações', path: '/simples-nacional/historico', icon: History },
    ],
  },
  {
    label: 'Lucro Presumido',
    icon: FileSpreadsheet,
    children: [
      { label: 'Dashboard', path: '/lucro-presumido/dashboard', icon: LayoutDashboard },
      { label: 'Upload de SPEDs', path: '/lucro-presumido/upload', icon: Upload },
    ],
  },
];

const disabledItems = [
  { label: 'Lucro Real', emBreve: true },
];

export default function Layout() {
  const [expandedMenus, setExpandedMenus] = useState({ 'Simples Nacional': true, 'Lucro Presumido': true });
  const location = useLocation();

  const toggleMenu = (label) => {
    setExpandedMenus((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-sidebar flex flex-col text-sidebar-foreground">
        {/* Logo */}
        <div className="px-5 py-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center">
              <Building className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight">WR Dashboard</h1>
              <p className="text-[10px] opacity-70 leading-tight">Assessoria Fiscal</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isParentActive = item.children?.some(
              (child) => location.pathname === child.path
            );
            const isExactActive = item.exact
              ? location.pathname === item.path
              : location.pathname.startsWith(item.path);

            if (item.children) {
              return (
                <div key={item.label}>
                  <button
                    onClick={() => toggleMenu(item.label)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                      isParentActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                    )}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {expandedMenus[item.label] ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                  {expandedMenus[item.label] && (
                    <div className="ml-5 mt-1 space-y-0.5 border-l border-sidebar-border pl-3">
                      {item.children.map((child) => {
                        const ChildIcon = child.icon;
                        const isActive = location.pathname === child.path;
                        return (
                          <NavLink
                            key={child.path}
                            to={child.path}
                            className={cn(
                              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-200',
                              isActive
                                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground'
                            )}
                          >
                            <ChildIcon className="w-4 h-4 flex-shrink-0" />
                            <span>{child.label}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.exact}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  isExactActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          {/* Divider */}
          <div className="pt-4 pb-2">
            <div className="border-t border-sidebar-border" />
          </div>

          {/* Disabled items */}
          {disabledItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/40 cursor-not-allowed select-none"
            >
              <Lock className="w-5 h-5 flex-shrink-0" />
              <span>{item.label}</span>
              {item.emBreve && (
                <span className="ml-auto text-[10px] bg-sidebar-accent/50 text-sidebar-foreground/60 px-1.5 py-0.5 rounded-full">
                  Em breve
                </span>
              )}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-sidebar-border">
          <button
            onClick={() => base44.auth.logout()}
            className="flex items-center gap-2 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}