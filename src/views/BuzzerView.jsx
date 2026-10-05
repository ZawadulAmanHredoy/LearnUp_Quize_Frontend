import React, { useState, useEffect, useRef } from 'react';
import {
  Zap,
  Lock,
  Radio,
  CheckCircle,
  XCircle,
  AlertTriangle,
  LogOut,
  Trophy,
  Volume2,
  VolumeX,
  Smartphone,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { socket } from '../lib/socket';
import { playCountdownBeep, playBuzzerStrike } from '../lib/soundEngine';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function BuzzerView() {
  const [team, setTeam] = useState(() => {
    try {
      const saved = localStorage.getItem('learnup_team');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [teamNumber, setTeamNumber] = useState('');
  const [pin, setPin] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [sessionRevokedMsg, setSessionRevokedMsg] = useState(null);

  const [connected, setConnected] = useState(socket.connected);
  const [latency, setLatency] = useState(0);

  // Buzzer Visual States: 'WAITING' | 'COUNTDOWN' | 'UNLOCKED' | 'YOU_BUZZED' | 'LOCKED_OTHER'
  const [buzzerState, setBuzzerState] = useState('WAITING');
  const [countdownNum, setCountdownNum] = useState(null);
  const [buzzerWinner, setBuzzerWinner] = useState(null);
  const [activeStage, setActiveStage] = useState('WELCOME');
  const [score, setScore] = useState(team?.score || 0);

  // Ping Latency Timer
  useEffect(() => {
    const pingInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('ping:measure', { sentAt: Date.now() });
      }
    }, 4000);

    return () => clearInterval(pingInterval);
  }, []);

  // Connect socket and listen to events
  useEffect(() => {
    function onConnect() {
      setConnected(true);
      if (team) {
        socket.emit('join:room', {
          role: 'team',
          teamId: team.id,
          teamNumber: team.teamNumber,
          teamName: team.teamName,
          sessionToken: localStorage.getItem('learnup_session_token')
        });
      }
    }

    function onDisconnect() {
      setConnected(false);
    }

    function onPongMeasure(data) {
      if (data?.sentAt) {
        setLatency(Date.now() - data.sentAt);
      }
    }

    function onStateSync(data) {
      if (data?.state?.currentStage) {
        setActiveStage(data.state.currentStage);
      }
      if (data?.teams && team) {
        const found = data.teams.find((t) => String(t._id || t.id) === String(team.id));
        if (found) {
          setScore(found.score);
        }
      }
      if (data?.buzzer) {
        if (data.buzzer.isOpen) {
          setBuzzerState('UNLOCKED');
        } else if (data.buzzer.winner) {
          if (String(data.buzzer.winner.teamId) === String(team?.id)) {
            setBuzzerState('YOU_BUZZED');
          } else {
            setBuzzerState('LOCKED_OTHER');
            setBuzzerWinner(data.buzzer.winner);
          }
        } else {
          setBuzzerState('WAITING');
        }
      }
    }

    function onCountdownTick(data) {
      setCountdownNum(data.count);
      setBuzzerState('COUNTDOWN');
      playCountdownBeep(data.count);
    }

    function onBuzzerStatus(data) {
      if (data.isOpen) {
        setBuzzerState('UNLOCKED');
        setBuzzerWinner(null);
        if ('vibrate' in navigator) {
          navigator.vibrate(80);
        }
      } else {
        if (buzzerState === 'UNLOCKED') {
          setBuzzerState('WAITING');
        }
      }
    }

    function onBuzzerWinner(winner) {
      playBuzzerStrike();
      setBuzzerWinner(winner);

      if (team && String(winner.teamId) === String(team.id)) {
        setBuzzerState('YOU_BUZZED');
        if ('vibrate' in navigator) {
          navigator.vibrate([200, 100, 200]);
        }
      } else {
        setBuzzerState('LOCKED_OTHER');
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }
      }
    }

    function onBuzzerReset() {
      setBuzzerState('WAITING');
      setBuzzerWinner(null);
      setCountdownNum(null);
    }

    function onAnswerEvaluated(data) {
      if (data?.teams && team) {
        const found = data.teams.find((t) => String(t._id || t.id) === String(team.id));
        if (found) {
          setScore(found.score);
        }
      }
      setTimeout(() => {
        setBuzzerState('WAITING');
        setBuzzerWinner(null);
      }, 2500);
    }

    function onSessionRevoked(data) {
      setSessionRevokedMsg(data?.message || 'Logged in on another device.');
      handleLogout();
    }

    function onQuestionPresented() {
      setBuzzerState('WAITING');
      setBuzzerWinner(null);
      setCountdownNum(null);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('pong:measure', onPongMeasure);
    socket.on('state:sync', onStateSync);
    socket.on('countdown:tick', onCountdownTick);
    socket.on('buzzer:status', onBuzzerStatus);
    socket.on('buzzer:unlocked', () => setBuzzerState('UNLOCKED'));
    socket.on('buzzer:winner', onBuzzerWinner);
    socket.on('buzzer:won', onBuzzerWinner);
    socket.on('buzzer:reset', onBuzzerReset);
    socket.on('question:presented', onQuestionPresented);
    socket.on('answer:evaluated', onAnswerEvaluated);
    socket.on('auth:session_replaced', onSessionRevoked);
    socket.on('auth:session_revoked', onSessionRevoked);

    if (socket.connected && team) {
      onConnect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('pong:measure', onPongMeasure);
      socket.off('state:sync', onStateSync);
      socket.off('countdown:tick', onCountdownTick);
      socket.off('buzzer:status', onBuzzerStatus);
      socket.off('buzzer:unlocked');
      socket.off('buzzer:winner', onBuzzerWinner);
      socket.off('buzzer:won', onBuzzerWinner);
      socket.off('buzzer:reset', onBuzzerReset);
      socket.off('question:presented', onQuestionPresented);
      socket.off('answer:evaluated', onAnswerEvaluated);
      socket.off('auth:session_replaced', onSessionRevoked);
      socket.off('auth:session_revoked', onSessionRevoked);
    };
  }, [team, buzzerState]);

  // Handle Team Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError(null);
    setSessionRevokedMsg(null);
    setLoginLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/v1/auth/team/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamNumber: Number(teamNumber),
          pin: pin.trim()
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to authenticate team');
      }

      const teamData = json.data.team;
      const sessionToken = json.data.sessionToken;

      localStorage.setItem('learnup_team', JSON.stringify(teamData));
      localStorage.setItem('learnup_session_token', sessionToken);
      localStorage.setItem('learnup_token', json.data.token);

      setTeam(teamData);
      setScore(teamData.score);

      // Join socket room
      socket.emit('join:room', {
        role: 'team',
        teamId: teamData.id,
        teamNumber: teamData.teamNumber,
        teamName: teamData.teamName,
        sessionToken
      });
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      if (team) {
        await fetch(`${API_URL}/api/v1/auth/team/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId: team.id })
        });
      }
    } catch (e) {}

    localStorage.removeItem('learnup_team');
    localStorage.removeItem('learnup_session_token');
    localStorage.removeItem('learnup_token');
    setTeam(null);
    setBuzzerState('WAITING');
  };

  // Handle Buzzer Press
  const handleBuzzerClick = () => {
    if (buzzerState !== 'UNLOCKED') return;

    if ('vibrate' in navigator) {
      navigator.vibrate(100);
    }

    socket.emit('team:buzz', {
      teamId: team.id,
      teamNumber: team.teamNumber,
      teamName: team.teamName,
      timestamp: Date.now()
    });
  };

  // -------------------------------------------------------------
  // RENDER: LOGIN SCREEN
  // -------------------------------------------------------------
  if (!team) {
    return (
      <div className="min-h-screen bg-[#0e0720] text-slate-100 flex flex-col justify-between p-6">
        <div className="max-w-md w-full mx-auto my-auto space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#583FA9] to-[#8B5CF6] flex items-center justify-center mx-auto shadow-lg shadow-[#583FA9]/30">
              <Zap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white font-heading">
              Participant Buzzer Login
            </h1>
            <p className="text-xs text-[#E0D7FE]">
              Enter the credentials assigned to your team by the Quizmaster.
            </p>
          </div>

          {/* Revocation Alert */}
          {sessionRevokedMsg && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 shrink-0 text-rose-400" />
              <span>{sessionRevokedMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="glass-panel p-6 rounded-2xl space-y-4">
            {loginError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Team Number
              </label>
              <input
                type="number"
                min="1"
                max="99"
                required
                value={teamNumber}
                onChange={(e) => setTeamNumber(e.target.value)}
                placeholder="e.g. 1, 2, 3"
                className="w-full bg-[#160D2E] border border-white/10 rounded-xl px-4 py-3 text-base text-white focus:outline-none focus:border-[#583FA9] font-mono-numbers"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Security PIN / Passcode
              </label>
              <input
                type="password"
                required
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="4-digit PIN"
                className="w-full bg-[#160D2E] border border-white/10 rounded-xl px-4 py-3 text-base text-white focus:outline-none focus:border-[#583FA9] tracking-widest font-mono-numbers"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full mt-2 py-3.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-[#583FA9] to-[#7C3AED] hover:opacity-95 text-white shadow-lg shadow-[#583FA9]/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loginLoading ? 'Authenticating...' : 'Connect Buzzer'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Notice */}
          <div className="text-center text-[11px] text-slate-400 space-y-1">
            <p>Strict Single-Device Policy enforced.</p>
            <p>Once buzzed, answers must be spoken into the stage microphone.</p>
          </div>
        </div>

        <div className="text-center text-[10px] text-slate-500">
          LearnUp Live Quiz Platform • v1.0.0
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: ACTIVE BUZZER VIEW
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#0e0720] text-slate-100 flex flex-col justify-between p-4 select-none touch-none">
      {/* Top Header Card */}
      <header className="glass-panel p-4 rounded-2xl flex items-center justify-between border border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#583FA9] flex items-center justify-center font-bold text-white shadow-md">
            #{team.teamNumber}
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight">{team.teamName}</h2>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className={`inline-flex items-center gap-1 ${connected ? 'text-emerald-400' : 'text-rose-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                {connected ? `${latency}ms` : 'Disconnected'}
              </span>
              <span>•</span>
              <span className="text-[#E0D7FE] capitalize">{activeStage.replace(/_/g, ' ').toLowerCase()}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Live Score Badge */}
          <div className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-yellow-500/10 border border-amber-500/30 flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-bold text-amber-300 font-mono-numbers">{score} pts</span>
          </div>

          <button
            onClick={handleLogout}
            title="Disconnect device"
            className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Buzzer Area */}
      <main className="flex-1 flex flex-col items-center justify-center my-6">
        {/* Status Prompt */}
        <div className="mb-8 text-center space-y-1">
          {buzzerState === 'WAITING' && (
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center justify-center gap-2">
              <Lock className="w-3.5 h-3.5" />
              Waiting for Host Countdown...
            </div>
          )}
          {buzzerState === 'COUNTDOWN' && (
            <div className="text-sm font-bold text-amber-400 uppercase tracking-widest animate-pulse">
              GET READY TO BUZZ IN: {countdownNum}
            </div>
          )}
          {buzzerState === 'UNLOCKED' && (
            <div className="text-sm font-bold text-rose-400 uppercase tracking-widest animate-bounce">
              ⚡ TAP BUZZER NOW! ⚡
            </div>
          )}
          {buzzerState === 'YOU_BUZZED' && (
            <div className="text-sm font-bold text-emerald-400 uppercase tracking-widest">
              🎉 YOU WON THE BUZZER! SPEAK NOW!
            </div>
          )}
          {buzzerState === 'LOCKED_OTHER' && (
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              LOCKED OUT — {buzzerWinner?.teamName || 'Another Team'} Buzzed First
            </div>
          )}
        </div>

        {/* GIANT REACTIVE BUZZER BUTTON */}
        <div className="relative">
          {/* Animated Background Ring */}
          {buzzerState === 'UNLOCKED' && (
            <div className="absolute -inset-4 rounded-full bg-rose-600/30 blur-xl animate-pulse pointer-events-none" />
          )}
          {buzzerState === 'YOU_BUZZED' && (
            <div className="absolute -inset-4 rounded-full bg-emerald-500/40 blur-xl animate-pulse pointer-events-none" />
          )}

          <button
            onClick={handleBuzzerClick}
            disabled={buzzerState !== 'UNLOCKED'}
            className={`w-64 h-64 sm:w-72 sm:h-72 rounded-full font-heading font-extrabold text-2xl flex flex-col items-center justify-center transition-all duration-200 shadow-2xl relative z-10 active:scale-95 ${
              buzzerState === 'UNLOCKED'
                ? 'bg-gradient-to-b from-rose-500 to-rose-700 text-white shadow-rose-600/50 glow-rose animate-buzzer-ready cursor-pointer'
                : buzzerState === 'YOU_BUZZED'
                ? 'bg-gradient-to-b from-emerald-500 to-emerald-700 text-white shadow-emerald-500/50 glow-mint cursor-default'
                : buzzerState === 'LOCKED_OTHER'
                ? 'bg-[#1e143d] text-slate-500 border-4 border-slate-700/50 cursor-not-allowed opacity-80'
                : buzzerState === 'COUNTDOWN'
                ? 'bg-gradient-to-b from-amber-600 to-amber-800 text-white shadow-amber-500/40 animate-pulse cursor-wait'
                : 'bg-slate-800/80 text-slate-500 border-4 border-slate-700/40 cursor-not-allowed'
            }`}
          >
            {buzzerState === 'UNLOCKED' && (
              <>
                <Zap className="w-12 h-12 mb-2 text-white fill-white animate-bounce" />
                <span className="tracking-wider text-3xl">BUZZ!</span>
                <span className="text-[11px] font-normal opacity-90 mt-1 uppercase tracking-widest">
                  Tap Screen
                </span>
              </>
            )}

            {buzzerState === 'YOU_BUZZED' && (
              <>
                <CheckCircle className="w-12 h-12 mb-2 text-white animate-pulse" />
                <span className="tracking-wide text-2xl text-center px-4">ON AIR!</span>
                <span className="text-[11px] font-normal opacity-90 mt-1 text-center">
                  Speak on stage mic
                </span>
              </>
            )}

            {buzzerState === 'LOCKED_OTHER' && (
              <>
                <XCircle className="w-10 h-10 mb-2 text-slate-500" />
                <span className="tracking-wider text-lg">LOCKED</span>
                <span className="text-[11px] font-normal text-slate-500 mt-1 px-4 text-center truncate max-w-[200px]">
                  {buzzerWinner?.teamName}
                </span>
              </>
            )}

            {buzzerState === 'COUNTDOWN' && (
              <>
                <span className="text-6xl font-mono-numbers font-bold text-white">
                  {countdownNum || '...'}
                </span>
                <span className="text-xs text-amber-200 mt-2 uppercase tracking-widest">
                  Get Ready
                </span>
              </>
            )}

            {buzzerState === 'WAITING' && (
              <>
                <Lock className="w-10 h-10 mb-2 text-slate-600" />
                <span className="tracking-wider text-xl">LOCKED</span>
                <span className="text-[11px] font-normal text-slate-600 mt-1">
                  Wait for Question
                </span>
              </>
            )}
          </button>
        </div>
      </main>

      {/* Footer Banner */}
      <footer className="glass-panel p-3 rounded-xl border border-white/10 text-center text-xs text-slate-400">
        <p className="flex items-center justify-center gap-1.5">
          <Smartphone className="w-3.5 h-3.5 text-[#583FA9]" />
          <span>Keep this browser tab open. Do not lock your phone.</span>
        </p>
      </footer>
    </div>
  );
}
