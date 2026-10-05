import React, { useState, useEffect, useRef } from 'react';
import {
  Zap,
  Clock,
  Trophy,
  Volume2,
  VolumeX,
  Maximize2,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Award,
  CheckCircle,
  XCircle,
  AlertCircle,
  Coffee,
  Moon,
  Flame,
  Radio
} from 'lucide-react';
import { socket } from '../lib/socket';
import soundEngine, {
  initAudio,
  playCountdownBeep,
  playBuzzerStrike,
  playCorrect,
  playWrong,
  playTick,
  playTimesUp,
  playFanfare
} from '../lib/soundEngine';
import { triggerConfetti } from '../lib/confetti';

import QRCode from 'qrcode';
import { apiFetch } from '../lib/config';

function statsFromServer(stats) {
  return {
    correct: stats?.correct || 0,
    wrong: stats?.wrong || 0,
    pass: stats?.passed ?? stats?.pass ?? 0,
    total: stats?.total ?? stats?.totalAsked ?? 0
  };
}

/**
 * Address phones should open. If the projector page itself was opened on
 * localhost, swap in the laptop's LAN IP reported by the backend.
 */
function buildJoinUrl(lanAddresses = []) {
  const { protocol, hostname, port } = window.location;
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(hostname);
  const host = isLocal && lanAddresses.length > 0 ? lanAddresses[0] : hostname;
  return `${protocol}//${host}${port ? `:${port}` : ''}/buzzer`;
}

