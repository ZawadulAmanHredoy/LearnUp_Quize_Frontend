import React, { useState, useEffect } from 'react';
import AdminDashboard from './views/AdminDashboard';
import ProjectorView from './views/ProjectorView';
import BuzzerView from './views/BuzzerView';
import HomeLaunchpad from './views/HomeLaunchpad';
import { Shield, Tv, Smartphone, Home } from 'lucide-react';

export default function App() {
  const getInitialView = () => {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('/admin')) return 'admin';
    if (path.includes('/projector') || path.includes('/broadcast')) return 'projector';
    if (path.includes('/buzzer') || path.includes('/team')) return 'buzzer';
    return 'home';
  };

  const [currentView, setCurrentView] = useState(getInitialView);

  // Sync with browser navigation
  useEffect(() => {
    const handlePopState = () => {
      setCurrentView(getInitialView());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (view) => {
    setCurrentView(view);
    const urlMap = {
      home: '/',
      admin: '/admin',
      projector: '/projector',
      buzzer: '/buzzer'
    };
    const targetUrl = urlMap[view] || '/';
    window.history.pushState({}, '', targetUrl);
  };

  return (
    <div className="min-h-screen bg-[#0e0720] text-slate-100 flex flex-col font-sans">
      {/* Quick Role Switcher Floating Bar */}
      <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-3 py-2 rounded-2xl bg-black/75 backdrop-blur-xl border border-white/15 shadow-2xl flex items-center gap-1.5 opacity-90 hover:opacity-100 transition-opacity">
        <button
          onClick={() => navigateTo('home')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            currentView === 'home'
              ? 'bg-[#583FA9] text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-white/10'
          }`}
          title="Home Launchpad"
        >
          <Home className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Hub</span>
        </button>

        <button
          onClick={() => navigateTo('admin')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            currentView === 'admin'
              ? 'bg-[#583FA9] text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-white/10'
          }`}
          title="Admin Controller"
        >
          <Shield className="w-3.5 h-3.5 text-purple-300" />
          <span className="hidden sm:inline">Admin</span>
        </button>

        <button
          onClick={() => navigateTo('projector')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            currentView === 'projector'
              ? 'bg-[#10B981] text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-white/10'
          }`}
          title="Audience Projector Big Screen"
        >
          <Tv className="w-3.5 h-3.5 text-emerald-300" />
          <span className="hidden sm:inline">Projector</span>
        </button>

        <button
          onClick={() => navigateTo('buzzer')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            currentView === 'buzzer'
              ? 'bg-[#F43F5E] text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-white/10'
          }`}
          title="Mobile Participant Buzzer"
        >
          <Smartphone className="w-3.5 h-3.5 text-rose-300" />
          <span className="hidden sm:inline">Buzzer</span>
        </button>
      </nav>

      {/* View Render */}
      {currentView === 'home' && <HomeLaunchpad onNavigate={navigateTo} />}
      {currentView === 'admin' && <AdminDashboard />}
      {currentView === 'projector' && <ProjectorView />}
      {currentView === 'buzzer' && <BuzzerView />}
    </div>
  );
}
