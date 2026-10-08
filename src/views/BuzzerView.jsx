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
  ShieldAlert,
  Tv,
  Flame,
  Sparkles,
  Clock
} from 'lucide-react';
import { socket } from '../lib/socket';
import { playCountdownBeep, playBuzzerStrike } from '../lib/soundEngine';

import { apiFetch } from '../lib/config';
import { useMediaSource } from '../lib/useMediaSource';

export default function BuzzerView() {
  const [team, setTeam] = useState(() => {
    try {
      const saved = localStorage.getItem('learnup_team');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [teamIdInput, setTeamIdInput] = useState('');
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

  // Active Question & Media Sync States (Round 2: AV)
  const [activeQuestion, setActiveQuestion] = useState(null);
  // Phones stream the clip from the server (no local download)
  const mediaSource = useMediaSource(activeQuestion);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [questionSubState, setQuestionSubState] = useState({
    isQuestionVisible: false,
    revealedOptions: [],
    areAllOptionsVisible: false,
    isCountdownActive: false,
    isBuzzerOpen: false,
    buzzerLockedBy: null,
    selectedOptionIndex: null,
    isAnswerLocked: false,
    isEvaluated: false,
    isCorrect: null
  });
  const [activeTeamId, setActiveTeamId] = useState(null);
  const [mediaSubState, setMediaSubState] = useState({ isPlaying: false, currentTime: 0, action: 'pause' });
  const [isMediaMuted, setIsMediaMuted] = useState(true);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const mediaRef = useRef(null);

  const audioRemaining = Math.max(0, Math.ceil((audioDuration || 0) - audioCurrentTime));
  const audioPercent = audioDuration > 0 ? Math.min(100, (audioCurrentTime / audioDuration) * 100) : 0;
  const formatAudioTime = (sec) => {
    if (isNaN(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const playMobileMediaSafely = async (el) => {
    if (!el) return;
    try {
      await el.play();
    } catch (err) {
      console.warn('[Buzzer] Mobile playback blocked unmuted, forcing muted play:', err?.message);
      el.muted = true;
      setIsMediaMuted(true);
      try {
        await el.play();
      } catch (e2) {
        console.error('[Buzzer] Muted playback also failed:', e2?.message);
      }
    }
  };

  // Reset audio time tracking when the clip changes
  useEffect(() => {
    setAudioCurrentTime(0);
    setAudioDuration(0);
    setIsAudioPlaying(false);
  }, [activeQuestion?._id, mediaSource?.url]);

  // Synchronized playback when stage, activeQuestion, or mediaSubState updates
  useEffect(() => {
    if (activeStage === 'ROUND_AV' && mediaRef.current) {
      if (mediaSubState.isPlaying) {
        playMobileMediaSafely(mediaRef.current);
      } else if (mediaSubState.action === 'pause') {
        mediaRef.current.pause();
      }
    }
  }, [activeStage, activeQuestion?._id, mediaSource?.url, mediaSubState.isPlaying, mediaSubState.action]);

  // Socket handlers read the latest state through refs so the listeners can
  // stay registered for the whole session instead of re-binding on every change
  const buzzerStateRef = useRef(buzzerState);
  buzzerStateRef.current = buzzerState;
  const latencyRef = useRef(0);
  const evaluationResetTimer = useRef(null);

  // Ping Latency Timer
  useEffect(() => {
    const pingInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('ping:measure', { sentAt: Date.now(), latency: latencyRef.current });
      }
    }, 4000);

    return () => clearInterval(pingInterval);
  }, []);

  // Connect socket and listen to events
  useEffect(() => {
    function onConnect() {
      setConnected(true);
      if (team) {
        socket.emit('join:room', { role: 'team', token: localStorage.getItem('learnup_token') });
      }
    }

    function onDisconnect() {
      setConnected(false);
    }

    function onPongMeasure(data) {
      if (data?.sentAt) {
        latencyRef.current = Date.now() - data.sentAt;
        setLatency(latencyRef.current);
      }
    }

    function onStateSync(data) {
      if (data?.state?.currentStage) {
        setActiveStage(data.state.currentStage);
      }
      if (data?.state?.activeTeamId !== undefined) {
        setActiveTeamId(data.state.activeTeamId);
      }
      if (data?.state?.questionSubState) {
        setQuestionSubState(data.state.questionSubState);
      }
      if (data?.state?.currentQuestionIndex !== undefined) {
        setQuestionIndex(data.state.currentQuestionIndex);
      }
      if (data?.state?.mediaSubState) {
        setMediaSubState(data.state.mediaSubState);
      }
      if (data && 'activeQuestion' in data) {
        setActiveQuestion(data.activeQuestion || null);
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
      } else if (buzzerStateRef.current === 'UNLOCKED') {
        setBuzzerState('WAITING');
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
      clearTimeout(evaluationResetTimer.current);
      evaluationResetTimer.current = setTimeout(() => {
        setBuzzerState('WAITING');
        setBuzzerWinner(null);
      }, 2500);
    }

    // This phone's session is no longer valid. Only clear local data: calling
    // the logout API here would end the session of the phone that replaced us.
    function onSessionRevoked(data) {
      setSessionRevokedMsg(data?.message || 'Logged in on another device.');
      clearLocalSession();
    }

    function onBuzzerUnlocked() {
      setBuzzerState('UNLOCKED');
      setBuzzerWinner(null);
    }

    function onLeaderboardUpdate(teams) {
      const found = teams?.find((t) => String(t._id || t.id) === String(team?.id));
      if (found) setScore(found.score);
    }

    function onQuestionPresented(data) {
      setBuzzerState('WAITING');
      setBuzzerWinner(null);
      setCountdownNum(null);
      if (data?.question) setActiveQuestion(data.question);
      if (data?.questionIndex !== undefined) setQuestionIndex(data.questionIndex);
      if (data?.questionSubState) setQuestionSubState(data.questionSubState);
      if (data?.mediaSubState) {
        setMediaSubState(data.mediaSubState);
      } else {
        setMediaSubState({ isPlaying: false, currentTime: 0, action: 'pause' });
      }
      if (mediaRef.current) {
        mediaRef.current.currentTime = 0;
        mediaRef.current.pause();
      }
    }

    function onQuestionShown(data) {
      if (data?.questionSubState) setQuestionSubState(data.questionSubState);
    }

    function onOptionsUpdated(data) {
      setQuestionSubState((prev) => ({
        ...prev,
        revealedOptions: data.revealedIndices || [],
        areAllOptionsVisible: Boolean(data.allRevealed)
      }));
    }

    function onTurnUpdated(data) {
      if (data?.activeTeamId !== undefined) {
        setActiveTeamId(data.activeTeamId);
      }
    }

    function onMediaSync(data) {
      if (data?.mediaSubState) {
        setMediaSubState(data.mediaSubState);
      }
      if (!mediaRef.current) return;
      const el = mediaRef.current;
      if (data.action === 'play') {
        playMobileMediaSafely(el);
      } else if (data.action === 'pause') {
        el.pause();
      } else if (data.action === 'replay') {
        el.currentTime = 0;
        playMobileMediaSafely(el);
      } else if (data.action === 'seek' && data.time !== undefined) {
        el.currentTime = data.time;
      } else if (data.action === 'mute') {
        el.muted = true;
        setIsMediaMuted(true);
      } else if (data.action === 'unmute') {
        el.muted = false;
        setIsMediaMuted(false);
      }
    }

    function onStageChanged(data) {
      if (data?.stage) {
        setActiveStage(data.stage);
        if (data.stage !== 'ROUND_BUZZER') {
          setBuzzerState('WAITING');
          setBuzzerWinner(null);
        }
      }
      if (data?.state?.activeTeamId !== undefined) setActiveTeamId(data.state.activeTeamId);
      if (data?.state?.questionSubState) setQuestionSubState(data.state.questionSubState);
      if (data?.state?.mediaSubState) setMediaSubState(data.state.mediaSubState);
      if ('activeQuestion' in data) setActiveQuestion(data.activeQuestion || null);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('pong:measure', onPongMeasure);
    socket.on('state:sync', onStateSync);
    socket.on('stage:updated', onStageChanged);
    socket.on('countdown:tick', onCountdownTick);
    socket.on('buzzer:status', onBuzzerStatus);
    socket.on('buzzer:unlocked', onBuzzerUnlocked);
    socket.on('buzzer:winner', onBuzzerWinner);
    socket.on('leaderboard:update', onLeaderboardUpdate);
    socket.on('buzzer:reset', onBuzzerReset);
    socket.on('question:presented', onQuestionPresented);
    socket.on('question:shown', onQuestionShown);
    socket.on('options:updated', onOptionsUpdated);
    socket.on('turn:updated', onTurnUpdated);
    socket.on('media:sync', onMediaSync);
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
      socket.off('stage:updated', onStageChanged);
      socket.off('countdown:tick', onCountdownTick);
      socket.off('buzzer:status', onBuzzerStatus);
      socket.off('buzzer:unlocked', onBuzzerUnlocked);
      socket.off('buzzer:winner', onBuzzerWinner);
      socket.off('leaderboard:update', onLeaderboardUpdate);
      socket.off('buzzer:reset', onBuzzerReset);
      socket.off('question:presented', onQuestionPresented);
      socket.off('question:shown', onQuestionShown);
      socket.off('options:updated', onOptionsUpdated);
      socket.off('turn:updated', onTurnUpdated);
      socket.off('media:sync', onMediaSync);
      socket.off('answer:evaluated', onAnswerEvaluated);
      socket.off('auth:session_replaced', onSessionRevoked);
      socket.off('auth:session_revoked', onSessionRevoked);
    };
  }, [team]);

  // Handle Team Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError(null);
    setSessionRevokedMsg(null);
    setLoginLoading(true);

    try {
      const { ok, json } = await apiFetch('/auth/team/login', {
        method: 'POST',
        body: {
          teamId: teamIdInput.trim(),
          pin: pin.trim()
        }
      });

      if (!ok || !json?.success) {
        throw new Error(json?.error || 'Failed to authenticate team');
      }

      const teamData = json.data.team;
      const sessionToken = json.data.sessionToken;

      localStorage.setItem('learnup_team', JSON.stringify(teamData));
      localStorage.setItem('learnup_session_token', sessionToken);
      localStorage.setItem('learnup_token', json.data.token);

      // Setting the team re-runs the socket effect, which joins the team room
      setTeam(teamData);
      setScore(teamData.score);
      if (!socket.connected) socket.connect();
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle Logout
  function clearLocalSession() {
    localStorage.removeItem('learnup_team');
    localStorage.removeItem('learnup_session_token');
    localStorage.removeItem('learnup_token');
    setTeam(null);
    setBuzzerState('WAITING');
  }

  const handleLogout = async () => {
    try {
      await apiFetch('/auth/team/logout', { method: 'POST', token: localStorage.getItem('learnup_token') });
    } catch (e) {}
    clearLocalSession();
  };

  // Handle Buzzer Press
  const handleBuzzerClick = () => {
    if (buzzerState !== 'UNLOCKED') return;

    if ('vibrate' in navigator) {
      navigator.vibrate(100);
    }

    // The server identifies the team from this phone's verified session
    socket.emit('team:buzz', { timestamp: Date.now() });
  };

  // -------------------------------------------------------------
  // RENDER: LOGIN SCREEN (LEARNUP CLEAN BRAND STYLE)
  // -------------------------------------------------------------
  if (!team) {
    return (
      <div className="min-h-screen bg-[#F8F9FE] text-slate-900 flex flex-col justify-between p-6">
        <div className="max-w-md w-full mx-auto my-auto space-y-6">
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="flex items-center justify-center gap-3">
              <div className="h-14 px-3 py-1.5 rounded-2xl bg-white flex items-center justify-center shadow-md border border-purple-200">
                <img src="/buft.png" alt="BUFT Logo" className="h-9 object-contain" />
              </div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#583FA9] to-[#7C3AED] flex items-center justify-center shadow-md p-2.5 border border-purple-300/40">
                <img src="/tv.png" alt="Quiz Arena Logo" className="w-full h-full object-contain" />
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ECE8F9] text-[#583FA9] text-xs font-bold">
              <span>Organized by BUFT • Live Arena</span>
            </div>
            <h1 className="text-2xl font-black text-[#1A103C] font-heading tracking-tight">
              Participant Buzzer Login
            </h1>
            <p className="text-xs text-slate-500">
              Enter your Team ID (e.g. T-01) and security PIN assigned by the Quizmaster.
            </p>
          </div>

          {/* Revocation Alert */}
          {sessionRevokedMsg && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 shrink-0 text-rose-500" />
              <span>{sessionRevokedMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="bg-white p-6 sm:p-7 rounded-3xl space-y-4 shadow-xl border border-purple-100">
            {loginError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{loginError}</span>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                Team ID
              </label>
              <input
                type="text"
                required
                value={teamIdInput}
                onChange={(e) => setTeamIdInput(e.target.value)}
                placeholder="e.g. T-01, T-02"
                className="w-full bg-slate-50 border border-slate-200 focus:border-[#583FA9] focus:ring-2 focus:ring-purple-100 rounded-xl px-4 py-3 text-base text-slate-900 font-mono-numbers uppercase"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                Security PIN / Passcode
              </label>
              <input
                type="password"
                required
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="4-digit PIN"
                className="w-full bg-slate-50 border border-slate-200 focus:border-[#583FA9] focus:ring-2 focus:ring-purple-100 rounded-xl px-4 py-3 text-base text-slate-900 tracking-widest font-mono-numbers"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full mt-2 py-3.5 px-4 rounded-xl font-bold text-sm bg-[#583FA9] hover:bg-[#4a3294] text-white shadow-lg shadow-purple-900/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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

        <div className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
          <img src="/tv.png" alt="LearnUp Logo" className="w-3.5 h-3.5 object-contain opacity-70" />
          <span>LearnUp Live Stage Platform • v1.0.0</span>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: ACTIVE BUZZER VIEW
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#F8F9FE] text-slate-900 flex flex-col justify-between p-4 select-none touch-none">
      {/* Top Header Card */}
      <header className="p-4 rounded-2xl bg-white text-slate-900 flex items-center justify-between border border-purple-100 shadow-md">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-[#583FA9] to-[#7C3AED] flex items-center justify-center font-black text-white text-base shadow-md">
              #{team.teamNumber}
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-md bg-[#583FA9] p-0.5 flex items-center justify-center border border-white">
              <img src="/tv.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold text-[#1A103C] tracking-tight truncate">{team.teamName}</h2>
              {team.teamId && (
                <span className="px-1.5 py-0.2 rounded bg-[#ECE8F9] text-[#583FA9] font-mono text-[10px] font-bold shrink-0">
                  {team.teamId}
                </span>
              )}
            </div>
            {(team.institution || team.teamLead) && (
              <div className="text-[10px] text-slate-500 truncate flex items-center gap-1.5">
                {team.institution && <span>🏛️ {team.institution}</span>}
                {team.institution && team.teamLead && <span className="opacity-40">•</span>}
                {team.teamLead && <span>Lead: {team.teamLead}</span>}
              </div>
            )}
            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
              <span className={`inline-flex items-center gap-1 font-semibold ${connected ? 'text-emerald-600' : 'text-rose-600'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                {connected ? `${latency}ms` : 'Disconnected'}
              </span>
              <span>•</span>
              <span className="text-purple-700 capitalize font-medium">{activeStage.replace(/_/g, ' ').toLowerCase()}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Live Score Badge */}
          <div className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-xs font-bold text-amber-800 font-mono-numbers">{score} pts</span>
          </div>

          <button
            onClick={handleLogout}
            title="Disconnect device"
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center my-6">
        {activeStage === 'ROUND_AV' ? (
          <div className="max-w-md w-full mx-auto space-y-4 animate-pop">
            {/* Round & Turn Status Card */}
            <div className={`p-4 rounded-2xl border transition-all ${
              team && activeTeamId && String(activeTeamId) === String(team.id || team._id)
                ? 'bg-amber-50 border-amber-300 shadow-md ring-2 ring-amber-400'
                : 'bg-white border-purple-100 shadow-md'
            }`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#ECE8F9] text-[#583FA9] uppercase tracking-wider">
                  Round 2: Audio-Visual
                </span>
                <span className="text-[11px] font-mono-numbers text-slate-500 font-bold">
                  Question #{questionIndex + 1}
                </span>
              </div>

              {team && activeTeamId && String(activeTeamId) === String(team.id || team._id) ? (
                <div className="flex items-center gap-2 text-amber-900 font-extrabold text-sm animate-pulse">
                  <span className="text-base">🎯</span>
                  <span>YOUR TEAM'S TURN! Watch &amp; answer to Quizmaster!</span>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="font-semibold">Turn:</span>
                  <span className="font-bold text-slate-800">
                    {activeTeamId ? 'Active Team Turn on Stage' : 'Waiting for Quizmaster'}
                  </span>
                </div>
              )}
            </div>

            {/* Media Clue Display with Synchronized Playback */}
            {activeQuestion ? (
              <div className="bg-white p-4 rounded-3xl border border-purple-100 shadow-xl space-y-3">
                {activeQuestion.mediaType === 'VIDEO' && mediaSource && (
                  <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-slate-300 shadow-inner group">
                    <video
                      ref={mediaRef}
                      key={mediaSource.url}
                      src={mediaSource.url}
                      controls={false}
                      preload="auto"
                      playsInline
                      muted={isMediaMuted}
                      className="w-full h-full object-contain"
                    />

                    {/* Stage Sync Live Badge */}
                    <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-sm border border-white/20 text-[10px] font-bold text-emerald-400 flex items-center gap-1.5 shadow-sm pointer-events-none">
                      <span className={`w-2 h-2 rounded-full ${mediaSubState.isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
                      <span>{mediaSubState.isPlaying ? 'STAGE SYNC PLAYING' : 'PAUSED'}</span>
                    </div>

                    {/* Mute/Unmute Audio Toggle for Phone */}
                    <button
                      onClick={() => {
                        const newMuted = !isMediaMuted;
                        setIsMediaMuted(newMuted);
                        if (mediaRef.current) {
                          mediaRef.current.muted = newMuted;
                          if (!newMuted && mediaSubState.isPlaying) {
                            mediaRef.current.play().catch(() => {});
                          }
                        }
                      }}
                      className="absolute top-2.5 right-2.5 px-2.5 py-1.5 rounded-xl bg-black/75 hover:bg-black text-white text-xs flex items-center gap-1.5 shadow-md border border-white/20 active:scale-95 transition-transform"
                    >
                      {isMediaMuted ? (
                        <>
                          <VolumeX className="w-3.5 h-3.5 text-amber-300" />
                          <span className="text-[10px] font-bold text-amber-200">Tap for Sound</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-[10px] font-bold text-emerald-200">Sound ON</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {activeQuestion.mediaType === 'AUDIO' && mediaSource && (
                  <div className="p-5 rounded-2xl bg-[#F8F9FE] border border-purple-200/80 flex flex-col items-center justify-center space-y-4 relative text-center shadow-sm">
                    {/* Speaker Header Icon */}
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
                      (isAudioPlaying || mediaSubState.isPlaying)
                        ? 'bg-[#583FA9] text-white shadow-lg shadow-purple-950/20 scale-105 ring-4 ring-purple-200'
                        : 'bg-purple-100 text-purple-600'
                    }`}>
                      <Volume2 className="w-7 h-7" />
                    </div>

                    {/* Equalizer Soundwave Animation */}
                    <div className="flex items-end justify-center gap-1.5 h-10 w-full max-w-[220px] px-2">
                      {[40, 70, 95, 55, 85, 100, 75, 50, 90, 80, 60, 45].map((h, i) => (
                        <div
                          key={i}
                          style={{
                            height: (isAudioPlaying || mediaSubState.isPlaying) ? `${h}%` : '20%',
                            animationDelay: `${(i % 4) * 0.15}s`,
                            animationDuration: `${0.7 + (i % 3) * 0.2}s`
                          }}
                          className={`w-2 rounded-full transition-all duration-300 ${
                            (isAudioPlaying || mediaSubState.isPlaying)
                              ? 'bg-gradient-to-t from-[#583FA9] to-rose-500 soundwave-bar'
                              : 'bg-slate-200'
                          }`}
                        />
                      ))}
                    </div>

                    {/* BIG DECREASING AUDIO COUNTDOWN TIMER */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-center gap-2 text-[#1A103C] font-mono-numbers font-black text-3xl">
                        <Clock className={`w-6 h-6 ${(isAudioPlaying || mediaSubState.isPlaying) ? 'text-rose-600 animate-spin-slow' : 'text-slate-400'}`} />
                        <span className={audioRemaining <= 5 && (isAudioPlaying || mediaSubState.isPlaying) ? 'text-rose-600 animate-pulse' : 'text-[#1A103C]'}>
                          {formatAudioTime(audioRemaining)}
                        </span>
                        <span className="text-[10px] uppercase font-sans tracking-widest text-slate-500 font-extrabold ml-1">
                          REMAINING
                        </span>
                      </div>
                      <div className="text-[11px] font-bold text-slate-500 font-mono-numbers flex items-center justify-center gap-2">
                        <span>Elapsed: {formatAudioTime(audioCurrentTime)}</span>
                        <span>•</span>
                        <span>Total: {formatAudioTime(audioDuration || 0)}</span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full max-w-xs bg-slate-200/80 h-2 rounded-full overflow-hidden relative">
                      <div
                        className="h-full bg-gradient-to-r from-[#583FA9] to-rose-500 rounded-full transition-all duration-150"
                        style={{ width: `${audioPercent}%` }}
                      />
                    </div>

                    <audio
                      ref={mediaRef}
                      key={mediaSource.url}
                      src={mediaSource.url}
                      controls={false}
                      preload="auto"
                      muted={isMediaMuted}
                      onLoadedMetadata={(e) => {
                        const d = e.target.duration;
                        if (d && !isNaN(d)) setAudioDuration(d);
                      }}
                      onTimeUpdate={(e) => {
                        setAudioCurrentTime(e.target.currentTime);
                        if (e.target.duration && !isNaN(e.target.duration)) {
                          setAudioDuration(e.target.duration);
                        }
                      }}
                      onPlay={() => setIsAudioPlaying(true)}
                      onPause={() => setIsAudioPlaying(false)}
                      onEnded={() => {
                        setIsAudioPlaying(false);
                        setAudioCurrentTime(audioDuration);
                      }}
                    />

                    <div>
                      <span className="text-xs font-bold text-purple-900 uppercase tracking-wider block">
                        {(isAudioPlaying || mediaSubState.isPlaying) ? 'Audio Clue Playing on Stage' : 'Audio Clue Ready'}
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        const newMuted = !isMediaMuted;
                        setIsMediaMuted(newMuted);
                        if (mediaRef.current) {
                          mediaRef.current.muted = newMuted;
                          if (!newMuted && (isAudioPlaying || mediaSubState.isPlaying)) {
                            mediaRef.current.play().catch(() => {});
                          }
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-[#583FA9] hover:bg-[#4a3294] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform"
                    >
                      {isMediaMuted ? (
                        <>
                          <VolumeX className="w-3.5 h-3.5 text-purple-200" />
                          <span>Tap to Enable Sound on Phone</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3.5 h-3.5 text-emerald-300" />
                          <span>Sound ON (Tap to Mute)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {activeQuestion.mediaType === 'IMAGE' && mediaSource && (
                  <div className="rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 flex items-center justify-center max-h-56">
                    <img
                      src={mediaSource.url}
                      alt="Visual clue"
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}

                {/* Question Prompt (When Revealed by Admin) */}
                {questionSubState.isQuestionVisible ? (
                  <div className="space-y-3 pt-2">
                    <div className="p-3.5 rounded-2xl bg-[#ECE8F9]/50 border border-purple-200 text-left">
                      <h4 className="text-[11px] font-bold text-purple-900 uppercase tracking-wider mb-1">
                        Question Prompt:
                      </h4>
                      <p className="text-sm font-extrabold text-[#1A103C] leading-snug">
                        {activeQuestion.questionText}
                      </p>
                    </div>

                    {/* Options Revealed on Screen */}
                    {activeQuestion.options && activeQuestion.options.length > 0 && (
                      <div className="grid grid-cols-1 gap-2">
                        {activeQuestion.options.map((opt, idx) => {
                          const isRevealed = questionSubState.areAllOptionsVisible || questionSubState.revealedOptions?.includes(idx);
                          return (
                            <div
                              key={idx}
                              className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2.5 transition-all ${
                                isRevealed
                                  ? 'bg-slate-50 border-purple-200 text-slate-800'
                                  : 'bg-slate-50/50 border-dashed border-slate-200 text-slate-400 opacity-60'
                              }`}
                            >
                              <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                                isRevealed
                                  ? 'bg-[#583FA9] text-white shadow-sm'
                                  : 'bg-slate-200 text-slate-400'
                              }`}>
                                {opt.label || String.fromCharCode(65 + idx)}
                              </span>
                              <span className="truncate">
                                {isRevealed ? opt.text : '••••••••••••'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                    🎬 Media clue playing on stage. The question prompt will be revealed shortly.
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 rounded-3xl bg-white border border-purple-100 text-center space-y-3 shadow-md">
                <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto">
                  <Tv className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-sm text-[#1A103C]">Round 2: Audio-Visual</h4>
                <p className="text-xs text-slate-500">
                  Waiting for Quizmaster to present the next AV question on stage...
                </p>
              </div>
            )}

            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-center text-xs text-amber-800 font-semibold">
              ⚡ Buzzers are locked in Round 2. Teams answer when their turn is called.
            </div>
          </div>
        ) : activeStage === 'ROUND_RAPID_FIRE' ? (
          <div className="max-w-sm w-full mx-auto p-7 rounded-3xl bg-white border border-purple-100 text-center space-y-4 shadow-xl animate-pop">
            <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100">
              <Flame className="w-8 h-8" />
            </div>
            <div>
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 uppercase tracking-wider inline-block mb-2">
                Round 3: Rapid Fire
              </span>
              <h3 className="text-xl font-black text-[#1A103C] font-heading">60-Second Hot Seat</h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Teams take turns in the hot seat answering rapid questions directly with the Quizmaster.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 font-medium">
              ⚡ Buzzer is locked during rapid fire
            </div>
          </div>
        ) : activeStage === 'WELCOME' ? (
          <div className="max-w-sm w-full mx-auto p-7 rounded-3xl bg-white border border-purple-100 text-center space-y-4 shadow-xl animate-pop">
            <div className="w-16 h-16 rounded-2xl bg-[#ECE8F9] text-[#583FA9] flex items-center justify-center mx-auto border border-purple-200">
              <Sparkles className="w-8 h-8" />
            </div>
            <div>
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-[#ECE8F9] text-[#583FA9] uppercase tracking-wider inline-block mb-2">
                LearnUp Stage
              </span>
              <h3 className="text-xl font-black text-[#1A103C] font-heading">Welcome to the Challenge</h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Keep your phone connected. The Quizmaster will start Round 1 shortly!
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Status Prompt */}
            <div className="mb-8 text-center space-y-1">
              {buzzerState === 'WAITING' && (
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center justify-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  Waiting for Host Countdown...
                </div>
              )}
              {buzzerState === 'COUNTDOWN' && (
                <div className="text-sm font-extrabold text-amber-600 uppercase tracking-widest animate-pulse">
                  GET READY TO BUZZ IN: {countdownNum}
                </div>
              )}
              {buzzerState === 'UNLOCKED' && (
                <div className="text-sm font-black text-rose-600 uppercase tracking-widest animate-bounce">
                  ⚡ TAP BUZZER NOW! ⚡
                </div>
              )}
              {buzzerState === 'YOU_BUZZED' && (
                <div className="text-sm font-black text-emerald-600 uppercase tracking-widest">
                  🎉 YOU WON THE BUZZER! SPEAK NOW!
                </div>
              )}
              {buzzerState === 'LOCKED_OTHER' && (
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  LOCKED OUT — {buzzerWinner?.teamName || 'Another Team'} Buzzed First
                </div>
              )}
            </div>

            {/* GIANT REACTIVE BUZZER BUTTON */}
            <div className="relative">
              {/* Animated Background Ring */}
              {buzzerState === 'UNLOCKED' && (
                <div className="absolute -inset-4 rounded-full bg-rose-500/25 blur-xl animate-pulse pointer-events-none" />
              )}
              {buzzerState === 'YOU_BUZZED' && (
                <div className="absolute -inset-4 rounded-full bg-emerald-500/30 blur-xl animate-pulse pointer-events-none" />
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
                    ? 'bg-slate-200 text-slate-400 border-4 border-slate-300 cursor-not-allowed'
                    : buzzerState === 'COUNTDOWN'
                    ? 'bg-gradient-to-b from-amber-500 to-amber-600 text-white shadow-amber-500/40 animate-pulse cursor-wait'
                    : 'bg-slate-100 text-slate-400 border-4 border-slate-200 shadow-inner cursor-not-allowed'
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
                    <XCircle className="w-10 h-10 mb-2 text-slate-400" />
                    <span className="tracking-wider text-lg">LOCKED</span>
                    <span className="text-[11px] font-semibold text-slate-500 mt-1 px-4 text-center truncate max-w-[200px]">
                      {buzzerWinner?.teamName}
                    </span>
                  </>
                )}

                {buzzerState === 'COUNTDOWN' && (
                  <>
                    <span className="text-6xl font-mono-numbers font-bold text-white">
                      {countdownNum || '...'}
                    </span>
                    <span className="text-xs text-amber-100 mt-2 uppercase tracking-widest font-sans">
                      Get Ready
                    </span>
                  </>
                )}

                {buzzerState === 'WAITING' && (
                  <>
                    <Lock className="w-10 h-10 mb-2 text-slate-400" />
                    <span className="tracking-wider text-xl font-bold text-slate-600">LOCKED</span>
                    <span className="text-[11px] font-medium text-slate-400 mt-1">
                      Wait for Question
                    </span>
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </main>

      {/* Footer Banner */}
      <footer className="p-3 rounded-2xl bg-white border border-purple-100 text-center text-xs text-slate-500 shadow-sm">
        <p className="flex items-center justify-center gap-2 font-medium">
          <img src="/tv.png" alt="Logo" className="w-3.5 h-3.5 object-contain" />
          <span>Keep this browser tab open • LearnUp Stage Connected</span>
        </p>
      </footer>
    </div>
  );
}