export default function ProjectorView() {
  const [hasStartedAudio, setHasStartedAudio] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Core Stage State
  const [currentStage, setCurrentStage] = useState('WELCOME');
  const [breakConfig, setBreakConfig] = useState({
    type: 'INTERMISSION',
    message: 'Short Intermission',
    durationMinutes: 15,
    startedAt: null
  });

  const [activeQuestion, setActiveQuestion] = useState(null);
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

  // Countdown & Buzzer Overlay State
  const [countdownNum, setCountdownNum] = useState(null);
  const [showCountdownOverlay, setShowCountdownOverlay] = useState(false);
  const [buzzerWinnerBanner, setBuzzerWinnerBanner] = useState(null);
  const [evaluationBanner, setEvaluationBanner] = useState(null);
  const [isShaking, setIsShaking] = useState(false);

  // Teams & Leaderboard
  const [teams, setTeams] = useState([]);
  const [activeTeamId, setActiveTeamId] = useState(null);

  // Rapid Fire State
  const [rapidFireState, setRapidFireState] = useState({
    isActive: false,
    secondsRemaining: 60,
    stats: { correct: 0, wrong: 0, pass: 0 }
  });
  const [rapidFireSummary, setRapidFireSummary] = useState(null);

  // Media Player Ref for AV Round
  const mediaRef = useRef(null);

  // Score banner auto-hides so it never lingers into the next screen
  const evaluationBannerTimer = useRef(null);
  const clearBanners = () => {
    clearTimeout(evaluationBannerTimer.current);
    setBuzzerWinnerBanner(null);
    setEvaluationBanner(null);
  };

  // Final ceremony (set by winner:celebration; detects a tie for first)
  const [ceremony, setCeremony] = useState(null);

  // Join QR code for team phones on the welcome screen
  const [joinUrl, setJoinUrl] = useState('');
  const [joinQr, setJoinQr] = useState('');

  // Hide the mouse cursor after 3s of inactivity (stage mode)
  const [isCursorHidden, setIsCursorHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/health')
      .then(({ json }) => {
        if (cancelled) return;
        const url = buildJoinUrl(json?.data?.lanAddresses);
        setJoinUrl(url);
        return QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#1E143D', light: '#FFFFFF' } });
      })
      .then((dataUrl) => {
        if (!cancelled && dataUrl) setJoinQr(dataUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let timer = null;
    const wake = () => {
      setIsCursorHidden(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIsCursorHidden(true), 3000);
    };
    wake();
    window.addEventListener('mousemove', wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', wake);
    };
  }, []);

  // Initial Fetch & Socket Listeners
  useEffect(() => {
    // 1. Join room:projector
    function onConnect() {
      socket.emit('join:room', { role: 'projector' });
    }

    if (socket.connected) {
      onConnect();
    }
    socket.on('connect', onConnect);

    // 2. Full State Rehydration
    function onStateSync(data) {
      if (data?.state) {
        setCurrentStage(data.state.currentStage || 'WELCOME');
        if (data.state.breakConfig) setBreakConfig(data.state.breakConfig);
        if (data.state.questionSubState) setQuestionSubState(data.state.questionSubState);
        setQuestionIndex(data.state.currentQuestionIndex || 0);
        setActiveTeamId(data.state.activeTeamId || null);
        if (data.state.currentStage !== 'FINAL_WINNER') setCeremony(null);
      }
      if (data && 'activeQuestion' in data) {
        setActiveQuestion(data.activeQuestion || null);
      }
      if (data?.rapidFire) {
        setRapidFireState({
          isActive: Boolean(data.rapidFire.isActive),
          secondsRemaining: data.rapidFire.timerSecondsRemaining ?? 60,
          stats: statsFromServer({
            correct: data.rapidFire.correctAnswersCount,
            wrong: data.rapidFire.wrongAnswersCount,
            passed: data.rapidFire.passedAnswersCount,
            total: data.rapidFire.totalQuestionsAsked
          })
        });
      }
      if (data?.teams) {
        setTeams(data.teams);
      }
    }

    // 3. Stage Updates
    function onStageUpdated(data) {
      setCurrentStage(data.stage);
      clearBanners();
      setShowCountdownOverlay(false);
      if (data.stage !== 'FINAL_WINNER') setCeremony(null);
      if (data.state?.breakConfig) setBreakConfig(data.state.breakConfig);
    }

    // Final ceremony: fanfare for a champion, or a sudden-death call on a tie
    function onWinnerCelebration(data) {
      setCeremony(data);
      if (data?.standings) setTeams(data.standings);
      if (!data?.isTie) {
        playFanfare();
        triggerConfetti({ durationMs: 8000, particleCount: 200 });
      }
    }

    function onTurnUpdated(data) {
      setActiveTeamId(data.activeTeamId || null);
    }

    function onQuestionShown(data) {
      if (data?.questionSubState) setQuestionSubState(data.questionSubState);
    }

    // 4. Break Screen
    function onBreakStarted(config) {
      setBreakConfig(config);
      setCurrentStage('BREAK');
    }

    // 5. Question Presentation
    function onQuestionPresented(data) {
      setActiveQuestion(data.question);
      setQuestionIndex(data.questionIndex || 0);
      setQuestionSubState(data.questionSubState || {
        isQuestionVisible: true,
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
      clearBanners();
      setShowCountdownOverlay(false);
    }

    function onBuzzerReset() {
      setBuzzerWinnerBanner(null);
      setQuestionSubState((prev) => ({ ...prev, buzzerLockedBy: null }));
    }

    // 6. Option Reveal
    function onOptionsUpdated(data) {
      setQuestionSubState((prev) => ({
        ...prev,
        revealedOptions: data.revealedIndices || [],
        areAllOptionsVisible: Boolean(data.allRevealed)
      }));
    }

    // 7. 3-2-1 Countdown
    function onCountdownTick(data) {
      setShowCountdownOverlay(true);
      setCountdownNum(data.count === 0 ? 'GO!' : data.count);
      playCountdownBeep(data.count);

      if (data.count === 0) {
        setTimeout(() => {
          setShowCountdownOverlay(false);
        }, 800);
      }
    }

    // 8. Buzzer Winner Strike
    function onBuzzerWinner(winner) {
      setBuzzerWinnerBanner(winner);
      playBuzzerStrike();
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);

      setQuestionSubState((prev) => ({
        ...prev,
        isBuzzerOpen: false,
        buzzerLockedBy: winner
      }));
    }

    // 9. Answer Locked (Admin selects spoken answer)
    function onAnswerLocked(data) {
      setQuestionSubState((prev) => ({
        ...prev,
        selectedOptionIndex: data.selectedOptionIndex,
        isAnswerLocked: true
      }));
    }

    // 10. Answer Evaluated
    function onAnswerEvaluated(data) {
      setQuestionSubState((prev) => ({
        ...prev,
        isEvaluated: true,
        isCorrect: data.isCorrect
      }));
      // The answer key is only sent to the stage once the question is evaluated
      setActiveQuestion((prev) => (prev ? { ...prev, correctOptionIndex: data.correctOptionIndex } : prev));

      setBuzzerWinnerBanner(null);
      setEvaluationBanner(data);
      clearTimeout(evaluationBannerTimer.current);
      evaluationBannerTimer.current = setTimeout(() => setEvaluationBanner(null), 6000);

      if (data.isCorrect) {
        playCorrect();
        triggerConfetti({ durationMs: 2500, particleCount: 70 });
      } else {
        playWrong();
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
      }

      if (data.teams) {
        setTeams(data.teams);
      }
    }

    // 11. Media Remote Sync (AV Round)
    function onMediaSync(data) {
      if (!mediaRef.current) return;
      if (data.action === 'play') {
        mediaRef.current.play().catch(() => {});
      } else if (data.action === 'pause') {
        mediaRef.current.pause();
      } else if (data.action === 'replay') {
        mediaRef.current.currentTime = 0;
        mediaRef.current.play().catch(() => {});
      } else if (data.action === 'seek' && data.time !== undefined) {
        mediaRef.current.currentTime = data.time;
      } else if (data.action === 'mute') {
        mediaRef.current.muted = true;
      } else if (data.action === 'unmute') {
        mediaRef.current.muted = false;
      }
    }

    // 12. Rapid Fire Events
    function onRapidFireStarted(data) {
      clearBanners();
      setRapidFireSummary(null);
      setActiveTeamId(data.teamId || null);
      setActiveQuestion(data.question || null);
      setRapidFireState({
        isActive: true,
        secondsRemaining: data.seconds || 60,
        stats: statsFromServer()
      });
    }

    function onRapidFireTick(data) {
      setRapidFireState((prev) => ({
        ...prev,
        secondsRemaining: data.secondsRemaining
      }));
      if (data.secondsRemaining <= 10 && data.secondsRemaining > 0) {
        playTick();
      }
    }

    function onRapidFireUpdate(data) {
      if (data.action === 'CORRECT') playCorrect();
      else if (data.action === 'WRONG') playWrong();

      setRapidFireState((prev) => ({
        ...prev,
        stats: statsFromServer(data.stats)
      }));
      if (data.nextQuestion) {
        setActiveQuestion(data.nextQuestion);
      }
      if (data.teams) {
        setTeams(data.teams);
      }
    }

    function onRapidFireTimesUp(data) {
      playTimesUp();
      setRapidFireState((prev) => ({ ...prev, isActive: false }));
      setRapidFireSummary({ ...statsFromServer(data.stats), reason: data.reason });
    }

    // 13. Leaderboard Update
    function onLeaderboardUpdate(updatedTeams) {
      setTeams(updatedTeams);
    }

    socket.on('state:sync', onStateSync);
    socket.on('stage:updated', onStageUpdated);
    socket.on('break:started', onBreakStarted);
    socket.on('question:presented', onQuestionPresented);
    socket.on('options:updated', onOptionsUpdated);
    socket.on('countdown:tick', onCountdownTick);
    socket.on('buzzer:winner', onBuzzerWinner);
    socket.on('winner:celebration', onWinnerCelebration);
    socket.on('buzzer:reset', onBuzzerReset);
    socket.on('turn:updated', onTurnUpdated);
    socket.on('question:shown', onQuestionShown);
    socket.on('answer:locked', onAnswerLocked);
    socket.on('answer:evaluated', onAnswerEvaluated);
    socket.on('media:sync', onMediaSync);
    socket.on('rapid-fire:started', onRapidFireStarted);
    socket.on('rapid-fire:tick', onRapidFireTick);
    socket.on('rapid-fire:update', onRapidFireUpdate);
    socket.on('rapid-fire:times-up', onRapidFireTimesUp);
    socket.on('leaderboard:update', onLeaderboardUpdate);

    return () => {
      socket.off('connect', onConnect);
      socket.off('state:sync', onStateSync);
      socket.off('stage:updated', onStageUpdated);
      socket.off('break:started', onBreakStarted);
      socket.off('question:presented', onQuestionPresented);
      socket.off('options:updated', onOptionsUpdated);
      socket.off('countdown:tick', onCountdownTick);
      socket.off('buzzer:winner', onBuzzerWinner);
      socket.off('winner:celebration', onWinnerCelebration);
      socket.off('buzzer:reset', onBuzzerReset);
      socket.off('turn:updated', onTurnUpdated);
      socket.off('question:shown', onQuestionShown);
      socket.off('answer:locked', onAnswerLocked);
      socket.off('answer:evaluated', onAnswerEvaluated);
      socket.off('media:sync', onMediaSync);
      socket.off('rapid-fire:started', onRapidFireStarted);
      socket.off('rapid-fire:tick', onRapidFireTick);
      socket.off('rapid-fire:update', onRapidFireUpdate);
      socket.off('rapid-fire:times-up', onRapidFireTimesUp);
      socket.off('leaderboard:update', onLeaderboardUpdate);
    };
  }, []);

  // Enter Fullscreen & Unlock Audio
  const handleEnterStageMode = () => {
    initAudio();
    setHasStartedAudio(true);

    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    }
  };

  // Find Leader Team
  const leaderTeam = teams && teams.length > 0 ? teams[0] : null;
  const hasLeader = Boolean(leaderTeam && leaderTeam.score > 0 && leaderTeam.score > (teams[1]?.score ?? -Infinity));

  return (
    <div
      className={`min-h-screen w-full bg-[#160D2E] text-slate-100 flex flex-col justify-between overflow-hidden relative select-none ${
        isShaking ? 'animate-shake' : ''
      } ${isCursorHidden && hasStartedAudio ? 'cursor-none' : ''}`}
    >
      {/* BACKGROUND AMBIENT GLOWS */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[600px] h-[600px] bg-[#583FA9]/25 rounded-full blur-[140px]" />
        <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] bg-[#7C3AED]/20 rounded-full blur-[140px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-[#3F2B7B]/15 rounded-full blur-[160px]" />
      </div>

      {/* FULLSCREEN AUDIO UNLOCK MODAL (First Page Load) */}
      {!hasStartedAudio && (
        <div className="fixed inset-0 z-50 bg-[#0e0720]/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-lg space-y-6">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-[#583FA9] to-[#8B5CF6] flex items-center justify-center mx-auto shadow-2xl shadow-[#583FA9]/50 animate-pulse">
              <Sparkles className="w-12 h-12 text-white" />
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl font-extrabold text-white font-heading tracking-tight">
                Audience Projector Stage
              </h2>
              <p className="text-sm text-[#E0D7FE]">
                Click below to initialize stage mode, enable fullscreen, and unlock the Web Audio API sound synthesizer.
              </p>
            </div>

            <button
              onClick={handleEnterStageMode}
              className="px-8 py-4 rounded-2xl bg-gradient-to-r from-[#583FA9] to-[#7C3AED] hover:from-[#654abf] hover:to-[#8b5cf6] text-white font-bold text-lg shadow-xl shadow-[#583FA9]/40 flex items-center justify-center gap-3 mx-auto transition-all transform hover:scale-105"
            >
              <Maximize2 className="w-5 h-5" />
              Enter Fullscreen Stage Mode
            </button>
          </div>
        </div>
      )}

      {/* 3-2-1 COUNTDOWN FULLSCREEN OVERLAY */}
      {showCountdownOverlay && (
        <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center">
          <div className="relative flex items-center justify-center">
            <div className="w-72 h-72 rounded-full border-8 border-amber-400/40 animate-ping absolute" />
            <div className="w-64 h-64 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center shadow-2xl shadow-amber-500/60 animate-pop">
              <span className="text-8xl font-black text-black font-mono-numbers tracking-tight">
                {countdownNum}
              </span>
            </div>
          </div>
          <div className="mt-8 text-2xl font-bold tracking-widest text-amber-300 uppercase animate-pulse">
            Get Ready to Buzz!
          </div>
        </div>
      )}

      {/* BUZZER WINNER BANNER OVERLAY */}
      {buzzerWinnerBanner && (
        <div className="fixed top-8 inset-x-8 z-30 animate-pop">
          <div className="bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 rounded-3xl p-6 shadow-2xl shadow-rose-600/50 border-2 border-white/30 text-white flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-3xl font-extrabold">
                🚨
              </div>
              <div>
                <span className="text-xs uppercase tracking-widest font-bold text-rose-100 block">
                  Buzzer Winner Lockout
                </span>
                <h3 className="text-3xl sm:text-4xl font-black font-heading tracking-tight">
                  {buzzerWinnerBanner.teamName.toUpperCase()} WILL ANSWER!
                </h3>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-black/30 backdrop-blur-md text-sm font-semibold">
              <Radio className="w-4 h-4 text-emerald-300 animate-pulse" />
              <span>Microphone Open</span>
            </div>
          </div>
        </div>
      )}

      {/* EVALUATION POPUP OVERLAY */}
      {evaluationBanner && (
        <div className="fixed bottom-12 inset-x-12 z-30 animate-pop">
          <div
            className={`rounded-3xl p-6 shadow-2xl text-white flex items-center justify-between border-2 ${
              evaluationBanner.isCorrect
                ? 'bg-gradient-to-r from-emerald-600 to-teal-500 border-emerald-300/40 shadow-emerald-500/50 glow-mint'
                : 'bg-gradient-to-r from-rose-700 to-red-600 border-rose-400/40 shadow-rose-600/50 glow-rose'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-3xl">
                {evaluationBanner.isCorrect ? '✅' : '❌'}
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-widest opacity-90">
                  {evaluationBanner.isCorrect ? 'Correct Answer!' : 'Incorrect Answer'}
                </span>
                <h4 className="text-2xl sm:text-3xl font-bold font-heading">
                  {evaluationBanner.isCorrect
                    ? `+${evaluationBanner.pointsAwarded} Points Awarded to ${evaluationBanner.teamName || 'Team'}`
                    : evaluationBanner.pointsAwarded < 0
                    ? `${evaluationBanner.pointsAwarded} Penalty for ${evaluationBanner.teamName || 'Team'}`
                    : `No points for ${evaluationBanner.teamName || 'Team'}`}
                </h4>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs opacity-80 block">No Reopen Policy</span>
              <span className="text-sm font-bold">Next Question Incoming</span>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 1. TOP STAGE HEADER BAR                                        */}
      {/* ------------------------------------------------------------- */}
      <header className="relative z-10 px-8 py-5 flex items-center justify-between border-b border-white/10 bg-[#160D2E]/80 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#583FA9] to-[#8B5CF6] flex items-center justify-center shadow-lg shadow-[#583FA9]/40 font-bold text-xl text-white font-heading">
            L
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white font-heading">
              LearnUp Quiz Arena
            </h1>
            <p className="text-xs text-[#E0D7FE]">
              Annual Live Stage Championship 2026
            </p>
          </div>
        </div>

        {/* Center: Stage Pill */}
        <div className="flex items-center gap-3">
          <span className="px-4 py-1.5 rounded-full bg-[#ECE8F9]/10 text-[#ECE8F9] border border-white/20 text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {currentStage.replace(/_/g, ' ')}
          </span>
        </div>

        {/* Right: Clock & Leaderboard Snapshot */}
        <div className="flex items-center gap-4 text-xs font-medium">
          {hasLeader && (
            <div className="px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Leader: <strong>{leaderTeam.teamName}</strong> ({leaderTeam.score} pts)</span>
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300">
            <Clock className="w-3.5 h-3.5 text-rose-400" />
            <span className="font-mono-numbers">LIVE BROADCAST</span>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------- */}
      {/* 2. DYNAMIC STAGE VIEWS                                         */}
      {/* ------------------------------------------------------------- */}
      <main className="relative z-10 flex-1 flex flex-col justify-center px-8 py-6 max-w-7xl w-full mx-auto">
        {/* ============================================================= */}
        {/* STAGE: WELCOME & LANDING                                      */}
        {/* ============================================================= */}
        {currentStage === 'WELCOME' && (
          // Keyed on the QR so the block remounts when it loads: content added
          // into the finished pop animation was observed not to repaint
          <div key={joinQr ? 'welcome-qr' : 'welcome'} className="text-center space-y-8 my-auto animate-pop">
            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 text-sm font-bold uppercase tracking-wider glow-mint">
              <Sparkles className="w-4 h-4" />
              Ready to Kickoff
            </div>

            <div className="space-y-4 max-w-3xl mx-auto">
              <h2 className="text-5xl sm:text-7xl font-black text-white font-heading tracking-tight leading-none">
                LearnUp Live Quiz Championship
              </h2>
              <p className="text-xl sm:text-2xl text-[#E0D7FE] font-normal leading-relaxed">
                The grand stage battle between the finest minds. 
                <br />
                Buzzer Battle • Audio-Visual Challenge • Rapid Fire
              </p>
            </div>

            {/* Join QR Code for team phones */}
            {joinQr && (
              <div className="flex w-fit mx-auto items-center gap-6 p-5 rounded-3xl bg-[#1E143D] border border-white/15 text-left shadow-xl">
                <img src={joinQr} alt="Scan to open the team buzzer" className="w-36 h-36 rounded-2xl bg-white p-1" />
                <div className="space-y-1">
                  <span className="text-xs uppercase tracking-widest text-[#10B981] font-bold block">Teams: scan to join</span>
                  <span className="text-2xl font-bold text-white font-mono break-all">{joinUrl.replace(/^https?:\/\//, '')}</span>
                  <span className="text-sm text-slate-400 block">Log in with your team number and PIN</span>
                </div>
              </div>
            )}

            {/* Team Roster Badges */}
            <div className="pt-6 border-t border-white/10 max-w-4xl mx-auto">
              <span className="text-xs uppercase tracking-widest text-slate-400 font-bold block mb-4">
                Competing Stage Teams
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                {teams.map((t) => (
                  <div
                    key={t._id || t.id}
                    className="p-3 rounded-2xl glass-panel text-center space-y-1 border border-white/10"
                  >
                    <div className="w-8 h-8 rounded-xl bg-[#583FA9] text-white font-bold flex items-center justify-center mx-auto text-xs">
                      #{t.teamNumber}
                    </div>
                    <div className="text-xs font-bold text-white truncate">{t.teamName}</div>
                    <div className="text-[10px] text-amber-300 font-mono-numbers">{t.score} pts</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* STAGE: DYNAMIC BREAK SCREENS                                  */}
        {/* ============================================================= */}
        {currentStage === 'BREAK' && (
          <div className="text-center space-y-8 my-auto animate-pop">
            {breakConfig.type === 'PRAYER' && (
              <div className="max-w-2xl mx-auto p-12 rounded-3xl bg-gradient-to-b from-[#064e3b]/80 to-[#160D2E]/90 border border-emerald-500/30 shadow-2xl shadow-emerald-500/20 space-y-6">
                <div className="w-20 h-20 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-400/30">
                  <Moon className="w-10 h-10" />
                </div>
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-emerald-300">
                    Sacred Intermission
                  </span>
                  <h2 className="text-4xl font-extrabold text-white font-heading">Prayer Break</h2>
                  <p className="text-base text-emerald-100">{breakConfig.message}</p>
                </div>
                <div className="pt-4 border-t border-emerald-500/20 text-2xl font-mono-numbers font-bold text-emerald-300">
                  Resuming in {breakConfig.durationMinutes} Minutes
                </div>
              </div>
            )}

            {breakConfig.type === 'LUNCH' && (
              <div className="max-w-2xl mx-auto p-12 rounded-3xl bg-gradient-to-b from-[#78350f]/80 to-[#160D2E]/90 border border-amber-500/30 shadow-2xl shadow-amber-500/20 space-y-6">
                <div className="w-20 h-20 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto border border-amber-400/30">
                  <Coffee className="w-10 h-10" />
                </div>
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-amber-300">
                    Hospitality & Refreshment
                  </span>
                  <h2 className="text-4xl font-extrabold text-white font-heading">
                    Lunch & Refreshment Intermission
                  </h2>
                  <p className="text-base text-amber-100">{breakConfig.message}</p>
                </div>
                <div className="pt-4 border-t border-amber-500/20 text-2xl font-mono-numbers font-bold text-amber-300">
                  Resuming in {breakConfig.durationMinutes} Minutes
                </div>
              </div>
            )}

            {breakConfig.type !== 'PRAYER' && breakConfig.type !== 'LUNCH' && (
              <div className="max-w-2xl mx-auto p-12 rounded-3xl glass-panel border border-white/20 shadow-2xl space-y-6">
                <div className="w-20 h-20 rounded-full bg-[#583FA9]/30 text-[#E0D7FE] flex items-center justify-center mx-auto border border-white/20">
                  <Sparkles className="w-10 h-10" />
                </div>
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-[#E0D7FE]">
                    Event Intermission
                  </span>
                  <h2 className="text-4xl font-extrabold text-white font-heading">
                    Short Intermission
                  </h2>
                  <p className="text-base text-slate-300">{breakConfig.message}</p>
                </div>
                <div className="pt-4 border-t border-white/10 text-2xl font-mono-numbers font-bold text-[#E0D7FE]">
                  Standby — Returning Shortly
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================= */}
        {/* STAGE: ROUND 1 — BUZZER BATTLE QUESTION CARD                   */}
        {/* ============================================================= */}
        {currentStage === 'ROUND_BUZZER' && activeQuestion && (
          <div className="space-y-6 my-auto animate-pop">
            {/* Outer LearnUp Enclosure Card */}
            <div className="learnup-card-outer">
              <div className="glass-card-stage p-8 rounded-3xl space-y-6">
                {/* Header Bar */}
                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 rounded-xl bg-[#583FA9] text-white font-bold text-xs uppercase tracking-wider">
                      Round 1: Buzzer Battle
                    </span>
                    <span className="text-sm font-semibold text-[#E0D7FE]">
                      Question #{questionIndex + 1}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full bg-[#D1FAE5] text-[#059669] text-xs font-bold tracking-wider flex items-center gap-1.5 shadow-sm">
                      <span className="w-2 h-2 rounded-full bg-[#059669] animate-pulse" />
                      LIVE
                    </span>
                  </div>
                </div>

                {/* Question Prompt Container */}
                <div className="p-6 sm:p-8 rounded-2xl bg-white/5 border-2 border-[#583FA9]/30 shadow-inner">
                  <h2 className="projector-question-text font-bold text-white font-heading">
                    {activeQuestion.questionText}
                  </h2>
                </div>

                {/* 2x2 Option Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {activeQuestion.options?.map((opt, idx) => {
                    const isRevealed =
                      questionSubState.areAllOptionsVisible ||
                      questionSubState.revealedOptions?.includes(idx);
                    const isSelected = questionSubState.selectedOptionIndex === idx;
                    const isCorrectOption = activeQuestion.correctOptionIndex === idx;
                    const isEvaluated = questionSubState.isEvaluated;

                    return (
                      <div
                        key={idx}
                        className={`p-5 rounded-2xl border-2 transition-all duration-300 flex items-center gap-4 ${
                          !isRevealed
                            ? 'opacity-20 border-white/5 bg-white/5'
                            : isEvaluated
                            ? isCorrectOption
                              ? 'bg-emerald-600/30 border-emerald-400 text-emerald-100 glow-mint transform scale-[1.02]'
                              : isSelected
                              ? 'bg-rose-600/30 border-rose-500 text-rose-100 glow-rose'
                              : 'bg-white/5 border-white/10 text-slate-400'
                            : isSelected
                            ? 'bg-amber-500/20 border-amber-400 text-amber-200 animate-pulse-border transform scale-[1.02]'
                            : 'bg-white/5 border-white/15 hover:border-white/30 text-white'
                        }`}
                      >
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${
                            isEvaluated && isCorrectOption
                              ? 'bg-emerald-500 text-white'
                              : isSelected
                              ? 'bg-amber-400 text-black'
                              : 'bg-[#ECE8F9] text-[#1E143D]'
                          }`}
                        >
                          {opt.label}
                        </div>

                        <div className="flex-1">
                          <p className="projector-option-text font-semibold">
                            {isRevealed ? opt.text : '••••••••••••••••'}
                          </p>
                          {isSelected && !isEvaluated && (
                            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300 block mt-1">
                              Locked by Team
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* STAGE: ROUND 2 — AUDIO-VISUAL ROUND                           */}
        {/* ============================================================= */}
        {currentStage === 'ROUND_AV' && activeQuestion && (
          <div className="space-y-6 my-auto animate-pop">
            <div className="learnup-card-outer">
              <div className="glass-card-stage p-8 rounded-3xl space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 rounded-xl bg-[#0EA5E9] text-white font-bold text-xs uppercase tracking-wider">
                      Round 2: Audio-Visual Challenge
                    </span>
                    <span className="text-sm font-semibold text-[#E0D7FE]">
                      Question #{questionIndex + 1}
                    </span>
                  </div>

                  {activeTeamId && (
                    <div className="px-4 py-1.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold">
                      Active Turn: {teams.find((t) => String(t._id || t.id) === String(activeTeamId))?.teamName || 'Designated Team'}
                    </div>
                  )}
                </div>

                {/* Media Presentation Display */}
                {activeQuestion.mediaType === 'VIDEO' && activeQuestion.mediaUrl && (
                  <div
                    className={`rounded-2xl overflow-hidden bg-black aspect-video mx-auto border border-white/20 shadow-2xl relative transition-all duration-500 ${
                      questionSubState.isQuestionVisible ? 'max-h-[240px]' : 'max-h-[520px]'
                    }`}
                  >
                    <video
                      ref={mediaRef}
                      src={activeQuestion.mediaUrl}
                      controls={false}
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}

                {activeQuestion.mediaType === 'AUDIO' && activeQuestion.mediaUrl && (
                  <div className="p-8 rounded-2xl bg-black/40 border border-white/10 flex flex-col items-center justify-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-[#0EA5E9]/20 text-[#0EA5E9] flex items-center justify-center animate-pulse">
                      <Volume2 className="w-8 h-8" />
                    </div>
                    <span className="text-sm font-bold text-sky-200 uppercase tracking-widest">
                      Audio Clue Playback
                    </span>
                    <audio ref={mediaRef} src={activeQuestion.mediaUrl} controls={false} />
                  </div>
                )}

                {/* Question Text (hidden while the media plays) */}
                {questionSubState.isQuestionVisible ? (
                <>
                <div className="p-5 rounded-2xl bg-white/5 border border-white/15 animate-pop">
                  <h2 className="text-3xl xl:text-4xl leading-tight font-bold text-white font-heading">
                    {activeQuestion.questionText}
                  </h2>
                </div>

                {/* Options Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeQuestion.options?.map((opt, idx) => {
                    const isEvaluated = questionSubState.isEvaluated;
                    const isCorrect = activeQuestion.correctOptionIndex === idx;

                    return (
                      <div
                        key={idx}
                        className={`p-4 rounded-xl border flex items-center gap-4 ${
                          isEvaluated && isCorrect
                            ? 'bg-emerald-600/30 border-emerald-400 text-white glow-mint'
                            : 'bg-white/5 border-white/10 text-white'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-lg bg-[#ECE8F9] text-[#1E143D] font-bold flex items-center justify-center shrink-0">
                          {opt.label}
                        </div>
                        <span className="text-lg font-semibold">{opt.text}</span>
                      </div>
                    );
                  })}
                </div>
                </>
                ) : (
                  <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center text-sky-200 font-bold uppercase tracking-widest text-sm">
                    Watch &amp; listen closely — the question appears next
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* STAGE: ROUND 3 — RAPID FIRE ROUND                             */}
        {/* ============================================================= */}
        {currentStage === 'ROUND_RAPID_FIRE' && (
          <div className="space-y-8 my-auto animate-pop">
            {/* Rapid Fire Header & 60s Clock */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-6 rounded-3xl glass-panel border border-white/10">
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-widest text-rose-400 flex items-center gap-1.5">
                  <Flame className="w-4 h-4" />
                  Round 3: Rapid Fire Hot Seat
                </span>
                <h2 className="text-3xl font-extrabold text-white font-heading">
                  {teams.find((t) => String(t._id || t.id) === String(activeTeamId))?.teamName || 'Team on the Hot Seat'}
                </h2>
              </div>

              {/* 60-Second Radial Countdown Ring */}
              <div className="flex items-center gap-6">
                <div className="relative flex items-center justify-center w-28 h-28">
                  <svg className="w-full h-full -rotate-90">
                    <circle
                      cx="56"
                      cy="56"
                      r="46"
                      stroke="currentColor"
                      strokeWidth="8"
                      className="text-white/10"
                      fill="transparent"
                    />
                    <circle
                      cx="56"
                      cy="56"
                      r="46"
                      stroke="currentColor"
                      strokeWidth="8"
                      className={
                        rapidFireState.secondsRemaining <= 10
                          ? 'text-rose-500 transition-all duration-300'
                          : 'text-amber-400 transition-all duration-300'
                      }
                      fill="transparent"
                      strokeDasharray="289"
                      strokeDashoffset={289 - (289 * rapidFireState.secondsRemaining) / 60}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center font-mono-numbers">
                    <span className="text-3xl font-bold text-white">
                      {rapidFireState.secondsRemaining}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase">SEC</span>
                  </div>
                </div>

                {/* Score Stats */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <span className="text-xs text-emerald-400 font-bold block">Correct</span>
                    <span className="text-xl font-bold font-mono-numbers text-emerald-300">
                      {rapidFireState.stats.correct}
                    </span>
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                    <span className="text-xs text-rose-400 font-bold block">Wrong</span>
                    <span className="text-xl font-bold font-mono-numbers text-rose-300">
                      {rapidFireState.stats.wrong}
                    </span>
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-slate-500/10 border border-slate-500/20">
                    <span className="text-xs text-slate-400 font-bold block">Passed</span>
                    <span className="text-xl font-bold font-mono-numbers text-slate-300">
                      {rapidFireState.stats.pass}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Rapid Question Display or Summary Card */}
            {rapidFireSummary ? (
              <div className="p-10 rounded-3xl bg-gradient-to-b from-[#1E143D] to-[#160D2E] border-2 border-amber-400/40 shadow-2xl text-center space-y-6 animate-pop">
                <div className="w-20 h-20 rounded-full bg-amber-400/20 text-amber-300 flex items-center justify-center mx-auto text-3xl font-bold">
                  ⏱️
                </div>
                <div className="space-y-2">
                  <h3 className="text-4xl font-extrabold text-white font-heading">
                    {rapidFireSummary.reason === 'TIMES_UP' ? "TIME'S UP!" : 'SLOT ENDED'}
                  </h3>
                  <p className="text-slate-300">
                    {teams.find((t) => String(t._id || t.id) === String(activeTeamId))?.teamName || 'Team'} — Rapid Fire Slot Concluded
                  </p>
                </div>

                <div className="flex flex-wrap justify-center gap-4 pt-4 border-t border-white/10">
                  {[
                    ['Total Answered', rapidFireSummary.total, 'text-white'],
                    ['Correct', rapidFireSummary.correct, 'text-emerald-400'],
                    ['Wrong', rapidFireSummary.wrong, 'text-rose-400'],
                    ['Passed', rapidFireSummary.pass, 'text-slate-300']
                  ].map(([label, value, color]) => (
                    <div key={label} className="px-6 py-4 rounded-2xl bg-white/5 border border-white/10">
                      <span className="text-xs text-slate-400 uppercase">{label}</span>
                      <div className={`text-3xl font-bold font-mono-numbers ${color}`}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : activeQuestion ? (
              <div className="p-8 rounded-3xl bg-white/5 border-2 border-[#583FA9]/40 shadow-xl space-y-4">
                <span className="text-xs uppercase tracking-widest text-[#E0D7FE] font-bold">
                  Rapid Fire Question
                </span>
                <h3 className="projector-question-text font-bold text-white font-heading">
                  {activeQuestion.questionText}
                </h3>
              </div>
            ) : (
              <div className="p-12 text-center text-slate-400 glass-panel rounded-3xl">
                Waiting for Quizmaster to start Rapid Fire round...
              </div>
            )}
          </div>
        )}

        {/* ============================================================= */}
        {/* STAGE: LEADERBOARD                                            */}
        {/* ============================================================= */}
        {currentStage === 'LEADERBOARD' && (
          <div className="space-y-8 my-auto animate-pop">
            <div className="text-center space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-amber-400 flex items-center justify-center gap-2">
                <Trophy className="w-4 h-4" />
                Live Ranked Standings
              </span>
              <h2 className="text-4xl sm:text-5xl font-black text-white font-heading">
                Championship Leaderboard
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl mx-auto w-full">
              {teams.map((t, idx) => (
                <div
                  key={t._id || t.id}
                  className={`p-5 rounded-2xl flex items-center justify-between border transition-all duration-300 ${
                    idx === 0
                      ? 'bg-gradient-to-r from-amber-500/25 to-yellow-500/10 border-amber-400/50 glow-gold scale-[1.02]'
                      : idx === 1
                      ? 'bg-white/10 border-slate-300/40 text-slate-200'
                      : idx === 2
                      ? 'bg-amber-800/15 border-amber-700/40 text-amber-200'
                      : 'glass-panel border-white/10 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${
                        idx === 0
                          ? 'bg-amber-400 text-black shadow-lg shadow-amber-400/40 font-heading'
                          : 'bg-white/10 text-white'
                      }`}
                    >
                      {idx + 1}
                    </div>

                    <div>
                      <h4 className="text-lg font-bold text-white tracking-tight">{t.teamName}</h4>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                        <span>Buzzer: {t.roundScores?.buzzer || 0}</span>
                        <span>•</span>
                        <span>AV: {t.roundScores?.audioVisual || 0}</span>
                        <span>•</span>
                        <span>Rapid: {t.roundScores?.rapidFire || 0}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-3xl font-extrabold font-mono-numbers text-amber-300">
                      {t.score}
                    </span>
                    <span className="text-xs text-slate-400 block">PTS</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* STAGE: FINAL WINNER CELEBRATION                               */}
        {/* ============================================================= */}
        {currentStage === 'FINAL_WINNER' && ceremony?.isTie && (
          <div className="text-center space-y-8 my-auto animate-pop">
            <div className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-rose-500/20 text-rose-300 border border-rose-400/50 text-sm font-bold uppercase tracking-widest glow-rose">
              <Zap className="w-5 h-5" />
              It's a tie at the top!
            </div>
            <h2 className="text-5xl sm:text-7xl font-black text-white font-heading tracking-tight">
              SUDDEN DEATH
            </h2>
            <p className="text-2xl text-[#E0D7FE]">
              {ceremony.tiedTeams.map((t) => t.teamName).join('  vs  ')}
            </p>
            <p className="text-lg text-amber-200 font-mono-numbers">
              Tied on {ceremony.tiedTeams[0]?.score} points • One buzzer question decides the champion
            </p>
          </div>
        )}

        {currentStage === 'FINAL_WINNER' && !ceremony?.isTie && (
          <div className="text-center space-y-8 my-auto animate-pop">
            <div className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-gradient-to-r from-amber-500/30 to-yellow-500/20 text-amber-300 border border-amber-400/50 text-sm font-bold uppercase tracking-widest glow-gold animate-bounce">
              <Award className="w-5 h-5" />
              GRAND CHAMPIONS CROWNED
            </div>

            <div className="space-y-4">
              <div className="w-32 h-32 rounded-3xl bg-gradient-to-tr from-amber-400 via-yellow-300 to-amber-500 flex items-center justify-center mx-auto text-6xl shadow-2xl shadow-amber-400/50 animate-pop">
                🏆
              </div>

              <h2 className="text-5xl sm:text-7xl font-black text-white font-heading tracking-tight">
                {(ceremony?.champion || leaderTeam)?.teamName || 'CHAMPION TEAM'}
              </h2>

              <p className="text-2xl text-amber-200 font-mono-numbers">
                Winning Score: {(ceremony?.champion || leaderTeam)?.score || 0} Total Points
              </p>
            </div>

            <div className="pt-8 border-t border-white/10 max-w-xl mx-auto text-slate-300 text-sm">
              Thank you for participating in the LearnUp Live Quiz Championship!
            </div>
          </div>
        )}
      </main>

      {/* ------------------------------------------------------------- */}
      {/* 3. BOTTOM FOOTER BAR                                          */}
      {/* ------------------------------------------------------------- */}
      <footer className="relative z-10 px-8 py-4 border-t border-white/10 bg-[#160D2E]/80 backdrop-blur-md flex items-center justify-between text-xs text-slate-400">
        <div>
          LearnUp Live Stage Engine • High Contrast TV Presentation Mode
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (document.documentElement.requestFullscreen) {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen().catch(() => {});
                  setIsFullscreen(true);
                } else {
                  document.exitFullscreen().catch(() => {});
                  setIsFullscreen(false);
                }
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen (F11)'}</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
