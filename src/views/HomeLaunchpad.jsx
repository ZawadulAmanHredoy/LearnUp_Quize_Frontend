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
  Trophy
} from 'lucide-react';
import { socket } from '../lib/socket';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function HomeLaunchpad({ onNavigate }) {
  const [serverOnline, setServerOnline] = useState(false);
  const [socketConnected, setSocketConnected] = useState(socket.connected);
  const [teams, setTeams] = useState([]);

  useEffect(() => {
    // Check API health
    fetch(`${API_URL}/api/v1/health`)
      .then((res) => res.json())
      .then((json) => {
        if (json.status === 'success' || json.success) {
          setServerOnline(true);
        }
      })
      .catch(() => setServerOnline(false));

    // Fetch teams
    fetch(`${API_URL}/api/v1/teams`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
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
    <div className="min-h-screen bg-[#0e0720] text-slate-100 flex flex-col justify-between p-6 relative overflow-hidden">
      {/* Background Ambient Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/4 w-[500px] h-[500px] bg-[#583FA9]/25 rounded-full blur-[140px]" />
        <div className="absolute top-1/2 -right-40 w-[500px] h-[500px] bg-[#7C3AED]/20 rounded-full blur-[140px]" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 max-w-7xl w-full mx-auto flex items-center justify-between pb-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#583FA9] to-[#8B5CF6] flex items-center justify-center font-bold text-xl text-white shadow-lg shadow-[#583FA9]/40 font-heading">
            L
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white font-heading">
              LearnUp Live Quiz Platform
            </h1>
            <p className="text-xs text-[#E0D7FE]">
              Physical Stage Event Architecture & TV Game Show System
            </p>
          </div>
        </div>

        {/* Server Status Pills */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-panel border border-white/10">
            <span
              className={`w-2 h-2 rounded-full ${
                serverOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
              }`}
            />
            <span className="text-slate-300">
              API: {serverOnline ? 'Online (5000)' : 'Connecting...'}
            </span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-panel border border-white/10">
            <span
              className={`w-2 h-2 rounded-full ${
                socketConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
              }`}
            />
            <span className="text-slate-300">
              Sockets: {socketConnected ? 'Connected' : 'Offline'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Hub: The 3 Dedicated Roles */}
      <main className="relative z-10 max-w-7xl w-full mx-auto my-auto py-12 space-y-12">
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <span className="px-4 py-1.5 rounded-full bg-[#583FA9]/20 text-[#E0D7FE] border border-[#583FA9]/40 text-xs font-bold uppercase tracking-wider glow-purple inline-block">
            Television Game Show Engine
          </span>
          <h2 className="text-4xl sm:text-6xl font-black text-white font-heading tracking-tight">
            Launch Stage Environment
          </h2>
          <p className="text-base sm:text-lg text-slate-300">
            Select an interface below to participate in the live quiz or open each view in separate windows/devices.
          </p>
        </div>

        {/* 3 Role Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* 1. ADMIN CONTROLLER */}
          <div
            onClick={() => onNavigate('admin')}
            className="group p-8 rounded-3xl glass-panel glass-panel-hover transition-all duration-300 border border-white/10 flex flex-col justify-between cursor-pointer space-y-6 transform hover:-translate-y-2"
          >
            <div className="space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-[#583FA9] text-white flex items-center justify-center shadow-lg shadow-[#583FA9]/40 group-hover:scale-110 transition-transform">
                <Shield className="w-8 h-8" />
              </div>

              <div>
                <span className="text-xs uppercase font-bold tracking-wider text-[#E0D7FE] block">
                  Role 1 • The Quizmaster
                </span>
                <h3 className="text-2xl font-bold text-white font-heading mt-1">
                  Admin Controller
                </h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  The host dashboard. Broadcasts questions, reveals options, initiates countdowns, locks verbal answers, scores rounds, and triggers breaks.
                </p>
              </div>

              <div className="pt-2 text-xs text-slate-300 space-y-1 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> Buzzer Battle & Option Staggering
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> AV Media Remote (Play/Pause)
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> Rapid Fire 60s Hotkey Pad (Z, X, C)
                </div>
              </div>
            </div>

            <button className="w-full py-3 px-4 rounded-xl bg-[#583FA9] hover:bg-[#6b4ec7] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-colors">
              <span>Open Host Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* 2. AUDIENCE PROJECTOR */}
          <div
            onClick={() => onNavigate('projector')}
            className="group p-8 rounded-3xl glass-panel glass-panel-hover transition-all duration-300 border border-white/10 flex flex-col justify-between cursor-pointer space-y-6 transform hover:-translate-y-2"
          >
            <div className="space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-[#10B981] text-white flex items-center justify-center shadow-lg shadow-[#10B981]/40 group-hover:scale-110 transition-transform">
                <Tv className="w-8 h-8" />
              </div>

              <div>
                <span className="text-xs uppercase font-bold tracking-wider text-emerald-300 block">
                  Role 2 • The Big Screen
                </span>
                <h3 className="text-2xl font-bold text-white font-heading mt-1">
                  Audience Projector
                </h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  16:9 widescreen spectator view for auditorium projectors. Displays questions, dramatic option animations, buzzer strikes, countdown rings, and winner fanfare.
                </p>
              </div>

              <div className="pt-2 text-xs text-slate-300 space-y-1 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> 3-2-1 Pop Ring & Buzzer Strike
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> Zero-Latency Web Audio Synthesizer
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> Dynamic Breaks & Champion Confetti
                </div>
              </div>
            </div>

            <button className="w-full py-3 px-4 rounded-xl bg-[#10B981] hover:bg-[#0ea571] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-colors">
              <span>Launch Big Screen View</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* 3. PARTICIPANT MOBILE BUZZER */}
          <div
            onClick={() => onNavigate('buzzer')}
            className="group p-8 rounded-3xl glass-panel glass-panel-hover transition-all duration-300 border border-white/10 flex flex-col justify-between cursor-pointer space-y-6 transform hover:-translate-y-2"
          >
            <div className="space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-[#F43F5E] text-white flex items-center justify-center shadow-lg shadow-[#F43F5E]/40 group-hover:scale-110 transition-transform">
                <Smartphone className="w-8 h-8" />
              </div>

              <div>
                <span className="text-xs uppercase font-bold tracking-wider text-rose-300 block">
                  Role 3 • Stage Participants
                </span>
                <h3 className="text-2xl font-bold text-white font-heading mt-1">
                  Participant Buzzer
                </h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Mobile-optimized buzzer interface. Authenticate with team PIN, tap the giant reactive neon button upon countdown, and answer verbally on stage.
                </p>
              </div>

              <div className="pt-2 text-xs text-slate-300 space-y-1 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> 1-Device Single-Session Security
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> 5 Tactile Visual Buzzer States
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> Instant Lockout & Haptic Feedback
                </div>
              </div>
            </div>

            <button className="w-full py-3 px-4 rounded-xl bg-[#F43F5E] hover:bg-[#e12d4d] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-colors">
              <span>Connect Mobile Buzzer</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Demo Credentials Roster Card */}
        <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" />
              Pre-Registered Stage Teams (Quick Test PINs)
            </h4>
            <span className="text-xs text-slate-400">Use these to test the buzzer from multiple tabs or phones</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { num: 1, name: 'Alpha (Titans)', pin: '1001' },
              { num: 2, name: 'Beta (Vipers)', pin: '1002' },
              { num: 3, name: 'Gamma (Hawks)', pin: '1003' },
              { num: 4, name: 'Delta (Cyber)', pin: '1004' },
              { num: 5, name: 'Epsilon (Quantum)', pin: '1005' },
              { num: 6, name: 'Zeta (Falcons)', pin: '1006' }
            ].map((t) => (
              <div
                key={t.num}
                className="p-3 rounded-2xl bg-white/5 border border-white/10 text-center space-y-1"
              >
                <div className="text-xs font-bold text-white">Team #{t.num}</div>
                <div className="text-[11px] text-slate-400 truncate">{t.name}</div>
                <div className="text-xs font-mono font-bold text-amber-300">PIN: {t.pin}</div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 max-w-7xl w-full mx-auto pt-6 border-t border-white/10 flex items-center justify-between text-xs text-slate-500">
        <div>LearnUp Live Quiz Platform • Full Production Build</div>
        <div>Socket.IO • React 18 • Express • Web Audio API</div>
      </footer>
    </div>
  );
}
