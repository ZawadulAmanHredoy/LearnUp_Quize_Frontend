import React, { useState, useEffect } from 'react';
import {
  Zap,
  Tv,
  Smartphone,
  Shield,
  ArrowRight,
  Radio,
  Server,
  Layers,
  Award,
  Sparkles,
  ExternalLink,
  Users,
  Trophy,
  CheckCircle,
  Clock,
  Star,
  Brain,
  Target,
  BarChart2,
  Globe,
  Quote,
  ShieldCheck,
  Check,
  Flame,
  Volume2
} from 'lucide-react';
import { socket } from '../lib/socket';
import { apiFetch } from '../lib/config';

export default function HomeLaunchpad({ onNavigate }) {
  const [serverOnline, setServerOnline] = useState(false);
  const [socketConnected, setSocketConnected] = useState(socket.connected);
  const [teams, setTeams] = useState([]);
  const [selectedDemoOption, setSelectedDemoOption] = useState(1);

  useEffect(() => {
    // Check API health
    apiFetch('/health')
      .then(({ json }) => setServerOnline(Boolean(json?.success)))
      .catch(() => setServerOnline(false));

    // Fetch teams
    apiFetch('/teams')
      .then(({ json }) => {
        if (json?.success && json.data) {
          setTeams(json.data);
        }
      })
      .catch(() => {});

    function onConnect() {
      setSocketConnected(true);
    }
    function onDisconnect() {
      setSocketConnected(false);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#FDFCFE] text-slate-900 flex flex-col justify-between selection:bg-[#583FA9] selection:text-white relative">
      {/* Subtle Ambient Background Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-[#583FA9]/10 via-purple-100/40 to-transparent rounded-full blur-[100px]" />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] bg-purple-100/50 rounded-full blur-[120px]" />
        <div className="absolute top-2/3 -left-40 w-[500px] h-[500px] bg-violet-100/40 rounded-full blur-[120px]" />
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 1. TOP HEADER NAVIGATION (BUFT EVENT BRANDING)                 */}
      {/* ------------------------------------------------------------- */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-purple-100/80 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3.5 cursor-pointer" onClick={() => onNavigate('home')}>
            <div className="h-12 px-2.5 py-1 rounded-2xl bg-white border border-purple-200/80 shadow-sm flex items-center justify-center">
              <img src="/buft.png" alt="BUFT Logo" className="h-9 object-contain" />
            </div>
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#583FA9] to-[#7C3AED] flex items-center justify-center p-2 shadow-md shadow-[#583FA9]/25 border border-purple-300/40">
              <img src="/tv.png" alt="Quiz Arena Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <span className="text-xl sm:text-2xl font-black tracking-tight text-[#1A103C] font-heading flex items-center gap-1.5">
                BUFT <span className="text-[#583FA9]">Quiz Arena</span>
              </span>
              <span className="hidden sm:block text-[10px] font-semibold text-purple-600/80 uppercase tracking-widest">
                BGMEA University of Fashion & Technology
              </span>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
            <button onClick={() => onNavigate('home')} className="text-[#583FA9] hover:text-[#47308D] transition-colors">
              Home
            </button>
            <a href="#features" className="hover:text-[#583FA9] transition-colors">
              Features
            </a>
            <a href="#roles" className="hover:text-[#583FA9] transition-colors">
              Stage Roles
            </a>
            <a href="#about-event" className="hover:text-[#583FA9] transition-colors">
              Event Info
            </a>
            <button
              onClick={() => onNavigate('live')}
              className="text-emerald-700 hover:text-emerald-800 transition-colors flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold"
            >
              <span>Audience Live</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </button>
          </nav>

          {/* System Status & Admin Access */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-50/80 border border-purple-200/60 text-xs">
              <span className={`w-2 h-2 rounded-full ${serverOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-slate-600 font-medium">
                {serverOnline ? 'Engine Online' : 'Connecting...'}
              </span>
            </div>

            <button
              onClick={() => onNavigate('admin')}
              className="px-5 py-2.5 rounded-xl bg-[#583FA9] hover:bg-[#493291] text-white font-bold text-sm shadow-lg shadow-[#583FA9]/25 hover:shadow-xl hover:shadow-[#583FA9]/35 transition-all flex items-center gap-2 transform active:scale-95"
            >
              <Shield className="w-4 h-4 text-purple-200" />
              <span>Admin Host</span>
            </button>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------- */}
      {/* 2. HERO SECTION WITH SIGNATURE MOCKUP QUIZ CARD               */}
      {/* ------------------------------------------------------------- */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Text Column */}
          <div className="lg:col-span-7 space-y-6 text-left">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-100/90 border border-purple-200 text-[#583FA9] text-xs font-bold shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Organized by BGMEA University of Fashion & Technology (BUFT)</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-6xl font-black text-[#1A103C] font-heading tracking-tight leading-[1.12]">
              Live Stage Championship,<br />
              <span className="text-[#583FA9]">Engineered for Fair Play.</span>
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl font-normal">
              An auditorium-grade live stage quiz platform featuring sub-millisecond buzzer lockouts, dynamic audio-visual media clues, and high-intensity rapid fire hot seat rounds.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                onClick={() => onNavigate('live')}
                className="px-6 py-3.5 rounded-xl bg-[#583FA9] hover:bg-[#493291] text-white font-bold text-sm shadow-xl shadow-[#583FA9]/30 hover:shadow-2xl transition-all flex items-center gap-2 transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <Tv className="w-4 h-4 text-purple-200" />
                <span>Audience Stage Screen (/live)</span>
              </button>

              <button
                onClick={() => onNavigate('buzzer')}
                className="px-6 py-3.5 rounded-xl bg-white hover:bg-purple-50 text-[#583FA9] font-bold text-sm border-2 border-[#583FA9] shadow-sm hover:shadow transition-all flex items-center gap-2 transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <Smartphone className="w-4 h-4" />
                <span>Participant Buzzer (/buzzer)</span>
              </button>
            </div>

            {/* Stage Event Stats & Badges */}
            <div className="pt-4 flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center text-[#583FA9]">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">&lt;15ms Latency</p>
                  <p className="text-[11px] text-slate-500">Hardware Precision Lockout</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">3 Grand Rounds</p>
                  <p className="text-[11px] text-slate-500">Buzzer • Media • Rapid Fire</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
                  <Trophy className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Live Stage Trophy</p>
                  <p className="text-[11px] text-slate-500">Real-Time Leaderboard</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Signature Quiz Mockup Card */}
          <div className="lg:col-span-5 flex justify-center">
            {/* Outer Royal Purple Frame */}
            <div className="w-full max-w-md bg-[#583FA9] p-6 rounded-3xl shadow-2xl shadow-purple-900/30 transform hover:scale-[1.01] transition-transform">
              {/* Inner Clean White Card */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-100 space-y-4">
                {/* Card Header */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="h-10 px-2 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center">
                      <img src="/buft.png" alt="BUFT" className="h-6 object-contain" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 leading-tight">BUFT Live Stage</h3>
                      <p className="text-[11px] text-purple-600 font-medium">Round 1: Buzzer Battle</p>
                    </div>
                  </div>

                  <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 text-xs font-bold flex items-center gap-1.5 shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    STAGE LIVE
                  </span>
                </div>

                {/* Question Box */}
                <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-100 text-left space-y-1">
                  <span className="text-[11px] font-bold text-[#583FA9] uppercase tracking-wider block">
                    Question 01 of 10 • Points: +10 / -5
                  </span>
                  <h4 className="text-sm sm:text-base font-bold text-slate-900 font-heading leading-snug">
                    Which bi-directional protocol enables instant stage buzzer lockouts?
                  </h4>
                </div>

                {/* 2x2 Options Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { label: 'A', text: 'HTTP Short Polling', correct: false },
                    { label: 'B', text: 'WebSocket Protocol', correct: true },
                    { label: 'C', text: 'FTP Tunneling', correct: false },
                    { label: 'D', text: 'SMTP Relay', correct: false }
                  ].map((opt, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedDemoOption(idx)}
                      className={`p-3 rounded-xl text-left text-xs font-bold transition-all border flex items-center gap-2 ${
                        selectedDemoOption === idx
                          ? 'bg-[#583FA9] text-white border-[#583FA9] shadow-md shadow-purple-500/20'
                          : 'bg-white hover:bg-purple-50/50 text-slate-700 border-slate-200'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${
                        selectedDemoOption === idx ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {opt.label}
                      </span>
                      <span className="truncate">{opt.text}</span>
                    </button>
                  ))}
                </div>

                {/* Card Footer */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Users className="w-3.5 h-3.5 text-[#583FA9]" />
                    <span>6 Stage Teams Ready</span>
                  </div>

                  <div className="flex items-center gap-1.5 font-mono font-bold text-rose-500 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100">
                    <Clock className="w-3.5 h-3.5" />
                    <span>00:30s</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 3. KEY METRICS STRIP                                          */}
      {/* ------------------------------------------------------------- */}
      <section className="relative z-10 border-y border-purple-100 bg-white/70 backdrop-blur-sm py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="space-y-1">
              <Layers className="w-6 h-6 text-[#583FA9] mx-auto" />
              <h3 className="text-2xl sm:text-3xl font-black text-[#1A103C] font-heading">3 Rounds</h3>
              <p className="text-xs text-slate-500 font-medium">Buzzer • Media • Rapid Fire</p>
            </div>
            <div className="space-y-1">
              <Zap className="w-6 h-6 text-[#583FA9] mx-auto" />
              <h3 className="text-2xl sm:text-3xl font-black text-[#1A103C] font-heading">&lt;15ms</h3>
              <p className="text-xs text-slate-500 font-medium">Sub-Millisecond Lockout</p>
            </div>
            <div className="space-y-1">
              <Tv className="w-6 h-6 text-[#583FA9] mx-auto" />
              <h3 className="text-2xl sm:text-3xl font-black text-[#1A103C] font-heading">16:9 Cinema</h3>
              <p className="text-xs text-slate-500 font-medium">Auditorium Projector View</p>
            </div>
            <div className="space-y-1">
              <ShieldCheck className="w-6 h-6 text-[#583FA9] mx-auto" />
              <h3 className="text-2xl sm:text-3xl font-black text-[#1A103C] font-heading">1-Device PIN</h3>
              <p className="text-xs text-slate-500 font-medium">Strict Anti-Spam Security</p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 4. CHAMPIONSHIP FEATURES (SQUIRCLE CARDS)                     */}
      {/* ------------------------------------------------------------- */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center space-y-3 max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-purple-100 text-[#583FA9] text-xs font-bold">
            <Zap className="w-3.5 h-3.5" />
            <span>Platform Features</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-[#1A103C] font-heading tracking-tight">
            Engineered for <span className="text-[#583FA9]">Stage Excellence</span>
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            Purpose-built architecture ensuring flawless real-time coordination between host, contestants, and audience.
          </p>
        </div>

        {/* 6 Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* 1. Purple Squircle */}
          <div className="p-7 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-xl transition-all space-y-4 text-left group">
            <div className="w-13 h-13 rounded-2xl bg-[#8B5CF6] text-white flex items-center justify-center p-3 shadow-md shadow-purple-500/20 group-hover:scale-105 transition-transform">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 font-heading">Sub-Millisecond Buzzer Lockout</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Atomic server timestamp resolution locks out all secondary strikes within milliseconds, preventing ties and disputed buzzer calls.
            </p>
          </div>

          {/* 2. Amber Squircle */}
          <div className="p-7 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-xl transition-all space-y-4 text-left group">
            <div className="w-13 h-13 rounded-2xl bg-[#F59E0B] text-white flex items-center justify-center p-3 shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
              <Award className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 font-heading">Dynamic Point Accounting</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Instant score synchronization across rounds. Admin score editor allows manual adjustments (+10 / -5 / custom) with live audience updates.
            </p>
          </div>

          {/* 3. Sky Squircle */}
          <div className="p-7 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-xl transition-all space-y-4 text-left group">
            <div className="w-13 h-13 rounded-2xl bg-[#0EA5E9] text-white flex items-center justify-center p-3 shadow-md shadow-sky-500/20 group-hover:scale-105 transition-transform">
              <Volume2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 font-heading">Audio-Visual Media Streaming</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Pre-load media clips directly into local memory before the round begins, ensuring buffer-free instant video and audio clue playback on stage.
            </p>
          </div>

          {/* 4. Emerald Squircle */}
          <div className="p-7 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-xl transition-all space-y-4 text-left group">
            <div className="w-13 h-13 rounded-2xl bg-[#10B981] text-white flex items-center justify-center p-3 shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
              <Tv className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 font-heading">Auditorium Projector Cinema Mode</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              High-contrast 16:9 full-screen projection tailored for auditorium displays, complete with animated welcome screens, prayer breaks, and lunch breaks.
            </p>
          </div>

          {/* 5. Pink Squircle */}
          <div className="p-7 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-xl transition-all space-y-4 text-left group">
            <div className="w-13 h-13 rounded-2xl bg-[#EC4899] text-white flex items-center justify-center p-3 shadow-md shadow-pink-500/20 group-hover:scale-105 transition-transform">
              <Flame className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 font-heading">Rapid Fire 60s Hot Seat</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Intense 60-second individual team hot seat rounds with live tally counters for correct, wrong, and passed questions.
            </p>
          </div>

          {/* 6. Indigo Squircle */}
          <div className="p-7 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-xl transition-all space-y-4 text-left group">
            <div className="w-13 h-13 rounded-2xl bg-[#6366F1] text-white flex items-center justify-center p-3 shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 font-heading">Single-Device Team Security</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Teams authenticate securely via Team ID and 4-digit PIN. Single-device enforcement instantly revokes older connections upon duplicate logins.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 5. 3 STAGE ROLE LAUNCHPAD CARDS (ADMIN / LIVE / BUZZER)       */}
      {/* ------------------------------------------------------------- */}
      <section id="roles" className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center space-y-3 max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-purple-100 text-[#583FA9] text-xs font-bold">
            <Layers className="w-3.5 h-3.5" />
            <span>Event Interfaces</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-[#1A103C] font-heading tracking-tight">
            Launch Stage Environments
          </h2>
          <p className="text-sm text-slate-600">
            Open the dedicated interface for your event role: Host Controller, Audience Display, or Team Buzzer.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Card 1: Admin Dashboard */}
          <div
            onClick={() => onNavigate('admin')}
            className="p-8 rounded-3xl bg-white border-2 border-purple-100 hover:border-[#583FA9] shadow-lg hover:shadow-2xl transition-all cursor-pointer flex flex-col justify-between space-y-6 transform hover:-translate-y-1.5 group"
          >
            <div className="space-y-4 text-left">
              <div className="w-14 h-14 rounded-2xl bg-[#583FA9] text-white flex items-center justify-center shadow-lg shadow-[#583FA9]/30 group-hover:scale-110 transition-transform">
                <Shield className="w-7 h-7" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#583FA9] block">
                  Role 1 • The Quizmaster
                </span>
                <h3 className="text-2xl font-bold text-[#1A103C] font-heading mt-1">
                  Admin Controller
                </h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  The central cockpit. Broadcast questions, reveal options one-by-one, unlock buzzers, pre-load media, edit scores, and manage intermissions.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Buzzer lockout & option-by-option reveal</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Live leaderboard manual score editor</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Media pre-loading & intermission controls</span>
                </div>
              </div>
            </div>

            <button className="w-full py-3 px-4 rounded-xl bg-[#583FA9] group-hover:bg-[#47308D] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-colors">
              <span>Launch Admin Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Card 2: Live Stage (Projector) */}
          <div
            onClick={() => onNavigate('live')}
            className="p-8 rounded-3xl bg-white border-2 border-emerald-100 hover:border-[#10B981] shadow-lg hover:shadow-2xl transition-all cursor-pointer flex flex-col justify-between space-y-6 transform hover:-translate-y-1.5 group"
          >
            <div className="space-y-4 text-left">
              <div className="w-14 h-14 rounded-2xl bg-[#10B981] text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform">
                <Tv className="w-7 h-7" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 block">
                  Role 2 • Auditorium Screen
                </span>
                <h3 className="text-2xl font-bold text-[#1A103C] font-heading mt-1">
                  Live Stage Projector
                </h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Cinematic 16:9 view for the auditorium audience. Dynamic countdown rings, animated welcome and break screens, sound effects, and trophy presentation.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>BUFT branding with welcome & break screens</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Web Audio synthesizer & buzzer siren</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Zero-lag audio-visual cinema player</span>
                </div>
              </div>
            </div>

            <button className="w-full py-3 px-4 rounded-xl bg-[#10B981] group-hover:bg-[#059669] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-colors">
              <span>Open Audience Stage (/live)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Card 3: Mobile Buzzer */}
          <div
            onClick={() => onNavigate('buzzer')}
            className="p-8 rounded-3xl bg-white border-2 border-rose-100 hover:border-[#F43F5E] shadow-lg hover:shadow-2xl transition-all cursor-pointer flex flex-col justify-between space-y-6 transform hover:-translate-y-1.5 group"
          >
            <div className="space-y-4 text-left">
              <div className="w-14 h-14 rounded-2xl bg-[#F43F5E] text-white flex items-center justify-center shadow-lg shadow-rose-500/30 group-hover:scale-110 transition-transform">
                <Smartphone className="w-7 h-7" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 block">
                  Role 3 • Stage Contestants
                </span>
                <h3 className="text-2xl font-bold text-[#1A103C] font-heading mt-1">
                  Participant Buzzer
                </h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Mobile-optimized buzzer interface for competing teams. Log in with Team ID and PIN, watch the 3-2-1 countdown, and tap to buzz into the stage mic.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Team ID (e.g. T-01) & PIN authentication</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Tactile haptic vibration response</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Real-time stage state synchronization</span>
                </div>
              </div>
            </div>

            <button className="w-full py-3 px-4 rounded-xl bg-[#F43F5E] group-hover:bg-[#E11D48] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-colors">
              <span>Connect Team Buzzer (/buzzer)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 6. EVENT ABOUT / BUFT PRESENTATION BANNER                      */}
      {/* ------------------------------------------------------------- */}
      <section id="about-event" className="relative z-10 bg-[#583FA9] text-white py-20 my-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 max-w-3xl mx-auto mb-14">
            <div className="h-16 px-4 py-2 rounded-2xl bg-white w-fit mx-auto shadow-xl flex items-center justify-center">
              <img src="/buft.png" alt="BUFT Logo" className="h-12 object-contain" />
            </div>
            <h2 className="text-3xl sm:text-5xl font-black font-heading tracking-tight">
              BUFT Live Stage Quiz Championship
            </h2>
            <p className="text-sm sm:text-base text-purple-200">
              Organized by BGMEA University of Fashion & Technology (BUFT) to celebrate intellect, speed, and analytical excellence across academic departments.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Card 1 */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-7 border border-white/20 text-center space-y-4 hover:bg-white/15 transition-all">
              <div className="w-14 h-14 rounded-2xl bg-white/20 mx-auto flex items-center justify-center text-2xl shadow-inner">
                ⚡
              </div>
              <h3 className="text-lg font-bold text-white font-heading">Round 1: Buzzer Battle</h3>
              <p className="text-xs sm:text-sm text-purple-100 leading-relaxed">
                Fast-paced multi-choice questions. Buzz in first to win the right to answer. +10 points for correct answers, -5 points for incorrect answers.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-7 border border-white/20 text-center space-y-4 hover:bg-white/15 transition-all">
              <div className="w-14 h-14 rounded-2xl bg-white/20 mx-auto flex items-center justify-center text-2xl shadow-inner">
                🎬
              </div>
              <h3 className="text-lg font-bold text-white font-heading">Round 2: Audio-Visual Clues</h3>
              <p className="text-xs sm:text-sm text-purple-100 leading-relaxed">
                High-definition media clips and audio clues streamed onto the main stage. Teams analyze the visual media before buzzer countdown unlocks.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-7 border border-white/20 text-center space-y-4 hover:bg-white/15 transition-all">
              <div className="w-14 h-14 rounded-2xl bg-white/20 mx-auto flex items-center justify-center text-2xl shadow-inner">
                🔥
              </div>
              <h3 className="text-lg font-bold text-white font-heading">Round 3: Rapid Fire Hot Seat</h3>
              <p className="text-xs sm:text-sm text-purple-100 leading-relaxed">
                60 seconds of continuous questions. Each team takes the stage hot seat to score maximum points through speed, knowledge, and strategic passes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 7. FOOTER                                                     */}
      {/* ------------------------------------------------------------- */}
      <footer className="relative z-10 bg-[#110C24] text-slate-400 pt-16 pb-12 border-t border-purple-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            {/* Brand Column */}
            <div className="md:col-span-6 space-y-4 text-left">
              <div className="flex items-center gap-3">
                <div className="h-10 px-2 py-1 rounded-xl bg-white flex items-center justify-center shadow-md">
                  <img src="/buft.png" alt="BUFT Logo" className="h-7 object-contain" />
                </div>
                <div className="w-10 h-10 rounded-xl bg-[#583FA9] flex items-center justify-center p-2 text-white shadow-md">
                  <img src="/tv.png" alt="Quiz Arena Logo" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white font-heading">BUFT Quiz Arena</h3>
                  <p className="text-[11px] text-purple-300">Live Stage Championship 2026</p>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed max-w-md">
                Official live stage championship platform organized by BGMEA University of Fashion & Technology (BUFT). Built with real-time WebSocket synchronization, sub-millisecond buzzer arbitration, and cinematic media streaming.
              </p>
            </div>

            {/* Quick Links */}
            <div className="md:col-span-3 space-y-3 text-left">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider font-heading">Stage Portals</h4>
              <ul className="space-y-2 text-xs text-slate-400">
                <li className="hover:text-white transition-colors cursor-pointer" onClick={() => onNavigate('live')}>
                  → Audience Live Screen (/live)
                </li>
                <li className="hover:text-white transition-colors cursor-pointer" onClick={() => onNavigate('buzzer')}>
                  → Participant Buzzer (/buzzer)
                </li>
                <li className="hover:text-white transition-colors cursor-pointer" onClick={() => onNavigate('admin')}>
                  → Quizmaster Dashboard (/admin)
                </li>
              </ul>
            </div>

            {/* Event Info */}
            <div className="md:col-span-3 space-y-3 text-left">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider font-heading">Organized By</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                BGMEA University of Fashion & Technology (BUFT)<br />
                Nishatnagar, Turag, Dhaka-1230, Bangladesh
              </p>
            </div>
          </div>

          {/* Bottom Copyright & Pill Banner */}
          <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
            <div className="text-slate-500">
              © 2026 BUFT — BGMEA University of Fashion & Technology. All rights reserved.
            </div>

            <div className="px-5 py-2 rounded-full bg-[#00C48C] text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20">
              <span>🎉 BUFT Live Stage Event • Official Arena Platform</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
