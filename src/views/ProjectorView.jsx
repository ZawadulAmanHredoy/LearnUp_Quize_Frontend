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
  Radio,
  Tv
} from 'lucide-react';
import { socket } from '../lib/socket';
import soundEngine, {
  initAudio,
  setMuted,
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
import { apiFetch, mediaSrc } from '../lib/config';
import { getPreloadedMediaUrl, preloadMediaList, preloadSingleMedia } from '../lib/mediaCache';

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
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Core Stage State
  const [currentStage, setCurrentStage] = useState('WELCOME');
  const [welcomeConfig, setWelcomeConfig] = useState({
    title: 'BUFT Live Stage Quiz Championship',
    subtitle: 'BGMEA University of Fashion & Technology\nBuzzer Battle • Audio-Visual Challenge • Rapid Fire',
    badgeText: 'Ready to Kickoff',
    showQr: true,
    showTeams: true
  });
  const [breakConfig, setBreakConfig] = useState({
    type: 'INTERMISSION',
    message: 'Short Intermission',
    durationMinutes: null,
    startedAt: null
  });

  const isPreview = typeof window !== 'undefined' && (
    window.location.search.includes('preview=1') ||
    window.location.search.includes('preview=true')
  );

  // Seamless Audio Unlock on First Interaction (without blocking UI)
  useEffect(() => {
    if (isPreview) {
      setMuted(true);
      return;
    }
    const unlock = () => {
      initAudio();
      if (mediaRef.current) {
        mediaRef.current.muted = false;
        setIsAudioBlocked(false);
      }
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('click', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [isPreview]);

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
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);
  const [mediaSubState, setMediaSubState] = useState({ isPlaying: false, currentTime: 0 });

  // Live Audio Clue State & Decreasing Countdown Timer
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  const audioRemaining = Math.max(0, Math.ceil((audioDuration || 0) - audioCurrentTime));
  const audioPercent = audioDuration > 0 ? Math.min(100, (audioCurrentTime / audioDuration) * 100) : 0;
  const formatAudioTime = (secs) => {
    const s = Math.max(0, Math.floor(secs));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${String(rem).padStart(2, '0')}`;
  };

  useEffect(() => {
    setAudioCurrentTime(0);
    setAudioDuration(0);
    setIsAudioPlaying(false);
  }, [activeQuestion?._id, activeQuestion?.mediaUrl]);

  const playMediaSafely = async (el) => {
    if (!el) return;
    try {
      await el.play();
      setIsAudioBlocked(false);
    } catch (err) {
      console.warn('[Projector] Unmuted autoplay blocked by browser, falling back to muted play:', err?.message);
      el.muted = true;
      setIsAudioBlocked(true);
      try {
        await el.play();
      } catch (e2) {
        console.error('[Projector] Muted playback also failed:', e2?.message);
      }
    }
  };

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

  // Auto-preload active media file into memory blob for zero lag playback
  useEffect(() => {
    if (activeQuestion?.mediaUrl) {
      preloadSingleMedia(activeQuestion.mediaUrl).catch(() => {});
    }
  }, [activeQuestion?.mediaUrl]);

  // Reactive playback sync whenever stage, question, or mediaSubState changes
  useEffect(() => {
    if (currentStage === 'ROUND_AV' && mediaRef.current) {
      if (mediaSubState.isPlaying) {
        playMediaSafely(mediaRef.current);
      } else if (mediaSubState.action === 'pause') {
        mediaRef.current.pause();
      }
    }
  }, [currentStage, activeQuestion?._id, activeQuestion?.mediaUrl, mediaSubState.isPlaying, mediaSubState.action]);

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
        if (data.state.welcomeConfig) setWelcomeConfig(data.state.welcomeConfig);
        if (data.state.breakConfig) setBreakConfig(data.state.breakConfig);
        if (data.state.questionSubState) setQuestionSubState(data.state.questionSubState);
        setQuestionIndex(data.state.currentQuestionIndex || 0);
        setActiveTeamId(data.state.activeTeamId || null);
        if (data.state.currentStage !== 'FINAL_WINNER') setCeremony(null);
        if (data.state.mediaSubState) {
          setMediaSubState(data.state.mediaSubState);
        }
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
      if (data.state?.welcomeConfig) setWelcomeConfig(data.state.welcomeConfig);
      if (data.state?.questionSubState) setQuestionSubState(data.state.questionSubState);
      if (data.state?.mediaSubState) setMediaSubState(data.state.mediaSubState);
      if (data.state?.activeTeamId !== undefined) setActiveTeamId(data.state.activeTeamId);
      if ('activeQuestion' in data) setActiveQuestion(data.activeQuestion || null);
    }

    function onWelcomeUpdated(cfg) {
      if (cfg) setWelcomeConfig(cfg);
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
      if (data?.mediaSubState) {
        setMediaSubState(data.mediaSubState);
      } else {
        setMediaSubState({ isPlaying: false, currentTime: 0 });
      }
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
      if (data?.mediaSubState) {
        setMediaSubState(data.mediaSubState);
      }
      if (!mediaRef.current) return;
      const el = mediaRef.current;
      if (data.action === 'play') {
        playMediaSafely(el);
      } else if (data.action === 'pause') {
        el.pause();
      } else if (data.action === 'replay') {
        el.currentTime = 0;
        playMediaSafely(el);
      } else if (data.action === 'seek' && data.time !== undefined) {
        el.currentTime = data.time;
      } else if (data.action === 'mute') {
        el.muted = true;
      } else if (data.action === 'unmute') {
        el.muted = false;
        setIsAudioBlocked(false);
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

    // 14. Media Preload Event (Zero-Lag Blob Memory Caching)
    function onMediaPreload(data) {
      if (Array.isArray(data?.mediaUrls) && data.mediaUrls.length > 0) {
        preloadMediaList(data.mediaUrls).catch(() => {});
      }
    }

    socket.on('state:sync', onStateSync);
    socket.on('stage:updated', onStageUpdated);
    socket.on('stage:changed', onStageUpdated);
    socket.on('break:started', onBreakStarted);
    socket.on('question:presented', onQuestionPresented);
    socket.on('options:updated', onOptionsUpdated);
    socket.on('media:preload', onMediaPreload);
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
    socket.on('welcome:updated', onWelcomeUpdated);

    return () => {
      socket.off('connect', onConnect);
      socket.off('state:sync', onStateSync);
      socket.off('stage:updated', onStageUpdated);
      socket.off('stage:changed', onStageUpdated);
      socket.off('welcome:updated', onWelcomeUpdated);
      socket.off('break:started', onBreakStarted);
      socket.off('question:presented', onQuestionPresented);
      socket.off('options:updated', onOptionsUpdated);
      socket.off('media:preload', onMediaPreload);
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
      style={isPreview ? { width: '1920px', height: '1080px', overflow: 'hidden' } : undefined}
      className={`${
        isPreview
          ? 'w-[1920px] h-[1080px] max-w-[1920px] max-h-[1080px]'
          : 'h-screen max-h-screen overflow-hidden w-full'
      } bg-[#160D2E] text-slate-100 flex flex-col justify-between overflow-hidden relative select-none ${
        isShaking ? 'animate-shake' : ''
      } ${isCursorHidden && !isPreview ? 'cursor-none' : ''}`}
    >
      <style>{`
        html, body, #root {
          overflow: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
          height: 100vh !important;
          max-height: 100vh !important;
          width: 100vw !important;
          box-sizing: border-box !important;
        }
      `}</style>

      {/* BACKGROUND AMBIENT GLOWS */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[600px] h-[600px] bg-[#583FA9]/25 rounded-full blur-[140px]" />
        <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] bg-[#7C3AED]/20 rounded-full blur-[140px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-[#3F2B7B]/15 rounded-full blur-[160px]" />
      </div>

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

      {/* BUZZER WINNER BANNER OVERLAY (COMPACT & SLEEK) */}
      {buzzerWinnerBanner && (
        <div className="fixed top-6 inset-x-0 z-30 flex justify-center px-4 animate-pop pointer-events-none">
          <div className="bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 rounded-2xl px-5 py-3 shadow-2xl shadow-rose-600/40 border border-white/30 text-white flex items-center gap-4 max-w-xl w-full">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-xl font-extrabold shrink-0">
              🚨
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] uppercase tracking-wider font-bold text-rose-100 block">
                Buzzer Lockout
              </span>
              <h3 className="text-base sm:text-lg font-black font-heading truncate">
                {buzzerWinnerBanner.teamName.toUpperCase()}
              </h3>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-black/30 backdrop-blur-md text-xs font-semibold shrink-0">
              <Radio className="w-3.5 h-3.5 text-emerald-300 animate-pulse" />
              <span>Mic Open</span>
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
      {/* 1. TOP STAGE HEADER BAR (Hidden on Welcome & Break screens)    */}
      {/* ------------------------------------------------------------- */}
      {currentStage !== 'WELCOME' && currentStage !== 'BREAK' && (
        <header className="relative z-10 px-8 py-4 flex items-center justify-between border-b border-purple-400/20 bg-[#1E143D]/95 backdrop-blur-md">
          <div className="flex items-center gap-3.5">
            <div className="h-10 px-2 py-1 rounded-xl bg-white flex items-center justify-center shadow-md border border-purple-200">
              <img src="/buft.png" alt="BUFT Logo" className="h-7 sm:h-8 object-contain" />
            </div>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#583FA9] to-[#8B5CF6] flex items-center justify-center p-2 text-white shadow-lg shadow-[#583FA9]/40 border border-purple-400/30">
              <img src="/tv.png" alt="Quiz Arena Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black tracking-tight text-white font-heading">
                BUFT Live Quiz Arena
              </h1>
              <p className="text-[11px] text-[#E0D7FE]">
                BGMEA University of Fashion & Technology
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
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. DYNAMIC STAGE VIEWS                                         */}
      {/* ------------------------------------------------------------- */}
      <main
        className={`relative z-10 flex-1 flex flex-col justify-center ${
          currentStage === 'WELCOME' || currentStage === 'BREAK'
            ? 'px-4 sm:px-6 py-2 sm:py-4 h-full max-h-screen overflow-hidden'
            : 'px-8 py-6'
        } max-w-7xl w-full mx-auto`}
      >
        {/* ============================================================= */}
        {/* STAGE: WELCOME & LANDING (PERFECT SINGLE-SCREEN 100VH FIT)     */}
        {/* ============================================================= */}
        {currentStage === 'WELCOME' && (
          <div
            key={joinQr ? 'welcome-qr' : 'welcome'}
            className="text-center h-full max-h-full flex flex-col justify-between items-center overflow-hidden py-1 relative select-none animate-pop w-full"
          >
            {/* Ambient Floating Orbs */}
            <div className="absolute inset-0 pointer-events-none -z-10 overflow-hidden">
              <div className="absolute top-4 left-1/4 w-32 h-32 rounded-full bg-purple-500/10 blur-2xl animate-float" />
              <div className="absolute bottom-4 right-1/4 w-36 h-36 rounded-full bg-emerald-500/10 blur-2xl animate-float-delayed" />
            </div>

            {/* TOP: BUFT Logo, Quiz Logo, Kickoff Pill, Title, Subtitle */}
            <div className="shrink-0 space-y-1.5 max-w-3xl mx-auto">
              <div className="flex items-center justify-center gap-3.5 mx-auto">
                <div className="h-14 sm:h-16 px-3.5 py-1.5 rounded-2xl bg-white flex items-center justify-center shadow-xl border border-purple-200 animate-float">
                  <img src="/buft.png" alt="BUFT Logo" className="h-10 sm:h-12 object-contain" />
                </div>
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-[#583FA9] to-[#8B5CF6] flex items-center justify-center shadow-xl shadow-purple-950/80 p-2.5 border-2 border-purple-400/50 animate-float">
                  <img src="/tv.png" alt="Quiz Arena Logo" className="w-full h-full object-contain" />
                </div>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 text-[10px] font-bold uppercase tracking-wider glow-mint animate-pulse mx-auto">
                <Sparkles className="w-3 h-3" />
                <span>Organized by BUFT • {welcomeConfig.badgeText || 'Ready to Kickoff'}</span>
              </div>

              <div className="space-y-0.5">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white font-heading tracking-tight leading-tight drop-shadow-md">
                  {welcomeConfig.title && !welcomeConfig.title.includes('LearnUp')
                    ? welcomeConfig.title
                    : 'BUFT Live Stage Quiz Championship'}
                </h2>
                <p className="text-xs sm:text-sm text-[#E0D7FE] font-normal leading-relaxed whitespace-pre-line max-w-xl mx-auto">
                  {welcomeConfig.subtitle && !welcomeConfig.subtitle.includes('LearnUp')
                    ? welcomeConfig.subtitle
                    : 'BGMEA University of Fashion & Technology\nBuzzer Battle • Audio-Visual Challenge • Rapid Fire'}
                </p>
              </div>
            </div>

            {/* MIDDLE: Join QR Code Card (Clean Learnup White Card Aesthetic) */}
            {welcomeConfig.showQr !== false && joinQr && (
              <div className="shrink-0 my-auto py-1">
                <div className="flex w-fit mx-auto items-center gap-4 sm:gap-6 p-3 sm:p-4 rounded-3xl bg-white text-slate-900 border-4 border-[#583FA9] text-left shadow-2xl shadow-purple-950/80 transform hover:scale-102 transition-transform">
                  <img
                    src={joinQr}
                    alt="Scan to open the team buzzer"
                    className="w-18 h-18 sm:w-22 sm:h-22 rounded-2xl bg-white p-1 border border-slate-200 shadow-sm shrink-0"
                  />
                  <div className="space-y-0.5 min-w-0">
                    <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-extrabold flex items-center gap-1.5 bg-emerald-50 px-2 py-0.5 rounded-full w-fit">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      Teams: Scan to Join
                    </span>
                    <span className="text-base sm:text-lg font-black text-[#1A103C] font-mono break-all block leading-tight">
                      {joinUrl.replace(/^https?:\/\//, '')}
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-slate-500 block">
                      Log in with your Team # and PIN
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* BOTTOM: Competing Teams & News Ticker */}
            <div className="shrink-0 space-y-1.5 w-full max-w-4xl mx-auto">
              {welcomeConfig.showTeams !== false && teams.length > 0 && (
                <div className="w-full">
                  <span className="text-[10px] uppercase tracking-widest text-purple-300 font-bold block mb-1">
                    Competing Stage Teams ({teams.length})
                  </span>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 max-h-[82px] overflow-hidden">
                    {teams.slice(0, 12).map((t) => (
                      <div
                        key={t._id || t.id}
                        className="p-1 sm:p-1.5 rounded-xl bg-white/10 backdrop-blur-md text-center space-y-0.5 border border-white/15"
                      >
                        <div className="flex items-center justify-between px-1 text-[10px]">
                          <span className="font-bold text-purple-200">#{t.teamNumber}</span>
                          {t.teamId && <span className="font-mono text-purple-300 text-[9px]">{t.teamId}</span>}
                          <span className="text-amber-300 font-mono-numbers">{t.score}p</span>
                        </div>
                        <div className="text-[11px] font-bold text-white truncate px-0.5">{t.teamName}</div>
                        {t.institution && (
                          <div className="text-[9px] text-purple-200/90 truncate px-0.5">{t.institution}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dynamic Audience News Ticker */}
              <div className="w-full overflow-hidden rounded-full bg-black/40 border border-white/10 py-1 px-4 shadow-inner">
                <div className="animate-ticker flex items-center gap-10 text-[11px] font-semibold text-[#E0D7FE]">
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Welcome to LearnUp Championship Live Arena
                  </span>
                  <span className="text-white/30">•</span>
                  <span className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-yellow-400" /> Round 1: Buzzer Battle • Instant Millisecond Precision
                  </span>
                  <span className="text-white/30">•</span>
                  <span className="flex items-center gap-2">
                    <Tv className="w-3.5 h-3.5 text-sky-400" /> Round 2: Audio-Visual Challenge • Zero-Buffer Database Streaming
                  </span>
                  <span className="text-white/30">•</span>
                  <span className="flex items-center gap-2">
                    <Flame className="w-3.5 h-3.5 text-rose-400" /> Round 3: Rapid Fire Shootout • 60 Seconds of High-Octane Glory
                  </span>
                  <span className="text-white/30">•</span>
                  <span className="flex items-center gap-2">
                    <Trophy className="w-3.5 h-3.5 text-amber-300" /> Audience: Cheer for your favorite team!
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* STAGE: DYNAMIC BREAK SCREENS (WITH ENGAGING ANIMATIONS)        */}
        {/* ============================================================= */}
        {currentStage === 'BREAK' && (
          <div className="text-center space-y-4 my-auto animate-pop relative w-full max-w-3xl mx-auto">
            {breakConfig.type === 'PRAYER' && (
              <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-[#064e3b]/90 to-[#160D2E]/95 border border-emerald-500/40 shadow-2xl shadow-emerald-500/20 space-y-4 relative overflow-hidden">
                {/* Twinkling Celestial Stars */}
                <span className="absolute top-4 left-8 text-emerald-300/60 animate-twinkle text-lg pointer-events-none">✦</span>
                <span className="absolute top-10 right-12 text-emerald-200/50 animate-twinkle text-xs pointer-events-none" style={{ animationDelay: '1s' }}>★</span>
                <span className="absolute bottom-6 left-16 text-emerald-400/70 animate-twinkle text-sm pointer-events-none" style={{ animationDelay: '1.5s' }}>✧</span>
                <span className="absolute bottom-10 right-20 text-emerald-300/50 animate-twinkle text-lg pointer-events-none" style={{ animationDelay: '0.7s' }}>✦</span>

                {/* Animated Glowing Moon */}
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border-2 border-emerald-400/50 shadow-xl shadow-emerald-500/30 animate-pulse-glow animate-float">
                  <Moon className="w-8 h-8 sm:w-10 sm:h-10" />
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-300 flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    Sacred Intermission
                  </span>
                  <h2 className="text-2xl sm:text-4xl font-extrabold text-white font-heading">Prayer Break</h2>
                  <p className="text-xs sm:text-base text-emerald-100">{breakConfig.message || 'Prayer Break — We will resume in a short while.'}</p>
                </div>

                {/* Pulsing Breathing Bar */}
                <div className="pt-3 border-t border-emerald-500/20 space-y-2">
                  <div className="text-[11px] font-semibold tracking-wider uppercase text-emerald-300 flex items-center justify-center gap-2">
                    <span>Standby</span>
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ animationDelay: '0.2s' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ animationDelay: '0.4s' }} />
                    </span>
                    <span>Prayer Break In Progress</span>
                  </div>
                  <div className="w-48 h-1 bg-emerald-950 rounded-full mx-auto overflow-hidden">
                    <div className="w-full h-full bg-emerald-400 rounded-full animate-pulse" />
                  </div>
                </div>
              </div>
            )}

            {breakConfig.type === 'LUNCH' && (
              <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-[#78350f]/90 to-[#160D2E]/95 border border-amber-500/40 shadow-2xl shadow-amber-500/20 space-y-4 relative overflow-hidden">
                {/* Coffee Cup with Rising Steam Animation */}
                <div className="relative mx-auto w-fit">
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex gap-2 pointer-events-none">
                    <span className="w-1.5 h-6 rounded-full bg-amber-200/70 blur-[1px] animate-steam" />
                    <span className="w-1.5 h-8 rounded-full bg-amber-100/80 blur-[1px] animate-steam" style={{ animationDelay: '0.8s' }} />
                    <span className="w-1.5 h-5 rounded-full bg-amber-200/60 blur-[1px] animate-steam" style={{ animationDelay: '1.6s' }} />
                  </div>
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center border-2 border-amber-400/50 shadow-xl shadow-amber-500/30 animate-pulse-glow animate-float">
                    <Coffee className="w-8 h-8 sm:w-10 sm:h-10" />
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-amber-300 flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    Hospitality & Refreshment
                  </span>
                  <h2 className="text-2xl sm:text-4xl font-extrabold text-white font-heading">
                    Lunch & Refreshment Intermission
                  </h2>
                  <p className="text-xs sm:text-base text-amber-100">{breakConfig.message || 'Lunch & Refreshment Intermission — Enjoy your meal.'}</p>
                </div>

                <div className="pt-3 border-t border-amber-500/20 space-y-2">
                  <div className="text-[11px] font-semibold tracking-wider uppercase text-amber-300 flex items-center justify-center gap-2">
                    <span>Standby</span>
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" style={{ animationDelay: '0.2s' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" style={{ animationDelay: '0.4s' }} />
                    </span>
                    <span>Refreshment In Progress</span>
                  </div>
                  <div className="w-48 h-1 bg-amber-950 rounded-full mx-auto overflow-hidden">
                    <div className="w-full h-full bg-amber-400 rounded-full animate-pulse" />
                  </div>
                </div>
              </div>
            )}

            {breakConfig.type !== 'PRAYER' && breakConfig.type !== 'LUNCH' && (
              <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-[#2E1B6B]/95 via-[#1E143D]/95 to-[#160D2E]/95 border border-purple-400/40 shadow-2xl shadow-purple-950/60 space-y-4 relative overflow-hidden">
                {/* Floating Sparkling Gem */}
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr from-[#583FA9]/40 to-[#8B5CF6]/40 text-[#E0D7FE] flex items-center justify-center mx-auto border-2 border-purple-400/40 shadow-xl shadow-purple-900/40 animate-pulse-glow animate-float">
                  <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 text-purple-300" />
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#E0D7FE] flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                    Event Intermission
                  </span>
                  <h2 className="text-2xl sm:text-4xl font-extrabold text-white font-heading">
                    Short Intermission
                  </h2>
                  <p className="text-xs sm:text-base text-slate-300">{breakConfig.message || 'Short Intermission — The quiz will resume shortly.'}</p>
                </div>

                <div className="pt-3 border-t border-purple-400/20 space-y-2">
                  <div className="text-[11px] font-semibold tracking-wider uppercase text-[#E0D7FE] flex items-center justify-center gap-2">
                    <span>Standby</span>
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" style={{ animationDelay: '0.2s' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" style={{ animationDelay: '0.4s' }} />
                    </span>
                    <span>Returning Shortly</span>
                  </div>
                  <div className="w-48 h-1 bg-purple-950 rounded-full mx-auto overflow-hidden">
                    <div className="w-full h-full bg-[#8B5CF6] rounded-full animate-pulse" />
                  </div>
                </div>
              </div>
            )}

            {/* Dynamic Break Entertainment Ticker */}
            <div className="w-full overflow-hidden rounded-full bg-black/40 border border-white/10 py-1 px-4 shadow-inner">
              <div className="animate-ticker flex items-center gap-8 text-[11px] font-medium text-slate-300">
                <span>🎓 Organized by BUFT (BGMEA University of Fashion & Technology)</span>
                <span className="text-white/20">•</span>
                <span>⚡ Sub-millisecond buzzer arbitration & live stage synchronization</span>
                <span className="text-white/20">•</span>
                <span>🏆 Stay tuned: High-stakes points battles continue right after this intermission!</span>
                <span className="text-white/20">•</span>
                <span>🥤 Please stay hydrated and get ready for the next round.</span>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* STAGE: ROUND 1 — BUZZER BATTLE QUESTION CARD                   */}
        {/* ============================================================= */}
        {currentStage === 'ROUND_BUZZER' && activeQuestion && activeQuestion.roundType === 'BUZZER' && (
          <div className="space-y-6 my-auto animate-pop">
            {/* Outer LearnUp Enclosure Card */}
            <div className="bg-gradient-to-br from-[#583FA9] via-[#4A3294] to-[#2E1B6B] p-3.5 sm:p-5 rounded-[2.5rem] shadow-2xl shadow-purple-950/70 border border-purple-400/30">
              <div className="bg-white text-slate-900 rounded-[2rem] p-6 sm:p-8 md:p-10 space-y-6 shadow-xl">
                {/* Header Bar */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#583FA9] to-[#7C3AED] text-white flex items-center justify-center p-2 shadow-md">
                      <img src="/tv.png" alt="Logo" className="w-full h-full object-contain" />
                    </div>
                    <div>
                      <span className="text-base font-black text-[#1A103C] tracking-tight block">
                        Round 1: Buzzer Battle
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        Question #{questionIndex + 1}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-3.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold tracking-wider flex items-center gap-1.5 shadow-sm">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      LIVE
                    </span>
                  </div>
                </div>

                {/* Question Prompt Container */}
                <div className="p-6 sm:p-8 rounded-2xl bg-[#F8F9FE] border-2 border-[#583FA9] shadow-sm">
                  <h2 className="projector-question-text font-black text-[#1A103C] font-heading leading-tight">
                    {activeQuestion.questionText}
                  </h2>
                </div>

                {/* 2x2 Option Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
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
                        className={`p-4 sm:p-5 rounded-2xl border-2 transition-all duration-300 flex items-center gap-4 ${
                          !isRevealed
                            ? 'opacity-30 border-slate-200 bg-slate-50'
                            : isEvaluated
                            ? isCorrectOption
                              ? 'bg-emerald-50 border-emerald-500 text-emerald-950 glow-mint transform scale-[1.02] shadow-md'
                              : isSelected
                              ? 'bg-rose-50 border-rose-500 text-rose-950 glow-rose shadow-md'
                              : 'bg-white border-slate-200 text-slate-400 opacity-60'
                            : isSelected
                            ? 'bg-amber-50 border-amber-400 text-amber-950 animate-pulse-border transform scale-[1.02] shadow-md ring-2 ring-amber-300'
                            : 'bg-white border-slate-200 hover:border-[#583FA9] text-slate-900 shadow-sm'
                        }`}
                      >
                        <div
                          className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center font-black text-lg shrink-0 shadow-sm ${
                            isEvaluated && isCorrectOption
                              ? 'bg-emerald-500 text-white'
                              : isSelected
                              ? 'bg-amber-400 text-black'
                              : 'bg-[#ECE8F9] text-[#583FA9]'
                          }`}
                        >
                          {opt.label}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="projector-option-text font-bold text-slate-800">
                            {isRevealed ? opt.text : '••••••••••••••••'}
                          </p>
                          {isSelected && !isEvaluated && (
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700 block mt-0.5">
                              Locked by Buzzer Team
                            </span>
                          )}
                          {isEvaluated && isCorrectOption && (
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 block mt-0.5">
                              Correct Answer
                            </span>
                          )}
                          {isEvaluated && isSelected && !isCorrectOption && (
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-700 block mt-0.5">
                              Incorrect Answer
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

        {currentStage === 'ROUND_BUZZER' && (!activeQuestion || activeQuestion.roundType !== 'BUZZER') && (
          <div className="bg-gradient-to-br from-[#583FA9] via-[#4A3294] to-[#2E1B6B] p-3.5 sm:p-5 rounded-[2.5rem] shadow-2xl max-w-xl mx-auto my-auto border border-purple-400/30">
            <div className="bg-white text-slate-900 rounded-[2rem] p-8 sm:p-10 text-center space-y-4 shadow-xl">
              <div className="w-16 h-16 rounded-2xl bg-[#583FA9] text-white flex items-center justify-center mx-auto shadow-md">
                <Zap className="w-8 h-8 text-white fill-white" />
              </div>
              <div className="space-y-1.5">
                <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-[#ECE8F9] text-[#583FA9] uppercase tracking-wider inline-block">
                  Stage Standby
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-[#1A103C] font-heading">Round 1: Buzzer Battle</h2>
                <p className="text-slate-500 text-xs sm:text-sm">Host is preparing the next question. Standby for kickoff!</p>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* STAGE: ROUND 2 — AUDIO-VISUAL ROUND                           */}
        {/* ============================================================= */}
        {currentStage === 'ROUND_AV' && activeQuestion && activeQuestion.roundType === 'AUDIO_VISUAL' && (
          <div className="space-y-6 my-auto animate-pop">
            <div className="bg-gradient-to-br from-[#583FA9] via-[#4A3294] to-[#2E1B6B] p-3.5 sm:p-5 rounded-[2.5rem] shadow-2xl shadow-purple-950/70 border border-purple-400/30">
              <div className="bg-white text-slate-900 rounded-[2rem] p-6 sm:p-8 md:p-10 space-y-6 shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-md">
                      <Tv className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <span className="text-base font-black text-[#1A103C] tracking-tight block">
                        Round 2: Audio-Visual Challenge
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        Question #{questionIndex + 1}
                      </span>
                    </div>
                  </div>

                  {activeTeamId && (
                    <div className="px-4 py-1.5 rounded-full bg-amber-50 text-amber-900 border border-amber-300 text-xs font-bold shadow-sm">
                      Active Turn: {teams.find((t) => String(t._id || t.id) === String(activeTeamId))?.teamName || 'Designated Team'}
                    </div>
                  )}
                </div>

                {/* Media Presentation Display */}
                {activeQuestion.mediaType === 'VIDEO' && activeQuestion.mediaUrl && (
                  <div
                    onClick={() => {
                      if (mediaRef.current && isAudioBlocked) {
                        mediaRef.current.muted = false;
                        setIsAudioBlocked(false);
                      }
                    }}
                    className={`rounded-2xl overflow-hidden bg-black aspect-video mx-auto border-2 border-slate-200 shadow-xl relative transition-all duration-500 ${
                      questionSubState.isQuestionVisible ? 'max-h-[240px]' : 'max-h-[520px]'
                    }`}
                  >
                    <video
                      ref={mediaRef}
                      key={activeQuestion.mediaUrl}
                      src={getPreloadedMediaUrl(activeQuestion.mediaUrl)}
                      controls={false}
                      preload="auto"
                      playsInline
                      muted={isPreview || isAudioBlocked}
                      className="w-full h-full object-contain"
                    />

                    {/* Autoplay Policy Audio Fallback Notice */}
                    {isAudioBlocked && !isPreview && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (mediaRef.current) {
                            mediaRef.current.muted = false;
                            mediaRef.current.play().catch(() => {});
                          }
                          setIsAudioBlocked(false);
                        }}
                        className="absolute top-3 right-3 z-30 px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs flex items-center gap-2 shadow-2xl animate-pulse"
                      >
                        <VolumeX className="w-4 h-4 text-amber-950" />
                        <span>Click to Unmute Stage Sound</span>
                      </button>
                    )}
                  </div>
                )}

                {activeQuestion.mediaType === 'AUDIO' && activeQuestion.mediaUrl && (
                  <div
                    onClick={() => {
                      if (mediaRef.current && isAudioBlocked) {
                        mediaRef.current.muted = false;
                        setIsAudioBlocked(false);
                      }
                    }}
                    className="p-8 sm:p-10 rounded-3xl bg-white border-2 border-purple-200 shadow-xl max-w-2xl mx-auto flex flex-col items-center justify-center space-y-6 relative transition-all"
                  >
                    {/* Top Status & Audio Visualizer Header */}
                    <div className="flex items-center gap-3">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
                        isAudioPlaying
                          ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30 ring-4 ring-rose-200 animate-pulse'
                          : 'bg-[#ECE8F9] text-[#583FA9]'
                      }`}>
                        <Volume2 className="w-7 h-7" />
                      </div>
                      <div>
                        <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#583FA9] block">
                          Stage Audio Clue
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${isAudioPlaying ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`} />
                          <span className="text-xs font-bold text-slate-700">
                            {isAudioPlaying ? 'LIVE TRANSMISSION PLAYING' : 'AUDIO PAUSED'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Equalizer Waveform Animation */}
                    <div className="flex items-end justify-center gap-1.5 h-14 w-full max-w-sm px-4">
                      {[35, 60, 90, 45, 80, 100, 70, 40, 85, 95, 50, 75, 30, 65, 85, 45].map((h, i) => (
                        <div
                          key={i}
                          style={{
                            height: isAudioPlaying ? `${h}%` : '20%',
                            animationDelay: `${(i % 5) * 0.18}s`,
                            animationDuration: `${0.8 + (i % 4) * 0.2}s`
                          }}
                          className={`w-2.5 rounded-full transition-all duration-300 ${
                            isAudioPlaying
                              ? 'bg-gradient-to-t from-[#583FA9] via-purple-500 to-rose-500 soundwave-bar'
                              : 'bg-slate-200'
                          }`}
                        />
                      ))}
                    </div>

                    {/* BIG DECREASING AUDIO COUNTDOWN TIMER */}
                    <div className="text-center space-y-1">
                      <div className="flex items-center justify-center gap-2 text-[#1A103C] font-mono-numbers font-black text-5xl tracking-tight">
                        <Clock className={`w-8 h-8 ${isAudioPlaying ? 'text-rose-600 animate-spin-slow' : 'text-slate-400'}`} />
                        <span className={audioRemaining <= 5 && isAudioPlaying ? 'text-rose-600 animate-pulse' : 'text-[#1A103C]'}>
                          {formatAudioTime(audioRemaining)}
                        </span>
                        <span className="text-xs uppercase font-sans tracking-widest text-slate-500 font-extrabold ml-1">
                          REMAINING
                        </span>
                      </div>
                      <div className="text-xs font-bold text-slate-500 font-mono-numbers flex items-center justify-center gap-3">
                        <span>Elapsed: {formatAudioTime(audioCurrentTime)}</span>
                        <span>•</span>
                        <span>Total: {formatAudioTime(audioDuration || 0)}</span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full max-w-md bg-slate-100 h-3 rounded-full overflow-hidden border border-slate-200 shadow-inner relative">
                      <div
                        className="h-full bg-gradient-to-r from-[#583FA9] to-rose-500 rounded-full transition-all duration-150 relative"
                        style={{ width: `${audioPercent}%` }}
                      >
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-md border border-rose-600" />
                      </div>
                    </div>

                    <audio
                      ref={mediaRef}
                      key={activeQuestion.mediaUrl}
                      src={getPreloadedMediaUrl(activeQuestion.mediaUrl)}
                      controls={false}
                      preload="auto"
                      muted={isPreview || isAudioBlocked}
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

                    {isAudioBlocked && !isPreview && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (mediaRef.current) {
                            mediaRef.current.muted = false;
                            mediaRef.current.play().catch(() => {});
                          }
                          setIsAudioBlocked(false);
                        }}
                        className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg animate-pulse"
                      >
                        <VolumeX className="w-4 h-4 text-amber-950" />
                        <span>Click to Unmute Audio</span>
                      </button>
                    )}
                  </div>
                )}

                {activeQuestion.mediaType === 'IMAGE' && activeQuestion.mediaUrl && (
                  <div
                    className={`rounded-2xl overflow-hidden bg-slate-900 mx-auto border-2 border-slate-200 shadow-xl flex items-center justify-center transition-all duration-500 ${
                      questionSubState.isQuestionVisible ? 'max-h-[260px]' : 'max-h-[560px]'
                    }`}
                  >
                    <img
                      src={getPreloadedMediaUrl(activeQuestion.mediaUrl)}
                      alt="Visual clue"
                      className={`object-contain ${questionSubState.isQuestionVisible ? 'max-h-[260px]' : 'max-h-[560px]'}`}
                    />
                  </div>
                )}

                {/* Question Text (hidden while media plays) */}
                {questionSubState.isQuestionVisible ? (
                  <>
                    <div className="p-6 sm:p-8 rounded-2xl bg-[#F8F9FE] border-2 border-[#583FA9] shadow-sm animate-pop">
                      <h2 className="projector-question-text font-black text-[#1A103C] font-heading leading-tight">
                        {activeQuestion.questionText}
                      </h2>
                    </div>

                    {/* Options Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {activeQuestion.options?.map((opt, idx) => {
                        const isRevealed =
                          questionSubState.areAllOptionsVisible ||
                          questionSubState.revealedOptions?.includes(idx);
                        const isEvaluated = questionSubState.isEvaluated;
                        const isCorrect = activeQuestion.correctOptionIndex === idx;

                        return (
                          <div
                            key={idx}
                            className={`p-4 rounded-xl border-2 flex items-center gap-4 transition-all duration-300 ${
                              !isRevealed
                                ? 'opacity-30 border-slate-200 bg-slate-50'
                                : isEvaluated && isCorrect
                                ? 'bg-emerald-50 border-emerald-500 text-emerald-950 glow-mint transform scale-[1.02] shadow-md'
                                : 'bg-white border-slate-200 hover:border-[#583FA9] text-slate-900 shadow-sm'
                            }`}
                          >
                            <div
                              className={`w-10 h-10 rounded-lg font-black flex items-center justify-center shrink-0 ${
                                isEvaluated && isCorrect
                                  ? 'bg-emerald-500 text-white'
                                  : isRevealed
                                  ? 'bg-[#ECE8F9] text-[#583FA9]'
                                  : 'bg-slate-200 text-slate-400'
                              }`}
                            >
                              {opt.label || String.fromCharCode(65 + idx)}
                            </div>
                            <span className="text-lg font-bold text-slate-800 flex-1">
                              {isRevealed ? opt.text : '••••••••••••••••'}
                            </span>
                            {isEvaluated && isCorrect && (
                              <span className="text-[11px] font-extrabold text-emerald-700 uppercase">
                                Correct
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="p-6 rounded-2xl bg-sky-50 border border-sky-200 text-center text-sky-800 font-bold uppercase tracking-widest text-xs">
                    Watch &amp; listen closely — the question appears next
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {currentStage === 'ROUND_AV' && (!activeQuestion || activeQuestion.roundType !== 'AUDIO_VISUAL') && (
          <div className="bg-gradient-to-br from-[#583FA9] via-[#4A3294] to-[#2E1B6B] p-3.5 sm:p-5 rounded-[2.5rem] shadow-2xl max-w-xl mx-auto my-auto border border-purple-400/30">
            <div className="bg-white text-slate-900 rounded-[2rem] p-8 sm:p-10 text-center space-y-4 shadow-xl">
              <div className="w-16 h-16 rounded-2xl bg-sky-600 text-white flex items-center justify-center mx-auto shadow-md">
                <Tv className="w-8 h-8 text-white" />
              </div>
              <div className="space-y-1.5">
                <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 uppercase tracking-wider inline-block">
                  Stage Standby
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-[#1A103C] font-heading">Round 2: Audio-Visual Challenge</h2>
                <p className="text-slate-500 text-xs sm:text-sm">Host is queuing the next media presentation. Standby!</p>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* STAGE: ROUND 3 — RAPID FIRE ROUND                             */}
        {/* ============================================================= */}
        {currentStage === 'ROUND_RAPID_FIRE' && (
          <div className="space-y-6 my-auto animate-pop">
            <div className="bg-gradient-to-br from-[#583FA9] via-[#4A3294] to-[#2E1B6B] p-3.5 sm:p-5 rounded-[2.5rem] shadow-2xl shadow-purple-950/70 border border-purple-400/30">
              <div className="bg-white text-slate-900 rounded-[2rem] p-6 sm:p-8 space-y-6 shadow-xl">
                {/* Header & 60s Clock */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-4 border-b border-slate-100">
                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-widest text-rose-600 flex items-center gap-1.5">
                      <Flame className="w-4 h-4 text-rose-500" />
                      Round 3: Rapid Fire Hot Seat
                    </span>
                    <h2 className="text-2xl sm:text-3xl font-black text-[#1A103C] font-heading">
                      {teams.find((t) => String(t._id || t.id) === String(activeTeamId))?.teamName || 'Team on the Hot Seat'}
                    </h2>
                  </div>

                  {/* 60-Second Radial Countdown Ring */}
                  <div className="flex items-center gap-6">
                    <div className="relative flex items-center justify-center w-24 h-24">
                      <svg className="w-full h-full -rotate-90">
                        <circle
                          cx="48"
                          cy="48"
                          r="40"
                          stroke="currentColor"
                          strokeWidth="8"
                          className="text-slate-100"
                          fill="transparent"
                        />
                        <circle
                          cx="48"
                          cy="48"
                          r="40"
                          stroke="currentColor"
                          strokeWidth="8"
                          className={
                            rapidFireState.secondsRemaining <= 10
                              ? 'text-rose-500 transition-all duration-300'
                              : 'text-[#583FA9] transition-all duration-300'
                          }
                          fill="transparent"
                          strokeDasharray="251"
                          strokeDashoffset={251 - (251 * rapidFireState.secondsRemaining) / 60}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute flex flex-col items-center justify-center font-mono-numbers">
                        <span className="text-3xl font-black text-[#1A103C]">
                          {rapidFireState.secondsRemaining}
                        </span>
                        <span className="text-[9px] text-slate-400 font-bold uppercase">SEC</span>
                      </div>
                    </div>

                    {/* Score Stats */}
                    <div className="grid grid-cols-3 gap-2.5 text-center">
                      <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
                        <span className="text-[10px] text-emerald-700 font-bold block uppercase">Correct</span>
                        <span className="text-xl font-black font-mono-numbers text-emerald-800">
                          {rapidFireState.stats.correct}
                        </span>
                      </div>
                      <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200">
                        <span className="text-[10px] text-rose-700 font-bold block uppercase">Wrong</span>
                        <span className="text-xl font-black font-mono-numbers text-rose-800">
                          {rapidFireState.stats.wrong}
                        </span>
                      </div>
                      <div className="px-3 py-2 rounded-xl bg-slate-100 border border-slate-200">
                        <span className="text-[10px] text-slate-600 font-bold block uppercase">Passed</span>
                        <span className="text-xl font-black font-mono-numbers text-slate-700">
                          {rapidFireState.stats.pass}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rapid Question Display or Summary Card */}
                {rapidFireSummary ? (
                  <div className="p-8 rounded-2xl bg-[#F8F9FE] border-2 border-amber-400 shadow-md text-center space-y-5 animate-pop">
                    <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto text-3xl font-bold">
                      ⏱️
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-3xl font-black text-[#1A103C] font-heading">
                        {rapidFireSummary.reason === 'TIMES_UP' ? "TIME'S UP!" : 'SLOT ENDED'}
                      </h3>
                      <p className="text-slate-600 text-sm">
                        {teams.find((t) => String(t._id || t.id) === String(activeTeamId))?.teamName || 'Team'} — Rapid Fire Slot Concluded
                      </p>
                    </div>

                    <div className="flex flex-wrap justify-center gap-3 pt-3 border-t border-slate-200">
                      {[
                        ['Total Answered', rapidFireSummary.total, 'text-slate-900'],
                        ['Correct', rapidFireSummary.correct, 'text-emerald-700'],
                        ['Wrong', rapidFireSummary.wrong, 'text-rose-700'],
                        ['Passed', rapidFireSummary.pass, 'text-slate-600']
                      ].map(([label, value, color]) => (
                        <div key={label} className="px-5 py-3 rounded-xl bg-white border border-slate-200 shadow-sm">
                          <span className="text-[10px] text-slate-500 uppercase font-bold block">{label}</span>
                          <div className={`text-2xl font-black font-mono-numbers ${color}`}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : activeQuestion ? (
                  <div className="p-8 rounded-2xl bg-[#F8F9FE] border-2 border-[#583FA9] shadow-sm space-y-2">
                    <span className="text-[11px] uppercase tracking-wider text-[#583FA9] font-bold block">
                      Rapid Fire Question
                    </span>
                    <h3 className="projector-question-text font-black text-[#1A103C] font-heading leading-tight">
                      {activeQuestion.questionText}
                    </h3>
                  </div>
                ) : (
                  <div className="p-10 text-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
                    Waiting for Quizmaster to start Rapid Fire round...
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* STAGE: LEADERBOARD                                            */}
        {/* ============================================================= */}
        {currentStage === 'LEADERBOARD' && (
          <div className="space-y-6 my-auto animate-pop max-w-5xl mx-auto w-full">
            <div className="bg-gradient-to-br from-[#583FA9] via-[#4A3294] to-[#2E1B6B] p-3.5 sm:p-5 rounded-[2.5rem] shadow-2xl shadow-purple-950/70 border border-purple-400/30">
              <div className="bg-white text-slate-900 rounded-[2rem] p-6 sm:p-8 space-y-5 shadow-xl">
                <div className="text-center space-y-1 pb-4 border-b border-slate-100">
                  <span className="text-xs font-bold uppercase tracking-widest text-amber-600 flex items-center justify-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-500" />
                    Live Ranked Standings
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-black text-[#1A103C] font-heading">
                    Championship Leaderboard
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 max-h-[60vh] overflow-y-auto pr-1">
                  {teams.map((t, idx) => (
                    <div
                      key={t._id || t.id}
                      className={`p-4 rounded-2xl flex items-center justify-between border transition-all duration-300 ${
                        idx === 0
                          ? 'bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-400 shadow-md glow-gold scale-[1.01]'
                          : idx === 1
                          ? 'bg-slate-50 border-2 border-slate-300 shadow-sm'
                          : idx === 2
                          ? 'bg-amber-50/40 border-2 border-amber-300 shadow-sm'
                          : 'bg-white border border-slate-200 shadow-sm hover:border-purple-200'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg shrink-0 shadow-sm ${
                            idx === 0
                              ? 'bg-gradient-to-tr from-amber-400 to-yellow-400 text-black font-heading'
                              : idx === 1
                              ? 'bg-slate-300 text-slate-800'
                              : idx === 2
                              ? 'bg-amber-200 text-amber-900'
                              : 'bg-[#ECE8F9] text-[#583FA9]'
                          }`}
                        >
                          {idx + 1}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#583FA9]">#{t.teamNumber}</span>
                            {t.teamId && (
                              <span className="px-1.5 py-0.5 rounded bg-[#ECE8F9] text-[#583FA9] font-mono text-[10px] font-bold">
                                {t.teamId}
                              </span>
                            )}
                            <h4 className="text-base font-black text-slate-900 truncate">{t.teamName}</h4>
                          </div>
                          {(t.institution || t.teamLead) && (
                            <div className="text-[11px] text-slate-500 truncate mt-0.5">
                              {t.institution && <span>🏛️ {t.institution}</span>}
                              {t.institution && t.teamLead && <span className="mx-1">•</span>}
                              {t.teamLead && <span>👤 {t.teamLead}</span>}
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5 font-mono">
                            <span>Buzzer: {t.roundScores?.buzzer || 0}</span>
                            <span>•</span>
                            <span>AV: {t.roundScores?.audioVisual || 0}</span>
                            <span>•</span>
                            <span>Rapid: {t.roundScores?.rapidFire || 0}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 ml-3">
                        <span className="text-2xl sm:text-3xl font-black font-mono-numbers text-amber-600">
                          {t.score}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold block uppercase">PTS</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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
      {/* 3. BOTTOM FOOTER BAR (Hidden on Welcome & Break screens)       */}
      {/* ------------------------------------------------------------- */}
      {currentStage !== 'WELCOME' && currentStage !== 'BREAK' && (
        <footer className="relative z-10 px-8 py-3 border-t border-purple-400/20 bg-[#1E143D]/95 backdrop-blur-md flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <img src="/tv.png" alt="Logo" className="w-4 h-4 object-contain opacity-90" />
            <span className="font-medium">LearnUp Live Stage Engine • High Contrast TV Presentation Mode</span>
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
      )}
    </div>
  );
}
