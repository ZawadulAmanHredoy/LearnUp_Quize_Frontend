import React, { useState, useEffect } from 'react';
import AdminDashboard from './views/AdminDashboard';
import ProjectorView from './views/ProjectorView';
import BuzzerView from './views/BuzzerView';
import HomeLaunchpad from './views/HomeLaunchpad';

export default function App() {
  const getInitialView = () => {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('/admin')) return 'admin';
    if (path.includes('/live') || path.includes('/projector') || path.includes('/broadcast')) return 'live';
    if (path.includes('/buzzer') || path.includes('/team') || path.includes('/player')) return 'buzzer';
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
      live: '/live',
      buzzer: '/buzzer',
      projector: '/live',
      player: '/buzzer'
    };
    const targetUrl = urlMap[view] || '/';
    window.history.pushState({}, '', targetUrl);
  };

  return (
    <div className={`${(currentView === 'live' || currentView === 'projector') ? 'h-screen max-h-screen overflow-hidden bg-[#160D2E] text-slate-100' : currentView === 'buzzer' ? 'min-h-screen bg-[#F8F9FE] text-slate-900' : 'min-h-screen bg-[#0e0720] text-slate-100'} flex flex-col font-sans select-none`}>
      {/* View Render */}
      {currentView === 'home' && <HomeLaunchpad onNavigate={navigateTo} />}
      {currentView === 'admin' && <AdminDashboard />}
      {(currentView === 'live' || currentView === 'projector') && <ProjectorView />}
      {currentView === 'buzzer' && <BuzzerView />}
    </div>
  );
}
