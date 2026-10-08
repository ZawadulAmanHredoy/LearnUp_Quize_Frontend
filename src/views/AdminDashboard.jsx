import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import {
  Radio,
  Tv,
  Users,
  Trophy,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Award,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Flame,
  Volume2,
  VolumeX,
  Maximize2,
  Coffee,
  Moon,
  ChevronRight,
  Plus,
  Trash2,
  RefreshCw,
  Zap,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Sliders,
  ShieldCheck,
  Check,
  X,
  LogOut,
  Key,
  Shield,
  HelpCircle,
  ExternalLink,
  Layers,
  CheckCheck,
  Edit3,
  Save,
  Minus,
  Clock
} from 'lucide-react';
import { socket } from '../lib/socket';

import { apiFetch } from '../lib/config';
import { preloadMedia, subscribeMediaStatus } from '../lib/mediaCache';
import { useMediaSource } from '../lib/useMediaSource';
import QuestionBankManager from './QuestionBankManager';

const EMPTY_QUESTION_SUB_STATE = {
  isQuestionVisible: false,
  revealedOptions: [],
  areAllOptionsVisible: false,
  isCountdownActive: false,
  hasCountdownStarted: false,
  isCountdownDone: false,
  isBuzzerOpen: false,
  buzzerLockedBy: null,
  selectedOptionIndex: null,
  isAnswerLocked: false,
  isEvaluated: false,
  isCorrect: null
};

const STAGE_TO_ROUND = {
  ROUND_BUZZER: 'BUZZER',
  ROUND_AV: 'AUDIO_VISUAL',
  ROUND_RAPID_FIRE: 'RAPID_FIRE'
};

function rapidFireFromServer(rf) {
  return {
    isActive: Boolean(rf?.isActive),
    secondsRemaining: rf?.timerSecondsRemaining ?? 60,
    stats: {
      correct: rf?.correctAnswersCount || 0,
      wrong: rf?.wrongAnswersCount || 0,
      pass: rf?.passedAnswersCount || 0
    }
  };
}

/**
 * Proportional 16:9 Scaled Audience Projector Frame
 * Dynamically computes scale factor from container width to fit the 1920x1080
 * canvas into any viewport/sidebar container without distortion or cropping.
 */
function ScaledAudiencePreview({ monitorKey, className = '' }) {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(0.5);

  const updateScale = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    // clientWidth and clientHeight are the layout box dimensions,
    // completely immune to any CSS transform on ancestor elements.
    const w = el.clientWidth || el.offsetWidth;
    const h = el.clientHeight || el.offsetHeight;
    if (w > 0 && h > 0) {
      setScale(Math.min(w / 1920, h / 1080));
    } else if (w > 0) {
      setScale(w / 1920);
    }
  }, []);

  useLayoutEffect(() => {
    updateScale();
  }, [updateScale]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    updateScale();

    // Re-check after short delays to ensure exact dimensions after any reflow
    const t1 = setTimeout(updateScale, 50);
    const t2 = setTimeout(updateScale, 200);

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = entry.contentRect.width;
          const h = entry.contentRect.height;
          if (w > 0 && h > 0) {
            setScale(Math.min(w / 1920, h / 1080));
          } else if (w > 0) {
            setScale(w / 1920);
          }
        }
      });
      observer.observe(el);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        observer.disconnect();
      };
    } else {
      window.addEventListener('resize', updateScale);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        window.removeEventListener('resize', updateScale);
      };
    }
  }, [updateScale]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full aspect-video bg-black overflow-hidden rounded-xl border border-white/15 select-none shadow-md ${className}`}
      style={{ aspectRatio: '16 / 9' }}
    >
      <iframe
        key={monitorKey}
        src="/live?preview=1"
        title="Audience Live Stage Preview"
        tabIndex={-1}
        scrolling="no"
        style={{
          width: '1920px',
          height: '1080px',
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          pointerEvents: 'none',
        }}
        className="absolute top-0 left-0 border-0 select-none"
      />
      {/* Watermark badge */}
      <div className="absolute top-2 left-2 pointer-events-none px-2 py-0.5 rounded bg-black/75 backdrop-blur-sm border border-white/15 text-[9px] font-mono text-emerald-300 font-bold flex items-center gap-1 shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        STAGE FEED
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  // -------------------------------------------------------------
  // 0. AUTHENTICATION STATE
  // -------------------------------------------------------------
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!localStorage.getItem('admin_token');
  });
  const [adminUser, setAdminUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('admin_user')) || null;
    } catch {
      return null;
    }
  });
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Navigation & Active Stage
  const [activeTab, setActiveTab] = useState('ROUND_BUZZER');
  const [currentStage, setCurrentStage] = useState('WELCOME');

  // Connection Radar
  const [radar, setRadar] = useState({
    isProjectorConnected: false,
    adminCount: 1,
    connectedTeams: []
  });

  // State & Data
  const [teams, setTeams] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState(null);

  // Question Sub-State
  const [questionSubState, setQuestionSubState] = useState({
    isQuestionVisible: false,
    revealedOptions: [],
    areAllOptionsVisible: false,
    isCountdownActive: false,
    hasCountdownStarted: false,
    isCountdownDone: false,
    isBuzzerOpen: false,
    buzzerLockedBy: null,
    selectedOptionIndex: null,
    isAnswerLocked: false,
    isEvaluated: false,
    isCorrect: null
  });

  // Welcome Stage Config State
  const [welcomeTitle, setWelcomeTitle] = useState('LearnUp Live Quiz Championship');
  const [welcomeSubtitle, setWelcomeSubtitle] = useState('The grand stage battle between the finest minds.\nBuzzer Battle • Audio-Visual Challenge • Rapid Fire');
  const [welcomeBadge, setWelcomeBadge] = useState('Ready to Kickoff');
  const [welcomeShowQr, setWelcomeShowQr] = useState(true);
  const [welcomeShowTeams, setWelcomeShowTeams] = useState(true);

  // Audience Live Monitor State
  const [showAudienceMonitor, setShowAudienceMonitor] = useState(true);
  const [isAudienceMonitorExpanded, setIsAudienceMonitorExpanded] = useState(false);
  const [monitorKey, setMonitorKey] = useState(1);

  // Close expanded audience preview on Escape key
  useEffect(() => {
    if (!isAudienceMonitorExpanded) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsAudienceMonitorExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAudienceMonitorExpanded]);

  // Break Config Form
  const [breakType, setBreakType] = useState('INTERMISSION');
  const [breakMessage, setBreakMessage] = useState('');

  // AV Round Turn Selection
  const [avActiveTeamId, setAvActiveTeamId] = useState('');
  // AV clips: the list the round needs, this browser's local copies, and
  // each connected projector's download progress
  const [mediaManifest, setMediaManifest] = useState({ items: [], totalBytes: 0 });
  const [localMedia, setLocalMedia] = useState({ ready: 0, total: 0, running: false, items: {} });
  const [projectorMedia, setProjectorMedia] = useState([]);

  // Rapid Fire State
  const [rfTeamId, setRfTeamId] = useState('');
  const [rfState, setRfState] = useState({
    isActive: false,
    secondsRemaining: 60,
    stats: { correct: 0, wrong: 0, pass: 0 }
  });

  // Modals & Forms
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);

  // Team Registration Form State
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamCustomId, setNewTeamCustomId] = useState('');
  const [newTeamInstitution, setNewTeamInstitution] = useState('');
  const [newTeamLead, setNewTeamLead] = useState('');
  const [newTeamNumber, setNewTeamNumber] = useState('');
  const [newTeamPin, setNewTeamPin] = useState('');
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [teamFormError, setTeamFormError] = useState('');

  // Manual Score / Leaderboard Editing State
  const [editingScoreModal, setEditingScoreModal] = useState({
    open: false,
    teamId: '',
    teamName: '',
    teamNumber: '',
    score: 0,
    buzzer: 0,
    audioVisual: 0,
    rapidFire: 0
  });
  const [isSavingScore, setIsSavingScore] = useState(false);

  // Admin Audio Remote Feedback State
  const [adminAudioCurrentTime, setAdminAudioCurrentTime] = useState(0);
  const [adminAudioDuration, setAdminAudioDuration] = useState(0);
  const [isAdminAudioPlaying, setIsAdminAudioPlaying] = useState(false);
  const [isAdminAudioMuted, setIsAdminAudioMuted] = useState(true);
  const adminAudioRef = useRef(null);

  const adminAudioRemaining = Math.max(0, Math.ceil((adminAudioDuration || 0) - adminAudioCurrentTime));
  const adminAudioPercent = adminAudioDuration > 0 ? Math.min(100, (adminAudioCurrentTime / adminAudioDuration) * 100) : 0;
  const formatAudioTime = (sec) => {
    if (isNaN(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // -------------------------------------------------------------
  // AUTH HANDLERS
  // -------------------------------------------------------------
  const handleAdminLogin = async (e) => {
    e?.preventDefault();
    if (!loginForm.username || !loginForm.password) {
      setLoginError('Please enter both username and password');
      return;
    }
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const { json } = await apiFetch('/auth/admin/login', {
        method: 'POST',
        body: {
          username: loginForm.username.trim(),
          password: loginForm.password
        }
      });
      if (json?.success && json.data?.token) {
        localStorage.setItem('admin_token', json.data.token);
        if (json.data.admin) {
          localStorage.setItem('admin_user', JSON.stringify(json.data.admin));
          setAdminUser(json.data.admin);
        }
        setLoginForm((prev) => ({ ...prev, password: '' }));
        setIsAuthenticated(true);
      } else {
        setLoginError(json?.error || json?.message || 'Invalid credentials');
      }
    } catch (err) {
      setLoginError('Cannot connect to server. Ensure backend is running on port 5000.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAdminLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    setIsAuthenticated(false);
  };

  // Authenticated REST call; an expired or invalid token sends the host back to the login gate
  const adminFetch = async (path, options = {}) => {
    const result = await apiFetch(path, { ...options, token: localStorage.getItem('admin_token') });
    if (result.status === 401) {
      handleAdminLogout();
      setLoginError('Session expired. Please log in again.');
    }
    return result;
  };

  const applySnapshot = (data) => {
    if (!data) return;
    const state = data.state;
    if (state) {
      setCurrentStage(state.currentStage || 'WELCOME');
      if (STAGE_TO_ROUND[state.currentStage]) setActiveTab(state.currentStage);
      if (state.welcomeConfig) {
        if (state.welcomeConfig.title) setWelcomeTitle(state.welcomeConfig.title);
        if (state.welcomeConfig.subtitle) setWelcomeSubtitle(state.welcomeConfig.subtitle);
        if (state.welcomeConfig.badgeText) setWelcomeBadge(state.welcomeConfig.badgeText);
        if ('showQr' in state.welcomeConfig) setWelcomeShowQr(state.welcomeConfig.showQr);
        if ('showTeams' in state.welcomeConfig) setWelcomeShowTeams(state.welcomeConfig.showTeams);
      }
      setQuestionSubState({ ...EMPTY_QUESTION_SUB_STATE, ...(state.questionSubState || {}) });
      if (typeof state.currentQuestionIndex === 'number') setCurrentQuestionIndex(state.currentQuestionIndex);
      setAvActiveTeamId(state.activeTeamId || '');
      if (state.rapidFireSubState) {
        setRfState(rapidFireFromServer(state.rapidFireSubState));
        if (state.rapidFireSubState.teamId) setRfTeamId(state.rapidFireSubState.teamId);
      }
    }
    // Live in-memory timer beats the persisted copy
    if (data.rapidFire) {
      setRfState(rapidFireFromServer(data.rapidFire));
      if (data.rapidFire.teamId) setRfTeamId(data.rapidFire.teamId);
    }
    if (data.teams) setTeams(data.teams);
    if ('activeQuestion' in data) setActiveQuestion(data.activeQuestion || null);
    if (data.radar) setRadar(data.radar);
  };

  // -------------------------------------------------------------
  // INITIAL DATA FETCH
  // -------------------------------------------------------------
  const loadInitialData = async () => {
    try {
      // Restore the exact live state (question, reveals, buzzer, scores) after a crash or refresh
      const stateRes = await adminFetch('/event/state');
      if (stateRes.json?.success) applySnapshot(stateRes.json.data);

      await reloadQuestions();
    } catch (err) {
      console.error('Failed to load initial admin state:', err);
    }
  };

  const reloadQuestions = async () => {
    const { json } = await adminFetch('/questions');
    if (json?.success && Array.isArray(json.data)) setQuestions(json.data);
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    loadInitialData();

    function onConnect() {
      socket.emit('join:room', { role: 'admin', token: localStorage.getItem('admin_token') });
      // Logging in starts the clip downloads: this browser downloads them
      // (on media:manifest below) and every projector is told to as well
      socket.emit('admin:media-preload');
    }

    if (socket.connected) {
      onConnect();
    }
    socket.on('connect', onConnect);

    function onRadarStatus(data) {
      setRadar(data);
    }

    function onStateSync(data) {
      applySnapshot(data);
    }

    function onAuthError(data) {
      if (data?.scope === 'admin') {
        handleAdminLogout();
        setLoginError(data.message || 'Please log in again.');
      }
    }

    function onQuestionShown(data) {
      if (data?.questionSubState) setQuestionSubState({ ...EMPTY_QUESTION_SUB_STATE, ...data.questionSubState });
    }

    function onTurnUpdated(data) {
      setAvActiveTeamId(data.activeTeamId || '');
    }

    function onRapidFireStarted(data) {
      setRfTeamId(data.teamId);
      setRfState({
        isActive: true,
        secondsRemaining: data.seconds || 60,
        stats: { correct: 0, wrong: 0, pass: 0 }
      });
      setActiveQuestion(data.question || null);
    }

    function onWinnerCelebration(data) {
      if (data?.isTie) {
        const names = data.tiedTeams.map((t) => t.teamName).join(' & ');
        flashNotice(`Tie for first: ${names}. Run a sudden-death buzzer question.`, 8000);
      }
    }

    function onStageUpdated(data) {
      setCurrentStage(data.stage);
      if (STAGE_TO_ROUND[data.stage]) setActiveTab(data.stage);
      if ('activeQuestion' in data) setActiveQuestion(data.activeQuestion || null);
      if (data.state?.currentQuestionIndex !== undefined) setCurrentQuestionIndex(data.state.currentQuestionIndex);
      if (data.state?.questionSubState) setQuestionSubState({ ...EMPTY_QUESTION_SUB_STATE, ...data.state.questionSubState });
      if (data.state?.welcomeConfig) {
        if (data.state.welcomeConfig.title) setWelcomeTitle(data.state.welcomeConfig.title);
        if (data.state.welcomeConfig.subtitle) setWelcomeSubtitle(data.state.welcomeConfig.subtitle);
        if (data.state.welcomeConfig.badgeText) setWelcomeBadge(data.state.welcomeConfig.badgeText);
        if ('showQr' in data.state.welcomeConfig) setWelcomeShowQr(data.state.welcomeConfig.showQr);
        if ('showTeams' in data.state.welcomeConfig) setWelcomeShowTeams(data.state.welcomeConfig.showTeams);
      }
    }

    function onWelcomeUpdated(cfg) {
      if (cfg) {
        if (cfg.title) setWelcomeTitle(cfg.title);
        if (cfg.subtitle) setWelcomeSubtitle(cfg.subtitle);
        if (cfg.badgeText) setWelcomeBadge(cfg.badgeText);
        if ('showQr' in cfg) setWelcomeShowQr(cfg.showQr);
        if ('showTeams' in cfg) setWelcomeShowTeams(cfg.showTeams);
      }
    }

    function onQuestionPresented(data) {
      if (data.question) setActiveQuestion(data.question);
      if (typeof data.questionIndex === 'number') setCurrentQuestionIndex(data.questionIndex);
      setQuestionSubState({ ...EMPTY_QUESTION_SUB_STATE, ...(data.questionSubState || { isQuestionVisible: true }) });
    }

    function onOptionsUpdated(data) {
      setQuestionSubState((prev) => ({
        ...prev,
        revealedOptions: data.revealedIndices || [],
        areAllOptionsVisible: Boolean(data.allRevealed)
      }));
    }

    function onCountdownTick(data) {
      if (data.count > 0) {
        setQuestionSubState((prev) => ({
          ...prev,
          isCountdownActive: true,
          hasCountdownStarted: true
        }));
      } else {
        setQuestionSubState((prev) => ({
          ...prev,
          isCountdownActive: false,
          hasCountdownStarted: true,
          isCountdownDone: true,
          isBuzzerOpen: true
        }));
      }
    }

    function onBuzzerStatus(data) {
      setQuestionSubState((prev) => ({
        ...prev,
        isBuzzerOpen: Boolean(data.isOpen)
      }));
    }

    function onBuzzerReset() {
      setQuestionSubState((prev) => ({
        ...prev,
        isBuzzerOpen: false,
        buzzerLockedBy: null
      }));
    }

    function onBuzzerWinner(winner) {
      setQuestionSubState((prev) => ({
        ...prev,
        isBuzzerOpen: false,
        buzzerLockedBy: winner
      }));
    }

    function onAnswerLocked(data) {
      setQuestionSubState((prev) => ({
        ...prev,
        selectedOptionIndex: data.selectedOptionIndex,
        isAnswerLocked: true
      }));
    }

    function onAnswerEvaluated(data) {
      setQuestionSubState((prev) => ({
        ...prev,
        isEvaluated: true,
        isCorrect: data.isCorrect
      }));
      if (data.teams) setTeams(data.teams);
    }

    function onRapidFireTick(data) {
      setRfState((prev) => ({
        ...prev,
        secondsRemaining: data.secondsRemaining
      }));
    }

    function onRapidFireUpdate(data) {
      setRfState((prev) => ({
        ...prev,
        stats: { correct: data.stats.correct, wrong: data.stats.wrong, pass: data.stats.passed }
      }));
      if (data.nextQuestion) setActiveQuestion(data.nextQuestion);
      if (data.teams) setTeams(data.teams);
    }

    function onRapidFireTimesUp() {
      setRfState((prev) => ({ ...prev, isActive: false }));
    }

    function onLeaderboardUpdate(updatedTeams) {
      if (Array.isArray(updatedTeams)) {
        const seen = new Set();
        const unique = updatedTeams.filter((t) => {
          const key = String(t._id || t.id || t.teamNumber);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setTeams(unique);
      }
    }

    function onAdminNotice(data) {
      if (data?.message) flashNotice(data.message);
    }

    function onMediaManifest(manifest) {
      setMediaManifest(manifest || { items: [], totalBytes: 0 });
      preloadMedia(manifest);
    }

    function onProjectorMedia(statuses) {
      setProjectorMedia(Array.isArray(statuses) ? statuses : []);
    }

    function onQuestionsUpdated(list) {
      if (Array.isArray(list)) setQuestions(list);
    }

    function onMediaSync(data) {
      if (!data) return;
      if (data.action === 'play') {
        setIsAdminAudioPlaying(true);
        if (adminAudioRef.current) adminAudioRef.current.play().catch(() => {});
      } else if (data.action === 'replay') {
        setIsAdminAudioPlaying(true);
        if (adminAudioRef.current) {
          adminAudioRef.current.currentTime = 0;
          adminAudioRef.current.play().catch(() => {});
        }
      } else if (data.action === 'pause') {
        setIsAdminAudioPlaying(false);
        if (adminAudioRef.current) adminAudioRef.current.pause();
      }
    }

    socket.on('radar:status', onRadarStatus);
    socket.on('state:sync', onStateSync);
    socket.on('stage:updated', onStageUpdated);
    socket.on('question:presented', onQuestionPresented);
    socket.on('options:updated', onOptionsUpdated);
    socket.on('countdown:tick', onCountdownTick);
    socket.on('buzzer:status', onBuzzerStatus);
    socket.on('buzzer:reset', onBuzzerReset);
    socket.on('buzzer:winner', onBuzzerWinner);
    socket.on('auth:error', onAuthError);
    socket.on('question:shown', onQuestionShown);
    socket.on('turn:updated', onTurnUpdated);
    socket.on('rapid-fire:started', onRapidFireStarted);
    socket.on('winner:celebration', onWinnerCelebration);
    socket.on('answer:locked', onAnswerLocked);
    socket.on('answer:evaluated', onAnswerEvaluated);
    socket.on('rapid-fire:tick', onRapidFireTick);
    socket.on('rapid-fire:update', onRapidFireUpdate);
    socket.on('rapid-fire:times-up', onRapidFireTimesUp);
    socket.on('leaderboard:update', onLeaderboardUpdate);
    socket.on('admin:notice', onAdminNotice);
    socket.on('welcome:updated', onWelcomeUpdated);
    socket.on('media:sync', onMediaSync);
    socket.on('media:manifest', onMediaManifest);
    socket.on('media:projector-status', onProjectorMedia);
    socket.on('questions:updated', onQuestionsUpdated);

    return () => {
      socket.off('connect', onConnect);
      socket.off('radar:status', onRadarStatus);
      socket.off('state:sync', onStateSync);
      socket.off('stage:updated', onStageUpdated);
      socket.off('welcome:updated', onWelcomeUpdated);
      socket.off('question:presented', onQuestionPresented);
      socket.off('options:updated', onOptionsUpdated);
      socket.off('countdown:tick', onCountdownTick);
      socket.off('buzzer:status', onBuzzerStatus);
      socket.off('buzzer:reset', onBuzzerReset);
      socket.off('buzzer:winner', onBuzzerWinner);
      socket.off('auth:error', onAuthError);
      socket.off('question:shown', onQuestionShown);
      socket.off('turn:updated', onTurnUpdated);
      socket.off('rapid-fire:started', onRapidFireStarted);
      socket.off('winner:celebration', onWinnerCelebration);
      socket.off('answer:locked', onAnswerLocked);
      socket.off('answer:evaluated', onAnswerEvaluated);
      socket.off('rapid-fire:tick', onRapidFireTick);
      socket.off('rapid-fire:update', onRapidFireUpdate);
      socket.off('rapid-fire:times-up', onRapidFireTimesUp);
      socket.off('leaderboard:update', onLeaderboardUpdate);
      socket.off('admin:notice', onAdminNotice);
      socket.off('media:sync', onMediaSync);
      socket.off('media:manifest', onMediaManifest);
      socket.off('media:projector-status', onProjectorMedia);
      socket.off('questions:updated', onQuestionsUpdated);
    };
  }, [isAuthenticated]);

  useEffect(() => subscribeMediaStatus(setLocalMedia), []);

  // A clip is safe to play when every connected projector has it stored
  // (or, with no projector connected, when this browser has it)
  const clipReadyOnProjector = (mediaId) => {
    if (!mediaId) return true;
    if (projectorMedia.length === 0) return localMedia.items[mediaId] === 'ready';
    return projectorMedia.every((p) => p.items?.[mediaId] === 'ready');
  };

  const mediaSummary = (() => {
    const total = mediaManifest.items.length;
    const localReady = mediaManifest.items.filter((item) => localMedia.items[item.id] === 'ready').length;
    const projectorReady = mediaManifest.items.filter((item) =>
      projectorMedia.length > 0 && projectorMedia.every((p) => p.items?.[item.id] === 'ready')
    ).length;
    return { total, localReady, projectorReady, allReady: total > 0 && projectorReady === total };
  })();

  const handleRedownloadMedia = () => {
    preloadMedia(mediaManifest, { force: true });
    socket.emit('admin:media-preload', { force: true });
    flashNotice('Re-downloading all clips on this laptop and the projector');
  };

  // The admin's audio monitor plays the local copy too
  const activeMediaSource = useMediaSource(activeQuestion);

  // Reset admin audio clue time tracker on question switch
  useEffect(() => {
    setAdminAudioCurrentTime(0);
    setAdminAudioDuration(0);
    setIsAdminAudioPlaying(false);
  }, [activeQuestion?._id, activeQuestion?.mediaId, activeQuestion?.mediaUrl]);

  // Operator hotkeys (Modernize.md §5):
  //   Rapid Fire: Z Correct, X Wrong, C Pass
  //   Buzzer round: Space reveal next option, Enter 3-2-1 countdown, Escape reset buzzer
  useEffect(() => {
    function handleKeyDown(e) {
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;

      if (currentStage === 'ROUND_RAPID_FIRE' && rfState.isActive) {
        const action = { z: 'CORRECT', x: 'WRONG', c: 'PASS' }[e.key.toLowerCase()];
        if (action) {
          e.preventDefault();
          handleRapidFireAction(action);
        }
        return;
      }

      if ((currentStage === 'ROUND_BUZZER' || currentStage === 'ROUND_AV') && activeQuestion && questionSubState.isQuestionVisible) {
        if (e.key === ' ') {
          e.preventDefault();
          const nextHidden = (activeQuestion.options || []).findIndex(
            (_, idx) => !questionSubState.revealedOptions?.includes(idx)
          );
          if (nextHidden !== -1) handleRevealOption(nextHidden);
        } else if (currentStage === 'ROUND_BUZZER' && e.key === 'Enter') {
          e.preventDefault();
          handleStartCountdown();
        } else if (currentStage === 'ROUND_BUZZER' && e.key === 'Escape') {
          e.preventDefault();
          handleResetBuzzer();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStage, rfState, activeQuestion, questionSubState]);

  // Stage Switch Handler
  // Switching to a round also puts its first question on stage (done by the
  // server; stage:updated brings the question back)
  const handleSetStage = (stage) => {
    socket.emit('admin:set-stage', { stage });
    setCurrentStage(stage);
    setActiveTab(stage);
    flashNotice(`Stage changed to ${stage}`);
  };

  const handleUpdateWelcome = () => {
    const config = {
      title: welcomeTitle,
      subtitle: welcomeSubtitle,
      badgeText: welcomeBadge,
      showQr: welcomeShowQr,
      showTeams: welcomeShowTeams
    };
    socket.emit('admin:update-welcome', { welcomeConfig: config });
    flashNotice('Welcome screen updated on stage');
  };

  const flashNotice = (msg, durationMs = 3000) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice((current) => (current === msg ? null : current)), durationMs);
  };

  // -------------------------------------------------------------
  // ROUND 1: BUZZER BATTLE ACTIONS
  // -------------------------------------------------------------
  const filteredBuzzerQuestions = questions.filter((q) => q.roundType === 'BUZZER');

  const handleSelectQuestion = (q, idx) => {
    if (q.roundType === 'AUDIO_VISUAL' && q.mediaId && !clipReadyOnProjector(q.mediaId)) {
      const ok = window.confirm(
        'This clip is still downloading on the projector, so it may buffer if played now. Put it on stage anyway?'
      );
      if (!ok) return;
    }
    setActiveQuestion(q);
    setCurrentQuestionIndex(idx);

    // CRITICAL: Reset question sub-state locally on question transition
    setQuestionSubState({
      ...EMPTY_QUESTION_SUB_STATE,
      isQuestionVisible: q.roundType !== 'AUDIO_VISUAL'
    });

    socket.emit('admin:load-question', {
      questionId: q._id || q.id,
      questionIndex: idx
    });
    flashNotice(`Broadcasted Question #${idx + 1}`);
  };

  const handleRevealOption = (optionIndex) => {
    socket.emit('admin:reveal-option', { optionIndex });
  };

  const handleRevealAllOptions = () => {
    socket.emit('admin:reveal-option', { revealAll: true });
    flashNotice('All options revealed on screen');
  };

  // Single Countdown Guard
  const handleStartCountdown = () => {
    if (
      questionSubState.hasCountdownStarted ||
      questionSubState.isCountdownActive ||
      questionSubState.isCountdownDone
    ) {
      flashNotice('⚠️ Countdown can only be triggered once per question');
      return;
    }

    setQuestionSubState((prev) => ({
      ...prev,
      isCountdownActive: true,
      hasCountdownStarted: true
    }));

    socket.emit('admin:start-countdown', { seconds: 3 });
    flashNotice('3-2-1 Countdown initiated');
  };

  const handleResetBuzzer = () => {
    socket.emit('admin:reset-buzzer');
    setQuestionSubState((prev) => ({
      ...prev,
      isBuzzerOpen: false,
      buzzerLockedBy: null
    }));
    flashNotice('Buzzer reset');
  };

  const handleLockAnswer = (optionIndex) => {
    socket.emit('admin:lock-answer', { selectedOptionIndex: optionIndex });
    flashNotice(`Locked Option ${String.fromCharCode(65 + optionIndex)} on screen`);
  };

  const handleEvaluate = (isCorrect) => {
    if (!activeQuestion) return;

    if (questionSubState.isEvaluated) {
      flashNotice('This question has already been evaluated');
      return;
    }

    // Points and the answer key are applied by the server from the stored question
    socket.emit('admin:evaluate', { isCorrect });

    flashNotice(isCorrect ? '✅ Marked Correct! Points granted.' : '❌ Marked Wrong!');
  };

  const handleNextQuestion = () => {
    if (filteredBuzzerQuestions.length === 0) return;
    const currentIdx = filteredBuzzerQuestions.findIndex(
      (q) => activeQuestion && (q._id || q.id) === (activeQuestion._id || activeQuestion.id)
    );
    const nextIdx = (currentIdx + 1) % filteredBuzzerQuestions.length;
    handleSelectQuestion(filteredBuzzerQuestions[nextIdx], nextIdx);
  };

  // -------------------------------------------------------------
  // ROUND 2: AUDIO-VISUAL ACTIONS
  // -------------------------------------------------------------
  const filteredAvQuestions = questions.filter((q) => q.roundType === 'AUDIO_VISUAL');

  const handleMediaControl = (action) => {
    socket.emit('admin:media-control', { action });
    if (action === 'play') {
      setIsAdminAudioPlaying(true);
      if (adminAudioRef.current) adminAudioRef.current.play().catch(() => {});
    } else if (action === 'pause') {
      setIsAdminAudioPlaying(false);
      if (adminAudioRef.current) adminAudioRef.current.pause();
    } else if (action === 'replay') {
      setIsAdminAudioPlaying(true);
      if (adminAudioRef.current) {
        adminAudioRef.current.currentTime = 0;
        adminAudioRef.current.play().catch(() => {});
      }
    } else if (action === 'mute') {
      setIsAdminAudioMuted(true);
      if (adminAudioRef.current) adminAudioRef.current.muted = true;
    } else if (action === 'unmute') {
      setIsAdminAudioMuted(false);
      if (adminAudioRef.current) {
        adminAudioRef.current.muted = false;
        if (isAdminAudioPlaying) adminAudioRef.current.play().catch(() => {});
      }
    }
    flashNotice(`Media command: ${action}`);
  };

  const handleShowAvQuestion = () => {
    socket.emit('admin:show-question');
    flashNotice('Question & options shown on stage');
  };

  const handleSetAvTurn = (teamId) => {
    setAvActiveTeamId(teamId);
    socket.emit('admin:set-active-team', { teamId });
    flashNotice('Designated team turn updated');
  };

  // -------------------------------------------------------------
  // ROUND 3: RAPID FIRE ACTIONS
  // -------------------------------------------------------------
  const handleStartRapidFire = () => {
    if (!rfTeamId && teams.length > 0) {
      setRfTeamId(teams[0]._id || teams[0].id);
    }
    const targetTeamId = rfTeamId || teams[0]?._id || teams[0]?.id;

    if (!targetTeamId) {
      flashNotice('Register a team first');
      return;
    }

    socket.emit('admin:rapid-fire-start', { teamId: targetTeamId, seconds: 60 });
    flashNotice('60-Second Rapid Fire timer started!');
  };

  const handleStopRapidFire = () => {
    socket.emit('admin:rapid-fire-stop');
  };

  // The server scores the team it started the clock for
  const handleRapidFireAction = (action) => {
    socket.emit('admin:rapid-fire-action', { action });
  };

  // -------------------------------------------------------------
  // BREAKS
  // -------------------------------------------------------------
  const handleBroadcastBreak = () => {
    socket.emit('admin:set-break', {
      breakType,
      message: breakMessage
    });
    setCurrentStage('BREAK');
    flashNotice(`${breakType} Break broadcasted to stage`);
  };

  const handleEndBreak = (nextStage = 'ROUND_BUZZER') => {
    socket.emit('admin:end-break', { nextStage });
    handleSetStage(nextStage);
    flashNotice('Break ended. Resumed stage.');
  };

  // -------------------------------------------------------------
  // RESET / SEED
  // -------------------------------------------------------------
  const handleResetEvent = async () => {
    if (!window.confirm('Reset all scores and return to Welcome screen?')) return;
    try {
      const { json } = await adminFetch('/event/reset', { method: 'POST' });
      if (json?.success) {
        loadInitialData();
        flashNotice('Event state reset to WELCOME');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSeedDemoData = async () => {
    try {
      const { json } = await adminFetch('/event/seed', { method: 'POST' });
      if (json?.success) {
        loadInitialData();
        flashNotice('Demo questions and teams re-seeded successfully!');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Force reset a team's active device session
  const handleForceResetSession = async (teamId) => {
    try {
      const { json } = await adminFetch(`/teams/${teamId}/reset-session`, { method: 'POST' });
      if (json?.success) {
        loadInitialData();
        flashNotice('Team device session reset! They can log in on a new phone.');
      }
    } catch (e) {}
  };

  // -------------------------------------------------------------
  // TEAM MANAGEMENT: REGISTER & DELETE
  // -------------------------------------------------------------
  const handleRegisterTeam = async (e) => {
    e?.preventDefault();
    if (isCreatingTeam) return;
    if (!newTeamName.trim()) {
      setTeamFormError('Please enter a team name');
      return;
    }
    const num =
      Number(newTeamNumber) ||
      (teams.length > 0 ? Math.max(...teams.map((t) => t.teamNumber || 0)) + 1 : 1);
    const pin = newTeamPin.trim() || String(1000 + num);
    const customId = newTeamCustomId.trim() || `T-${String(num).padStart(2, '0')}`;

    setIsCreatingTeam(true);
    setTeamFormError('');
    try {
      const { json } = await adminFetch('/teams', {
        method: 'POST',
        body: {
          teamName: newTeamName.trim(),
          teamNumber: num,
          teamId: customId,
          institution: newTeamInstitution.trim(),
          teamLead: newTeamLead.trim(),
          pin
        }
      });
      if (json?.success && json.data) {
        // Prevent duplicate if already added by socket leaderboard:update event
        setTeams((prev) => {
          const newId = String(json.data._id || json.data.id);
          const exists = prev.some(
            (t) => String(t._id || t.id) === newId || Number(t.teamNumber) === Number(json.data.teamNumber)
          );
          return exists ? prev : [...prev, json.data];
        });
        setNewTeamName('');
        setNewTeamCustomId(`T-${String(num + 1).padStart(2, '0')}`);
        setNewTeamInstitution('');
        setNewTeamLead('');
        setNewTeamNumber(String(num + 1));
        setNewTeamPin(String(1000 + num + 1));
        flashNotice(`Team "${json.data.teamName}" registered!`);
      } else {
        setTeamFormError(json?.error || json?.message || 'Failed to register team');
      }
    } catch (err) {
      setTeamFormError('Network error registering team');
    } finally {
      setIsCreatingTeam(false);
    }
  };

  const handleDeleteTeam = async (teamId, teamName) => {
    if (!window.confirm(`Delete ${teamName}? This will remove all their scores.`)) return;
    try {
      const { json } = await adminFetch(`/teams/${teamId}`, { method: 'DELETE' });
      if (json?.success) {
        setTeams((prev) => prev.filter((t) => (t._id || t.id) !== teamId));
        flashNotice(`Team "${teamName}" deleted.`);
      }
    } catch (err) {
      console.error('Delete team error:', err);
    }
  };

  const handleOpenEditScore = (team) => {
    setEditingScoreModal({
      open: true,
      teamId: team._id || team.id,
      teamName: team.teamName,
      teamNumber: team.teamNumber,
      score: team.score ?? 0,
      buzzer: team.roundScores?.buzzer ?? 0,
      audioVisual: team.roundScores?.audioVisual ?? 0,
      rapidFire: team.roundScores?.rapidFire ?? 0
    });
  };

  // The server applies the change once and broadcasts leaderboard:update to
  // the projector, phones and every admin tab
  const handleQuickAdjustScore = async (teamId, delta, roundType = 'buzzer') => {
    try {
      const { json } = await adminFetch(`/teams/${teamId}/adjust-score`, {
        method: 'POST',
        body: { delta, roundType }
      });
      if (!json?.success) {
        flashNotice(`Failed to adjust score: ${json?.error || json?.message || 'Server error'}`);
        return;
      }
      setTeams((prev) => prev.map((t) => ((t._id || t.id) === teamId ? { ...t, ...json.data } : t)));
      flashNotice(`Score adjusted by ${delta > 0 ? '+' : ''}${delta} pts`);
    } catch (err) {
      flashNotice(`Failed to adjust score: ${err.message}`);
    }
  };

  const handleSaveScoreModal = async (e) => {
    e?.preventDefault();
    if (!editingScoreModal.teamId) return;
    setIsSavingScore(true);
    try {
      const payload = {
        score: Number(editingScoreModal.score),
        roundScores: {
          buzzer: Number(editingScoreModal.buzzer),
          audioVisual: Number(editingScoreModal.audioVisual),
          rapidFire: Number(editingScoreModal.rapidFire)
        }
      };

      // The server saves it and broadcasts the leaderboard to every screen
      const { json } = await adminFetch(`/teams/${editingScoreModal.teamId}/score`, {
        method: 'PUT',
        body: payload
      });
      if (!json?.success) {
        flashNotice(`Could not save the score: ${json?.error || json?.message || 'Server error'}`);
        return;
      }

      setTeams((prev) =>
        prev.map((t) => ((t._id || t.id) === editingScoreModal.teamId ? { ...t, ...json.data } : t))
      );
      flashNotice(`Saved score for ${editingScoreModal.teamName}`);
      setEditingScoreModal((prev) => ({ ...prev, open: false }));
    } catch (err) {
      flashNotice(`Error saving score: ${err.message}`);
    } finally {
      setIsSavingScore(false);
    }
  };

  // Countdown button state guard
  const isCountdownDisabled =
    questionSubState.hasCountdownStarted ||
    questionSubState.isCountdownActive ||
    questionSubState.isCountdownDone;

  // Real-time Progress Stats for Whole Event & Active Round
  const getProgressStats = () => {
    let eventPercent = 0;
    if (currentStage === 'WELCOME') eventPercent = 5;
    else if (currentStage === 'BREAK') eventPercent = 35;
    else if (currentStage === 'ROUND_BUZZER') eventPercent = 25;
    else if (currentStage === 'ROUND_AV') eventPercent = 55;
    else if (currentStage === 'ROUND_RAPID_FIRE') eventPercent = 80;
    else if (currentStage === 'LEADERBOARD') eventPercent = 92;
    else if (currentStage === 'FINAL_WINNER') eventPercent = 100;

    let roundLabel = 'Pre-Event / Welcome';
    let roundDetail = 'Ready';
    let roundPercent = 0;

    if (currentStage === 'ROUND_BUZZER') {
      roundLabel = 'Round 1: Buzzer Battle';
      const total = filteredBuzzerQuestions.length;
      const current = total > 0 ? Math.min(total, (currentQuestionIndex ?? 0) + 1) : 0;
      roundPercent = total > 0 ? Math.round((current / total) * 100) : 0;
      roundDetail = total > 0 ? `Question ${current} of ${total} (${roundPercent}%)` : 'No Questions';
    } else if (currentStage === 'ROUND_AV') {
      roundLabel = 'Round 2: Audio-Visual';
      const total = filteredAvQuestions.length;
      const current = total > 0 ? Math.min(total, (currentQuestionIndex ?? 0) + 1) : 0;
      roundPercent = total > 0 ? Math.round((current / total) * 100) : 0;
      roundDetail = total > 0 ? `Clip ${current} of ${total} (${roundPercent}%)` : 'No Clips';
    } else if (currentStage === 'ROUND_RAPID_FIRE') {
      roundLabel = 'Round 3: Rapid Fire';
      const playedTeams = teams.filter((t) => (t.roundScores?.rapidFire || 0) > 0 || (t.score || 0) > 0).length;
      const totalTeams = teams.length;
      roundPercent = totalTeams > 0 ? Math.round((playedTeams / totalTeams) * 100) : 0;
      roundDetail = totalTeams > 0 ? `Teams: ${playedTeams}/${totalTeams} Played (${roundPercent}%)` : '0%';
    } else if (currentStage === 'BREAK') {
      roundLabel = 'Intermission Break';
      roundDetail = 'Pause Active';
      roundPercent = 50;
    } else if (currentStage === 'LEADERBOARD') {
      roundLabel = 'Tournament Leaderboard';
      roundDetail = 'Tabulated';
      roundPercent = 100;
    } else if (currentStage === 'FINAL_WINNER') {
      roundLabel = 'Championship Winner';
      roundDetail = 'Concluded';
      roundPercent = 100;
    }

    return {
      eventPercent,
      roundLabel,
      roundDetail,
      roundPercent
    };
  };

  const progressStats = getProgressStats();

  // -------------------------------------------------------------
  // RENDER: ADMIN AUTHENTICATION GATE
  // -------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#F8F9FE] text-slate-900 flex items-center justify-center p-4 relative overflow-hidden select-none">
        {/* Ambient Glows */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#583FA9]/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#7C3AED]/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-purple-100 shadow-2xl relative z-10 space-y-6">
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-3">
              <div className="h-14 px-3 py-1.5 rounded-2xl bg-white border border-purple-200 shadow-sm flex items-center justify-center">
                <img src="/buft.png" alt="BUFT Logo" className="h-9 object-contain" />
              </div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#583FA9] to-[#7C3AED] flex items-center justify-center p-2.5 shadow-md border border-purple-300/40">
                <img src="/tv.png" alt="Quiz Arena Logo" className="w-full h-full object-contain" />
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ECE8F9] text-[#583FA9] text-xs font-bold">
              <span>Organized by BUFT • Host Control</span>
            </div>
            <h2 className="text-2xl font-black text-[#1A103C] font-heading tracking-tight pt-1">
              Quizmaster Control Deck
            </h2>
            <p className="text-xs text-slate-500">
              Authorized personnel only. Enter host credentials to unlock live stage controls.
            </p>
          </div>

          {loginError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2 animate-shake">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">
                Admin Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                  placeholder="Enter admin username"
                  required
                  className="w-full bg-slate-50 border border-slate-200 focus:border-[#583FA9] focus:ring-2 focus:ring-purple-100 rounded-xl px-4 py-3 text-sm text-slate-900 transition-colors font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  placeholder="Enter password"
                  required
                  className="w-full bg-slate-50 border border-slate-200 focus:border-[#583FA9] focus:ring-2 focus:ring-purple-100 rounded-xl px-4 py-3 pr-11 text-sm text-slate-900 transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#583FA9] p-1 rounded-lg transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3.5 rounded-xl bg-[#583FA9] hover:bg-[#4a3294] text-white font-extrabold text-sm shadow-lg shadow-purple-900/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <Key className="w-4 h-4" />
              <span>{isLoggingIn ? 'Authenticating...' : 'Unlock Host Deck'}</span>
            </button>
          </form>

        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: MAIN ADMIN DASHBOARD
  // -------------------------------------------------------------
  return (
    <div className="h-screen bg-[#F8F9FE] text-slate-900 flex flex-col select-none overflow-hidden">
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP HEADER & CONNECTION RADAR                               */}
      {/* ------------------------------------------------------------- */}
      <header className="px-6 py-3.5 border-b border-purple-100 bg-white shadow-sm flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <div className="h-10 px-2 py-1 rounded-xl bg-white border border-purple-200 shadow-sm flex items-center justify-center">
            <img src="/buft.png" alt="BUFT Logo" className="h-7 object-contain" />
          </div>
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#583FA9] to-[#7C3AED] flex items-center justify-center p-2 text-white shadow-md shadow-purple-950/20">
            <img src="/tv.png" alt="Quiz Arena Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-[#1A103C] font-heading tracking-tight flex items-center gap-2">
              BUFT Quizmaster Deck
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#ECE8F9] text-[#583FA9] font-mono font-bold">
                HOST: {adminUser?.username || 'Admin'}
              </span>
            </h1>
            <p className="text-xs text-slate-500">BGMEA University of Fashion & Technology • Live Arena</p>
          </div>
        </div>

        {/* CONNECTION RADAR */}
        <div className="hidden lg:flex items-center gap-3">
          {/* Projector Radar */}
          <div
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
              radar.isProjectorConnected
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>Projector: {radar.isProjectorConnected ? 'Connected (Live)' : 'Offline'}</span>
          </div>

          {/* AV Clip Downloads */}
          {mediaSummary.total > 0 && (
            <div
              title={`This laptop: ${mediaSummary.localReady}/${mediaSummary.total} · Projector: ${
                projectorMedia.length ? `${mediaSummary.projectorReady}/${mediaSummary.total}` : 'not connected'
              }`}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                mediaSummary.allReady
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              <span>
                Clips: {projectorMedia.length ? `projector ${mediaSummary.projectorReady}/${mediaSummary.total}` : `laptop ${mediaSummary.localReady}/${mediaSummary.total}`}
                {localMedia.running && localMedia.bytesTotal > 0 &&
                  ` · ${Math.round((localMedia.bytesDone / localMedia.bytesTotal) * 100)}%`}
              </span>
            </div>
          )}

          {/* Teams Online Radar */}
          <div className="px-3 py-1.5 rounded-xl bg-[#ECE8F9] border border-purple-200 text-[#583FA9] text-xs font-semibold flex items-center gap-2">
            <Users className="w-3.5 h-3.5" />
            <span>
              Teams Online: {radar.connectedTeams?.length || 0} / {teams.length}
            </span>
          </div>
        </div>

        {/* Action Controls & Logout */}
        <div className="flex items-center gap-2">
          {actionNotice && (
            <span className="text-xs font-bold px-3 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 animate-pop">
              {actionNotice}
            </span>
          )}

          <button
            onClick={() => setShowAudienceMonitor((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors ${
              showAudienceMonitor
                ? 'bg-[#ECE8F9] text-[#583FA9] border-purple-200 shadow-sm'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:text-slate-900'
            }`}
            title="Toggle Live Stage Monitor"
          >
            <Tv className="w-3.5 h-3.5" />
            <span>Audience Monitor {showAudienceMonitor ? '• ON' : '• OFF'}</span>
          </button>

          <button
            onClick={handleResetEvent}
            className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Event
          </button>

          <button
            onClick={handleAdminLogout}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Log out of host deck"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* ------------------------------------------------------------- */}
      {/* 1b. DUAL PROGRESS BAR: WHOLE EVENT & ACTIVE ROUND              */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-[#FAF9FF] border-b border-purple-100/90 px-6 py-2.5 shrink-0 flex flex-wrap items-center justify-between gap-4 z-20">
        {/* Whole Event Overall Progress Bar */}
        <div className="flex-1 min-w-[240px] space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#1A103C] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#583FA9]" />
              Whole Event Progress
            </span>
            <span className="font-extrabold text-[#583FA9] font-mono-numbers">
              {progressStats.eventPercent}% Complete
            </span>
          </div>
          <div className="h-2 w-full bg-slate-200/80 rounded-full overflow-hidden shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-[#583FA9] via-purple-600 to-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${progressStats.eventPercent}%` }}
            />
          </div>
        </div>

        {/* Current Round Progress Bar */}
        <div className="flex-1 min-w-[240px] space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-sky-600" />
              {progressStats.roundLabel}
            </span>
            <span className="font-extrabold text-sky-700 font-mono-numbers">
              {progressStats.roundDetail}
            </span>
          </div>
          <div className="h-2 w-full bg-slate-200/80 rounded-full overflow-hidden shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-sky-500 to-indigo-600 rounded-full transition-all duration-300"
              style={{ width: `${progressStats.roundPercent}%` }}
            />
          </div>
        </div>

        {/* Auto-Persistence Emergency Shield Badge */}
        <div className="hidden xl:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>MongoDB State Auto-Saved (Crash-Proof)</span>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. MAIN LAYOUT: SIDEBAR + STAGE DECK                           */}
      {/* ------------------------------------------------------------- */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        {/* SIDEBAR NAVIGATION */}
        <aside className="w-full md:w-64 lg:w-72 border-r border-purple-100 bg-white p-3.5 shrink-0 overflow-y-auto min-h-0 flex flex-col justify-between pb-20 md:pb-6">
          <div className="space-y-5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2 px-2">
                Broadcast Stages
              </span>
              <div className="space-y-1">
                {[
                  { id: 'WELCOME', label: 'Welcome Screen', icon: Sparkles },
                  { id: 'BREAK', label: 'Dynamic Breaks', icon: Coffee },
                  { id: 'ROUND_BUZZER', label: 'Round 1: Buzzer', icon: Zap },
                  { id: 'ROUND_AV', label: 'Round 2: Audio-Visual', icon: Tv },
                  { id: 'ROUND_RAPID_FIRE', label: 'Round 3: Rapid Fire', icon: Flame },
                  { id: 'LEADERBOARD', label: 'Leaderboard', icon: Trophy },
                  { id: 'FINAL_WINNER', label: 'Final Winner', icon: Award }
                ].map((item) => {
                  const Icon = item.icon;
                  const isCurrent = currentStage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSetStage(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all ${
                        isCurrent
                          ? 'bg-[#583FA9] text-white shadow-md shadow-purple-900/25 font-bold'
                          : 'text-slate-600 hover:bg-[#ECE8F9]/70 hover:text-[#583FA9] font-semibold'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </div>
                      {isCurrent && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SETUP & OPERATIONS */}
            <div className="pt-4 border-t border-purple-100 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1 px-2">
                Event Management
              </span>
              <button
                onClick={() => setShowQuestionModal(true)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-[#F8F9FE] hover:bg-[#ECE8F9] text-slate-700 hover:text-[#583FA9] transition-colors border border-purple-100"
              >
                <Sliders className="w-4 h-4 text-[#583FA9]" />
                <span>Questions Bank ({questions.length})</span>
              </button>
              <button
                onClick={() => {
                  if (teams.length > 0 && !newTeamNumber) {
                    const maxNum = Math.max(...teams.map((t) => t.teamNumber || 0));
                    setNewTeamNumber(String(maxNum + 1));
                    setNewTeamPin(String(1000 + maxNum + 1));
                    setNewTeamCustomId(`T-${String(maxNum + 1).padStart(2, '0')}`);
                  } else if (teams.length === 0 && !newTeamNumber) {
                    setNewTeamNumber('1');
                    setNewTeamPin('1001');
                    setNewTeamCustomId('T-01');
                  }
                  setShowTeamModal(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-[#F8F9FE] hover:bg-[#ECE8F9] text-slate-700 hover:text-[#583FA9] transition-colors border border-purple-100"
              >
                <Users className="w-4 h-4 text-[#583FA9]" />
                <span>Teams & Register ({teams.length})</span>
              </button>
              <button
                onClick={handleSeedDemoData}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-[#F8F9FE] hover:bg-[#ECE8F9] text-slate-700 hover:text-[#583FA9] transition-colors border border-purple-100"
              >
                <RefreshCw className="w-4 h-4 text-amber-500" />
                <span>Re-seed Demo Data</span>
              </button>
            </div>
          </div>

          {/* AUDIENCE LIVE STAGE MONITOR DOCKED IN SIDEBAR */}
          {showAudienceMonitor ? (
            <div className="pt-4 border-t border-purple-100 mt-5 space-y-2">
              {/* Panel Header */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#1A103C]">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <Tv className="w-3.5 h-3.5 text-[#583FA9]" />
                  <span className="tracking-wide">Audience Monitor</span>
                </div>

                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => setMonitorKey((k) => k + 1)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                    title="Reload Preview"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>

                  <button
                    onClick={() => setIsAudienceMonitorExpanded(true)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                    title="Expand Cinema View"
                  >
                    <Maximize2 className="w-3 h-3" />
                  </button>

                  <a
                    href="/live"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                    title="Open Live Stage in New Tab"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  <button
                    onClick={() => setShowAudienceMonitor(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 transition-colors"
                    title="Hide Monitor"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Scaled 16:9 Screen */}
              <div
                onClick={() => setIsAudienceMonitorExpanded(true)}
                className="cursor-pointer group relative rounded-xl overflow-hidden border border-purple-100 shadow-sm"
                title="Click to view expanded cinema preview"
              >
                <ScaledAudiencePreview monitorKey={monitorKey} />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-[#583FA9]/15 transition-colors rounded-xl pointer-events-none flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-white bg-black/80 px-2.5 py-1 rounded-md backdrop-blur-sm border border-white/20 shadow-md">
                    Click to Enlarge
                  </span>
                </div>
              </div>

              {/* Status footer link */}
              <div className="flex items-center justify-between text-[10px] text-slate-500 px-1 font-mono">
                <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  16:9 Live Feed
                </span>
                <a
                  href="/live"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#583FA9] hover:underline font-bold flex items-center gap-1"
                >
                  <span>Open Stage</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>
          ) : (
            <div className="pt-3 border-t border-purple-100 mt-5">
              <button
                onClick={() => setShowAudienceMonitor(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-[#F8F9FE] hover:bg-[#ECE8F9] text-slate-600 hover:text-[#583FA9] transition-colors border border-purple-100"
                title="Show Live Audience Monitor"
              >
                <Tv className="w-3.5 h-3.5 text-[#583FA9]" />
                <span>Show Audience Monitor</span>
              </button>
            </div>
          )}
        </aside>

        {/* MAIN CONTROLLER DECK */}
        <main className="flex-1 p-6 overflow-y-auto space-y-6 min-h-0 pb-24 md:pb-12">
          {/* ========================================================= */}
          {/* DECK: WELCOME STAGE CONTROLLER                             */}
          {/* ========================================================= */}
          {currentStage === 'WELCOME' && (
            <div className="space-y-6 max-w-4xl">
              {/* Header Card */}
              <div className="p-6 rounded-3xl bg-white border border-purple-100 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    Stage 1 of Broadcast: Audience Welcome Deck
                  </div>
                  <h2 className="text-xl font-extrabold text-[#1A103C] font-heading">
                    Welcome &amp; Team Onboarding Controls
                  </h2>
                  <p className="text-xs text-slate-500">
                    Customize the event branding, QR login portal, and stage team roster displayed on the audience screen.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleSetStage('ROUND_BUZZER')}
                    className="px-5 py-2.5 rounded-xl bg-[#583FA9] hover:bg-[#4a3294] text-white font-bold text-xs shadow-lg shadow-purple-900/20 flex items-center gap-2 transition-all"
                  >
                    <Zap className="w-4 h-4 text-amber-300" />
                    <span>Kickoff Quiz (Launch Round 1)</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Editor Form & Stage Options */}
              <div className="p-6 rounded-3xl bg-white border border-purple-100 shadow-md space-y-5 max-w-3xl">
                <h3 className="text-sm font-extrabold text-[#1A103C] uppercase tracking-wider flex items-center gap-2 border-b border-purple-100 pb-3">
                  <Sliders className="w-4 h-4 text-[#583FA9]" />
                  Welcome Screen Customization
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">
                      Status Badge Text
                    </label>
                    <input
                      type="text"
                      value={welcomeBadge}
                      onChange={(e) => setWelcomeBadge(e.target.value)}
                      placeholder="e.g. Ready to Kickoff"
                      className="w-full bg-[#F8F9FE] border border-slate-200 focus:bg-white focus:border-[#583FA9] focus:ring-2 focus:ring-purple-100 rounded-xl px-4 py-2.5 text-sm text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">
                      Event Main Title
                    </label>
                    <input
                      type="text"
                      value={welcomeTitle}
                      onChange={(e) => setWelcomeTitle(e.target.value)}
                      placeholder="e.g. LearnUp Live Quiz Championship"
                      className="w-full bg-[#F8F9FE] border border-slate-200 focus:bg-white focus:border-[#583FA9] focus:ring-2 focus:ring-purple-100 rounded-xl px-4 py-2.5 text-sm text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">
                      Subtitle / Tagline (Supports multiple lines)
                    </label>
                    <textarea
                      rows={3}
                      value={welcomeSubtitle}
                      onChange={(e) => setWelcomeSubtitle(e.target.value)}
                      placeholder="e.g. The grand stage battle between the finest minds."
                      className="w-full bg-[#F8F9FE] border border-slate-200 focus:bg-white focus:border-[#583FA9] focus:ring-2 focus:ring-purple-100 rounded-xl px-4 py-2.5 text-sm text-slate-900"
                    />
                  </div>

                  <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-center gap-3 p-3.5 rounded-xl bg-[#F8F9FE] border border-purple-100 cursor-pointer hover:bg-[#ECE8F9]/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={welcomeShowQr}
                        onChange={(e) => setWelcomeShowQr(e.target.checked)}
                        className="w-4 h-4 rounded text-[#583FA9] focus:ring-0 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-[#1A103C] block">Display Join QR Code</span>
                        <span className="text-[10px] text-slate-500 block">Allows team phones to scan and enter PIN</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3.5 rounded-xl bg-[#F8F9FE] border border-purple-100 cursor-pointer hover:bg-[#ECE8F9]/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={welcomeShowTeams}
                        onChange={(e) => setWelcomeShowTeams(e.target.checked)}
                        className="w-4 h-4 rounded text-[#583FA9] focus:ring-0 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-[#1A103C] block">Display Competing Teams</span>
                        <span className="text-[10px] text-slate-500 block">Shows team roster badges at screen bottom</span>
                      </div>
                    </label>
                  </div>

                  <button
                    onClick={handleUpdateWelcome}
                    className="w-full py-3 rounded-xl bg-[#583FA9] hover:bg-[#4a3294] text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-purple-900/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Save &amp; Broadcast Updates to Audience Screen</span>
                  </button>

                  <div className="p-3.5 rounded-xl bg-[#ECE8F9] border border-purple-200 text-[#583FA9] text-xs space-y-1 mt-3">
                    <span className="font-bold block">💡 Host Tip:</span>
                    <span>When all teams have scanned the QR and are visible on the radar above, click &quot;Kickoff Quiz&quot; to begin Round 1!</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* DECK: ROUND 1 — BUZZER BATTLE CONTROLLER                  */}
          {/* ========================================================= */}
          {currentStage === 'ROUND_BUZZER' && (
            <div className="space-y-6">
              {/* Question Selection Bar */}
              <div className="p-5 rounded-3xl bg-white border border-purple-100 shadow-md space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-[#1A103C] uppercase tracking-wider flex items-center gap-2">
                    <Zap className="w-4 h-4 text-[#583FA9]" />
                    Question Navigator ({filteredBuzzerQuestions.length} Buzzer Questions)
                  </h3>
                  <button
                    onClick={handleNextQuestion}
                    className="px-3.5 py-2 rounded-xl bg-[#583FA9] hover:bg-[#4a3294] text-xs font-bold text-white transition-all shadow-md flex items-center gap-1.5"
                  >
                    <span>Next Question</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2">
                  {filteredBuzzerQuestions.map((q, idx) => (
                    <button
                      key={q._id || q.id}
                      onClick={() => handleSelectQuestion(q, idx)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-all ${
                        activeQuestion && (activeQuestion._id || activeQuestion.id) === (q._id || q.id)
                          ? 'bg-[#583FA9] text-white shadow-md shadow-purple-900/25 font-bold'
                          : 'bg-[#F8F9FE] text-slate-600 hover:bg-[#ECE8F9] hover:text-[#583FA9] border border-purple-100'
                      }`}
                    >
                      Question #{idx + 1}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active Question Control Hub */}
              {activeQuestion && activeQuestion.roundType === 'BUZZER' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Question & Option Reveals */}
                  <div className="lg:col-span-2 p-6 rounded-3xl bg-white border border-purple-100 shadow-md space-y-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                        <span>QUESTION #{currentQuestionIndex + 1}</span>
                        <span className="text-emerald-700 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          +{activeQuestion.points ?? 10} / -{activeQuestion.negativePoints ?? 5} PTS
                        </span>
                      </div>
                      <h2 className="text-xl font-extrabold text-[#1A103C] font-heading">
                        {activeQuestion.questionText}
                      </h2>
                    </div>

                    {/* QUIZMASTER VERDICT GUIDE BANNER (HOST-ONLY PREVIEW) */}
                    <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 block">
                            Quizmaster Verdict Guide (Answer Key):
                          </span>
                          <span className="text-sm font-bold text-slate-900">
                            Option {String.fromCharCode(65 + (activeQuestion.correctOptionIndex ?? 0))}:{' '}
                            <span className="text-emerald-700 underline underline-offset-2">
                              {activeQuestion.options?.[activeQuestion.correctOptionIndex]?.text || 'N/A'}
                            </span>
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono font-bold">
                        HOST CONFIDENTIAL
                      </span>
                    </div>

                    {/* Staggered Option Reveal Controls */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                          Options Reveal Controls:
                        </span>
                        <button
                          onClick={handleRevealAllOptions}
                          className="px-3 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold transition-all"
                        >
                          Show All Options at Once
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {activeQuestion.options?.map((opt, idx) => {
                          const isRevealed =
                            questionSubState.areAllOptionsVisible ||
                            questionSubState.revealedOptions?.includes(idx);
                          const isSelected = questionSubState.selectedOptionIndex === idx;

                          return (
                            <div
                              key={idx}
                              onClick={() => handleLockAnswer(idx)}
                              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                                isSelected
                                  ? 'bg-amber-50 border-amber-400 text-amber-950 font-bold shadow-md'
                                  : isRevealed
                                  ? 'bg-white border-purple-200 text-slate-900 hover:border-[#583FA9]'
                                  : 'bg-slate-50 border-slate-200 text-slate-400'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className={`w-8 h-8 rounded-xl font-bold flex items-center justify-center text-xs ${
                                    isSelected ? 'bg-amber-400 text-black shadow-md' : 'bg-[#ECE8F9] text-[#583FA9]'
                                  }`}
                                >
                                  {opt.label}
                                </span>
                                <div>
                                  <span className="text-sm font-semibold block">{opt.text}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {!isRevealed ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRevealOption(idx);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-[#583FA9] hover:bg-[#4a3294] text-[11px] font-bold text-white shadow-sm"
                                  >
                                    Reveal
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                                    <Check className="w-3.5 h-3.5" />
                                    Revealed
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Countdown & Buzzer Activation Trigger (Protected: Single Countdown per Question) */}
                    <div className="pt-4 border-t border-purple-100 flex flex-wrap gap-3">
                      <button
                        onClick={handleStartCountdown}
                        disabled={isCountdownDisabled}
                        className={`flex-1 py-3 px-4 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition-all ${
                          isCountdownDisabled
                            ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-lg shadow-amber-500/30'
                        }`}
                      >
                        <Play className="w-4 h-4 fill-current" />
                        {questionSubState.isCountdownActive
                          ? 'Countdown In Progress (3-2-1)...'
                          : questionSubState.hasCountdownStarted || questionSubState.isCountdownDone
                          ? 'Countdown Completed (1 Run Per Question)'
                          : 'Start 3-2-1 Countdown & Unlock Buzzer'}
                      </button>

                      <button
                        onClick={handleResetBuzzer}
                        className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 transition-colors"
                      >
                        Reset Buzzer
                      </button>
                    </div>
                  </div>

                  {/* Right Column: Buzzer Lockout & Evaluation */}
                  <div className="p-6 rounded-3xl bg-white border border-purple-100 shadow-md space-y-6">
                    <div>
                      <h3 className="text-sm font-extrabold text-[#1A103C] uppercase tracking-wider mb-1">
                        Buzzer &amp; Evaluation Deck
                      </h3>
                      <p className="text-xs text-slate-500">
                        When a team buzzes in, select their spoken option and render the verdict.
                      </p>
                    </div>

                    {/* Buzzer Status Banner */}
                    <div className="p-4 rounded-2xl bg-[#F8F9FE] border border-purple-100 space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Live Buzzer State
                      </span>
                      {questionSubState.buzzerLockedBy ? (
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 font-bold text-sm flex items-center gap-2 shadow-sm">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                          <span>LOCKED BY: {questionSubState.buzzerLockedBy.teamName}</span>
                        </div>
                      ) : questionSubState.isBuzzerOpen ? (
                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold text-sm flex items-center gap-2 shadow-sm">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>BUZZER UNLOCKED — WAITING FOR TAP</span>
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-xs font-medium">
                          Buzzer Locked (Trigger countdown to open)
                        </div>
                      )}
                    </div>

                    {/* Official Correct Answer in Evaluation Deck */}
                    <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs space-y-1">
                      <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Host Verdict Reference:
                      </div>
                      <div className="text-sm text-slate-900 font-bold pl-5">
                        Option {String.fromCharCode(65 + (activeQuestion.correctOptionIndex ?? 0))} —{' '}
                        <span className="text-emerald-700">
                          {activeQuestion.options?.[activeQuestion.correctOptionIndex]?.text || 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Evaluation Buttons */}
                    <div className="space-y-3 pt-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                        Spoken Answer Evaluation:
                      </span>

                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => handleEvaluate(true)}
                          disabled={!questionSubState.buzzerLockedBy || questionSubState.isEvaluated}
                          className="py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Check className="w-4 h-4" />
                          Correct (+{activeQuestion.points ?? 10})
                        </button>

                        <button
                          onClick={() => handleEvaluate(false)}
                          disabled={!questionSubState.buzzerLockedBy || questionSubState.isEvaluated}
                          className="py-3.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <X className="w-4 h-4" />
                          Wrong (-{activeQuestion.negativePoints ?? 5})
                        </button>
                      </div>

                      <p className="text-[11px] text-slate-500 text-center italic">
                        {questionSubState.isEvaluated
                          ? `Evaluated: ${questionSubState.isCorrect ? 'correct' : 'wrong'}. Move to the next question.`
                          : '⚠️ No-Reopen Rule: If wrong, question concludes immediately.'}
                      </p>
                      <p className="text-[10px] text-slate-400 text-center font-mono">
                        Hotkeys: Space reveal next option · Enter countdown · Esc reset buzzer
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {(!activeQuestion || activeQuestion.roundType !== 'BUZZER') && (
                <div className="p-8 rounded-3xl bg-white border border-purple-100 shadow-md text-center space-y-4 max-w-xl mx-auto">
                  <div className="w-12 h-12 rounded-2xl bg-[#583FA9] text-white flex items-center justify-center mx-auto shadow-md">
                    <Zap className="w-6 h-6 text-amber-300" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-extrabold text-[#1A103C]">No Buzzer Question Active</h3>
                    <p className="text-xs text-slate-500">
                      Select Question #1 from the navigator above to broadcast it to the stage.
                    </p>
                  </div>
                  {filteredBuzzerQuestions.length > 0 && (
                    <button
                      onClick={() => handleSelectQuestion(filteredBuzzerQuestions[0], 0)}
                      className="px-5 py-2.5 rounded-xl bg-[#583FA9] hover:bg-[#4a3294] text-white font-bold text-xs shadow-md transition-all inline-flex items-center gap-2"
                    >
                      <Zap className="w-4 h-4 text-amber-300" />
                      <span>Broadcast Question #1 Now</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* DECK: ROUND 2 — AUDIO-VISUAL CONTROLLER                   */}
          {/* ========================================================= */}
          {currentStage === 'ROUND_AV' && (
            <div className="p-6 rounded-3xl bg-white border border-purple-100 shadow-md space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-purple-100">
                <div>
                  <h3 className="text-lg font-extrabold text-[#1A103C] flex items-center gap-2">
                    <Tv className="w-5 h-5 text-sky-600" />
                    Audio-Visual Round Command Deck
                  </h3>
                  <p className="text-xs text-slate-500">
                    Remote control stage video/audio playback and score turn-based teams.
                  </p>
                </div>
              </div>

              {/* Clip downloads: this laptop and every connected projector */}
              <div className="p-4 rounded-2xl bg-[#ECE8F9] border border-purple-200 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#583FA9] text-white flex items-center justify-center font-bold shadow-md shadow-purple-950/20">
                    <Zap className="w-5 h-5 text-amber-300" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-extrabold text-[#1A103C]">Zero-Lag Media Engine</h4>
                      {mediaSummary.total === 0 ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                          No clips yet
                        </span>
                      ) : mediaSummary.allReady ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          All {mediaSummary.total} clips on the projector · Zero Lag
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1.5">
                          {localMedia.running && <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />}
                          Projector {projectorMedia.length ? `${mediaSummary.projectorReady}/${mediaSummary.total}` : 'not connected'}
                          {' · '}This laptop {mediaSummary.localReady}/{mediaSummary.total}
                          {localMedia.running && localMedia.bytesTotal > 0 &&
                            ` · ${Math.round((localMedia.bytesDone / localMedia.bytesTotal) * 100)}%`}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600">
                      Clips download into this browser and every projector when you log in, and stay stored across refreshes, so stage playback never buffers.
                    </p>
                  </div>
                </div>
                {mediaSummary.total > 0 && (
                  <button
                    onClick={handleRedownloadMedia}
                    className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1.5 shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-[#583FA9]" />
                    Re-download clips
                  </button>
                )}
              </div>

              {/* AV Question Selector (media-first) */}
              <div className="p-6 rounded-2xl bg-[#F8F9FE] border border-purple-100 space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-800 block">
                  1. Load a clip on stage (question stays hidden until you show it):
                </span>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {filteredAvQuestions.map((q, idx) => (
                    <button
                      key={q._id || q.id}
                      onClick={() => handleSelectQuestion(q, idx)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-all ${
                        activeQuestion && (activeQuestion._id || activeQuestion.id) === (q._id || q.id)
                          ? 'bg-sky-600 text-white shadow-md'
                          : 'bg-white border border-slate-200 text-slate-700 hover:border-sky-400'
                      }`}
                    >
                      AV #{idx + 1} · {q.mediaType}
                      {q.mediaId && (
                        <span className="ml-1.5" title="Downloaded on the projector?">
                          {clipReadyOnProjector(q.mediaId) ? '✅' : '⏳'}
                        </span>
                      )}
                    </button>
                  ))}
                  {filteredAvQuestions.length === 0 && (
                    <span className="text-xs text-slate-500">No audio-visual questions in the bank.</span>
                  )}
                </div>
              </div>

              {/* Media Remote Controls & Live Audio Monitor */}
              <div className="p-6 rounded-2xl bg-[#F8F9FE] border border-purple-100 space-y-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-800">
                    Projector Media Remote Controls:
                  </span>
                  {activeQuestion && activeQuestion.mediaType === 'AUDIO' && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-[#583FA9] border border-purple-200 flex items-center gap-1.5">
                      <Volume2 className="w-3 h-3" />
                      Active Clue: Audio Clip
                    </span>
                  )}
                </div>

                {/* DEDICATED LIVE AUDIO CLUE MONITOR & DECREASING TIMER */}
                {activeQuestion && activeQuestion.mediaType === 'AUDIO' && activeMediaSource && (
                  <div className="p-5 rounded-2xl bg-white border border-purple-200/90 shadow-sm space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                          isAdminAudioPlaying
                            ? 'bg-[#583FA9] text-white shadow-lg shadow-purple-950/20 scale-105 ring-4 ring-purple-100'
                            : 'bg-purple-100 text-purple-600'
                        }`}>
                          <Volume2 className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-extrabold text-[#1A103C]">Audio Clue Monitor</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isAdminAudioPlaying
                                ? 'bg-emerald-100 text-emerald-800 animate-pulse'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {isAdminAudioPlaying ? '● LIVE AUDIO PLAYING' : 'AUDIO PAUSED'}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500">
                            {activeMediaSource.isLocal ? 'Playing the copy stored on this laptop' : 'Streaming from the server'}
                          </span>
                        </div>
                      </div>

                      {/* Monitor Mute/Unmute Toggle for Admin Screen */}
                      <button
                        onClick={() => {
                          const newMuted = !isAdminAudioMuted;
                          setIsAdminAudioMuted(newMuted);
                          if (adminAudioRef.current) {
                            adminAudioRef.current.muted = newMuted;
                            if (!newMuted && isAdminAudioPlaying) {
                              adminAudioRef.current.play().catch(() => {});
                            }
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                        title="Toggle sound preview on admin computer"
                      >
                        {isAdminAudioMuted ? (
                          <>
                            <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                            <span>Admin Speaker: Muted</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700">Admin Speaker: ON</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Equalizer Soundwave Animation */}
                    <div className="flex items-end justify-center gap-1.5 h-12 w-full max-w-sm mx-auto px-2">
                      {[35, 60, 90, 45, 80, 100, 70, 40, 85, 95, 50, 75, 30, 65, 85, 45].map((h, i) => (
                        <div
                          key={i}
                          style={{
                            height: isAdminAudioPlaying ? `${h}%` : '20%',
                            animationDelay: `${(i % 5) * 0.18}s`,
                            animationDuration: `${0.8 + (i % 4) * 0.2}s`
                          }}
                          className={`w-2.5 rounded-full transition-all duration-300 ${
                            isAdminAudioPlaying
                              ? 'bg-gradient-to-t from-[#583FA9] via-purple-500 to-rose-500 soundwave-bar'
                              : 'bg-slate-200'
                          }`}
                        />
                      ))}
                    </div>

                    {/* BIG DECREASING COUNTDOWN TIMER */}
                    <div className="text-center space-y-1">
                      <div className="flex items-center justify-center gap-2 text-[#1A103C] font-mono-numbers font-black text-4xl">
                        <Clock className={`w-7 h-7 ${isAdminAudioPlaying ? 'text-rose-600 animate-spin-slow' : 'text-slate-400'}`} />
                        <span className={adminAudioRemaining <= 5 && isAdminAudioPlaying ? 'text-rose-600 animate-pulse' : 'text-[#1A103C]'}>
                          {formatAudioTime(adminAudioRemaining)}
                        </span>
                        <span className="text-xs uppercase font-sans tracking-widest text-slate-500 font-extrabold ml-1">
                          REMAINING
                        </span>
                      </div>
                      <div className="text-xs font-bold text-slate-500 font-mono-numbers flex items-center justify-center gap-3">
                        <span>Elapsed: {formatAudioTime(adminAudioCurrentTime)}</span>
                        <span>•</span>
                        <span>Total: {formatAudioTime(adminAudioDuration || 0)}</span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200 relative">
                      <div
                        className="h-full bg-gradient-to-r from-[#583FA9] to-rose-500 rounded-full transition-all duration-150"
                        style={{ width: `${adminAudioPercent}%` }}
                      />
                    </div>

                    {/* Hidden/Synced Audio Element for Admin Dashboard */}
                    <audio
                      ref={adminAudioRef}
                      key={activeMediaSource.url}
                      src={activeMediaSource.url}
                      controls={false}
                      preload="auto"
                      muted={isAdminAudioMuted}
                      onLoadedMetadata={(e) => {
                        const d = e.target.duration;
                        if (d && !isNaN(d)) setAdminAudioDuration(d);
                      }}
                      onTimeUpdate={(e) => {
                        setAdminAudioCurrentTime(e.target.currentTime);
                        if (e.target.duration && !isNaN(e.target.duration)) {
                          setAdminAudioDuration(e.target.duration);
                        }
                      }}
                      onPlay={() => setIsAdminAudioPlaying(true)}
                      onPause={() => setIsAdminAudioPlaying(false)}
                      onEnded={() => {
                        setIsAdminAudioPlaying(false);
                        setAdminAudioCurrentTime(adminAudioDuration);
                      }}
                    />
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => handleMediaControl('play')}
                    className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-2 shadow-md"
                  >
                    <Play className="w-4 h-4" />
                    Play on Stage
                  </button>
                  <button
                    onClick={() => handleMediaControl('pause')}
                    className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-2 border border-slate-200 shadow-sm"
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </button>
                  <button
                    onClick={() => handleMediaControl('replay')}
                    className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-2 border border-slate-200 shadow-sm"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Replay from Start
                  </button>
                  <button
                    onClick={() => handleMediaControl('mute')}
                    className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-2 border border-slate-200 shadow-sm"
                  >
                    <VolumeX className="w-4 h-4" />
                    Mute Stage
                  </button>
                  <button
                    onClick={() => handleMediaControl('unmute')}
                    className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-2 border border-slate-200 shadow-sm"
                  >
                    <Volume2 className="w-4 h-4" />
                    Unmute Stage
                  </button>
                </div>
              </div>

              {/* Turn-Based Team Rotation */}
              <div className="p-6 rounded-2xl bg-[#F8F9FE] border border-purple-100 space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                  2. Designate Active Team's Turn:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {teams.map((t) => (
                    <button
                      key={t._id || t.id}
                      onClick={() => handleSetAvTurn(t._id || t.id)}
                      className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                        avActiveTeamId === (t._id || t.id)
                          ? 'bg-amber-400 text-black border-amber-400 shadow-md font-extrabold'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-purple-300'
                      }`}
                    >
                      {t.teamName}
                    </button>
                  ))}
                </div>
              </div>

              {/* Show Question & Evaluate */}
              {activeQuestion && activeQuestion.roundType === 'AUDIO_VISUAL' && (
                <div className="p-6 rounded-2xl bg-[#F8F9FE] border border-purple-100 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-purple-100">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 block">
                        3. Question &amp; Option Reveal:
                      </span>
                      <p className="text-xs text-slate-500">
                        First reveal the question prompt, then reveal options one by one (or press [Space]).
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleShowAvQuestion}
                        disabled={questionSubState.isQuestionVisible}
                        className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                          questionSubState.isQuestionVisible
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 cursor-default'
                            : 'bg-[#583FA9] hover:bg-[#4a3294] text-white shadow-md'
                        }`}
                      >
                        <Eye className="w-4 h-4" />
                        {questionSubState.isQuestionVisible ? 'Question Shown on Stage' : 'Show Question'}
                      </button>

                      {questionSubState.isQuestionVisible && (
                        <button
                          onClick={handleRevealAllOptions}
                          disabled={questionSubState.areAllOptionsVisible}
                          className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 shadow-sm"
                        >
                          <CheckCheck className="w-4 h-4" />
                          Reveal All Options
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-white border border-purple-100 space-y-2 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Question #{currentQuestionIndex + 1}</span>
                      <span className="font-mono text-emerald-700 font-bold">
                        Answer: Option {String.fromCharCode(65 + (activeQuestion.correctOptionIndex ?? 0))} ({activeQuestion.options?.[activeQuestion.correctOptionIndex]?.text || ''})
                      </span>
                    </div>
                    <h4 className="text-base font-bold text-[#1A103C]">{activeQuestion.questionText}</h4>
                  </div>

                  {/* Options Reveal Controls */}
                  {questionSubState.isQuestionVisible ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700">
                          Options Visibility on Stage (Click Reveal or press [Space]):
                        </span>
                        <button
                          onClick={() => {
                            const nextHidden = (activeQuestion.options || []).findIndex(
                              (_, idx) => !questionSubState.revealedOptions?.includes(idx)
                            );
                            if (nextHidden !== -1) handleRevealOption(nextHidden);
                          }}
                          disabled={
                            questionSubState.areAllOptionsVisible ||
                            (activeQuestion.options || []).every((_, idx) =>
                              questionSubState.revealedOptions?.includes(idx)
                            )
                          }
                          className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                          Reveal Next Option [Space]
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(activeQuestion.options || []).map((opt, idx) => {
                          const isRevealed =
                            questionSubState.areAllOptionsVisible ||
                            questionSubState.revealedOptions?.includes(idx);
                          const isCorrect = activeQuestion.correctOptionIndex === idx;

                          return (
                            <div
                              key={idx}
                              className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                                isCorrect && questionSubState.isEvaluated
                                  ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold'
                                  : isRevealed
                                  ? 'bg-white border-purple-200 text-slate-900 shadow-sm'
                                  : 'bg-slate-100 border-slate-200 text-slate-400 opacity-70'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className={`w-7 h-7 rounded-lg font-bold flex items-center justify-center text-xs shrink-0 ${
                                    isCorrect
                                      ? 'bg-emerald-600 text-white'
                                      : isRevealed
                                      ? 'bg-[#ECE8F9] text-[#583FA9]'
                                      : 'bg-slate-200 text-slate-500'
                                  }`}
                                >
                                  {opt.label || String.fromCharCode(65 + idx)}
                                </span>
                                <span className="text-sm font-semibold">{opt.text}</span>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {isCorrect && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    Answer
                                  </span>
                                )}
                                {!isRevealed ? (
                                  <button
                                    onClick={() => handleRevealOption(idx)}
                                    className="px-2.5 py-1 rounded-lg bg-[#583FA9] hover:bg-[#4a3294] text-[11px] font-bold text-white shadow-sm"
                                  >
                                    Reveal
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                                    <Check className="w-3.5 h-3.5" />
                                    Visible
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>Click &quot;Show Question&quot; above after video/audio finishes playing to display the prompt and begin revealing options one by one.</span>
                    </div>
                  )}

                  {/* Verdict & Scoring */}
                  <div className="pt-3 border-t border-purple-100">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block mb-2">
                      Host Verdict &amp; Scoring:
                    </span>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handleEvaluate(true)}
                        disabled={!avActiveTeamId || questionSubState.isEvaluated}
                        className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                      >
                        <Check className="w-4 h-4" />
                        Correct (+{activeQuestion.points ?? 15})
                      </button>
                      <button
                        onClick={() => handleEvaluate(false)}
                        disabled={!avActiveTeamId || questionSubState.isEvaluated}
                        className="py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                      >
                        <X className="w-4 h-4" />
                        Wrong ({activeQuestion.negativePoints ? `-${activeQuestion.negativePoints}` : '0'})
                      </button>
                    </div>
                    {!avActiveTeamId && (
                      <p className="text-[11px] text-amber-700 text-center mt-2 font-medium">
                        Designate the team whose turn it is before scoring.
                      </p>
                    )}
                    {questionSubState.isEvaluated && (
                      <p className="text-[11px] text-emerald-700 text-center mt-2 font-bold">
                        Evaluated: {questionSubState.isCorrect ? 'Correct (+15)' : 'Wrong'}. Move to the next clip.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* DECK: ROUND 3 — RAPID FIRE CONTROLLER                     */}
          {/* ========================================================= */}
          {currentStage === 'ROUND_RAPID_FIRE' && (
            <div className="p-6 rounded-3xl bg-white border border-purple-100 shadow-md space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-purple-100">
                <div>
                  <h3 className="text-lg font-extrabold text-[#1A103C] flex items-center gap-2">
                    <Flame className="w-5 h-5 text-rose-500" />
                    60-Second Rapid Fire Command Deck
                  </h3>
                  <p className="text-xs text-slate-500">
                    Host accelerator pad: Use keyboard keys [Z] Correct, [X] Wrong, [C] Pass for instant transitions.
                  </p>
                </div>

                <div className="text-right font-mono-numbers">
                  <span className="text-3xl font-black text-amber-600">
                    {rfState.secondsRemaining}s
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold block">REMAINING</span>
                </div>
              </div>

              {/* Team Selector & Start Button */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Select Team for Hot Seat:
                  </label>
                  <select
                    value={rfTeamId}
                    onChange={(e) => setRfTeamId(e.target.value)}
                    className="w-full bg-[#F8F9FE] border border-slate-200 focus:bg-white focus:border-[#583FA9] focus:ring-2 focus:ring-purple-100 rounded-xl px-4 py-2.5 text-sm text-slate-900"
                  >
                    {teams.map((t) => (
                      <option key={t._id || t.id} value={t._id || t.id}>
                        #{t.teamNumber} — {t.teamName} ({t.score} pts)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-5 flex gap-2">
                  {rfState.isActive && (
                    <button
                      onClick={handleStopRapidFire}
                      className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm border border-slate-300"
                    >
                      Stop Clock
                    </button>
                  )}
                  <button
                    onClick={handleStartRapidFire}
                    disabled={rfState.isActive}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:opacity-95 text-white font-bold text-sm shadow-md shadow-rose-600/30 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    Start 60s Rapid Fire Clock
                  </button>
                </div>
              </div>

              {/* Current question (host view, with answer) */}
              {activeQuestion && activeQuestion.roundType === 'RAPID_FIRE' && (
                <div className="p-5 rounded-2xl bg-[#F8F9FE] border border-purple-100 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                    <span>NOW ON STAGE</span>
                    <span className="font-mono-numbers">
                      ✓ {rfState.stats.correct} · ✗ {rfState.stats.wrong} · ↷ {rfState.stats.pass}
                    </span>
                  </div>
                  <h4 className="text-lg font-bold text-[#1A103C]">{activeQuestion.questionText}</h4>
                  <div className="text-sm text-emerald-700 font-bold">
                    Answer: {activeQuestion.options?.[activeQuestion.correctOptionIndex]?.text || 'N/A'}
                  </div>
                </div>
              )}

              {/* 3 GIANT TOUCH / HOTKEY ACCELERATOR PADS */}
              <div className="grid grid-cols-3 gap-4 pt-4">
                <button
                  onClick={() => handleRapidFireAction('CORRECT')}
                  disabled={!rfState.isActive}
                  className="py-12 rounded-2xl bg-gradient-to-b from-emerald-600 to-emerald-800 text-white font-extrabold flex flex-col items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 glow-mint active:scale-95 transition-all disabled:opacity-40"
                >
                  <Check className="w-8 h-8" />
                  <span className="text-xl sm:text-2xl font-heading">[Z] CORRECT (+1)</span>
                </button>

                <button
                  onClick={() => handleRapidFireAction('WRONG')}
                  disabled={!rfState.isActive}
                  className="py-12 rounded-2xl bg-gradient-to-b from-rose-600 to-rose-800 text-white font-extrabold flex flex-col items-center justify-center gap-2 shadow-lg shadow-rose-600/30 glow-rose active:scale-95 transition-all disabled:opacity-40"
                >
                  <X className="w-8 h-8" />
                  <span className="text-xl sm:text-2xl font-heading">[X] WRONG (0)</span>
                </button>

                <button
                  onClick={() => handleRapidFireAction('PASS')}
                  disabled={!rfState.isActive}
                  className="py-12 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold flex flex-col items-center justify-center gap-2 border border-slate-300 active:scale-95 transition-all disabled:opacity-40"
                >
                  <RotateCcw className="w-8 h-8" />
                  <span className="text-xl sm:text-2xl font-heading">[C] PASS (0)</span>
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* DECK: DYNAMIC BREAKS CONTROLLER                           */}
          {/* ========================================================= */}
          {currentStage === 'BREAK' && (
            <div className="p-6 rounded-3xl bg-white border border-purple-100 shadow-md space-y-6 max-w-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-extrabold text-[#1A103C] flex items-center gap-2">
                    <Coffee className="w-5 h-5 text-amber-500" />
                    Dynamic Break Screens Deck
                  </h3>
                  <p className="text-xs text-slate-500">
                    Select an intermission theme and optional broadcast message for the audience.
                  </p>
                </div>

                <button
                  onClick={() => handleEndBreak('ROUND_BUZZER')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all self-start sm:self-auto"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>End Break &amp; Resume Round 1</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'PRAYER', label: 'Prayer Break', icon: Moon },
                  { id: 'LUNCH', label: 'Lunch Break', icon: Coffee },
                  { id: 'INTERMISSION', label: 'Intermission', icon: Sparkles }
                ].map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setBreakType(b.id)}
                    className={`p-4 rounded-2xl border text-center space-y-2 transition-all ${
                      breakType === b.id
                        ? 'bg-[#583FA9] border-[#583FA9] text-white shadow-md'
                        : 'bg-[#F8F9FE] border-purple-100 text-slate-700 hover:bg-[#ECE8F9]'
                    }`}
                  >
                    <b.icon className="w-6 h-6 mx-auto" />
                    <span className="text-xs font-bold block">{b.label}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Custom Broadcast Message (Optional)
                  </label>
                  <input
                    type="text"
                    value={breakMessage}
                    onChange={(e) => setBreakMessage(e.target.value)}
                    placeholder="e.g. We will resume with Round 2 shortly!"
                    className="w-full bg-[#F8F9FE] border border-slate-200 focus:bg-white focus:border-[#583FA9] focus:ring-2 focus:ring-purple-100 rounded-xl px-4 py-2.5 text-sm text-slate-900"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Leave blank to show the default elegant intermission standby banner.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={handleBroadcastBreak}
                    className="py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-xs shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 transition-all"
                  >
                    <Coffee className="w-4 h-4" />
                    <span>Broadcast Break to Projector</span>
                  </button>

                  <button
                    onClick={() => handleEndBreak('ROUND_BUZZER')}
                    className="py-3 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition-all"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Resume Quiz Competition</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* DECK: LEADERBOARD & WINNER                                */}
          {/* ========================================================= */}
          {(currentStage === 'LEADERBOARD' || currentStage === 'FINAL_WINNER') && (
            <div className="p-6 rounded-3xl bg-white border border-purple-100 shadow-md space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-purple-100">
                <div>
                  <h3 className="text-lg font-extrabold text-[#1A103C] flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    Leaderboard &amp; Championship Ceremony
                  </h3>
                  <p className="text-xs text-slate-500">
                    Live team standings and celebratory champion coronation.
                  </p>
                </div>

                <button
                  onClick={() => socket.emit('admin:announce-winner')}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 text-black font-extrabold text-sm shadow-md shadow-amber-400/40 glow-gold flex items-center gap-2"
                >
                  <Award className="w-4 h-4" />
                  Crown Champion &amp; Confetti
                </button>
              </div>

              {/* Roster Table */}
              <div className="overflow-x-auto rounded-2xl border border-purple-100">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-[#ECE8F9] text-[#1E143D] uppercase font-bold text-[11px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Rank</th>
                      <th className="py-3 px-4">Team</th>
                      <th className="py-3 px-4">Buzzer Pts</th>
                      <th className="py-3 px-4">AV Pts</th>
                      <th className="py-3 px-4">Rapid Fire Pts</th>
                      <th className="py-3 px-4 text-right">Total Score</th>
                      <th className="py-3 px-4 text-center">Manual Adjust / Override</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-50">
                    {teams.map((t, idx) => (
                      <tr key={t._id || t.id} className="hover:bg-[#F8F9FE] transition-colors">
                        <td className="py-3.5 px-4 font-black text-amber-600 text-sm">#{idx + 1}</td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#583FA9]">#{t.teamNumber}</span>
                            {t.teamId && (
                              <span className="px-1.5 py-0.5 rounded bg-[#ECE8F9] text-[#583FA9] font-mono text-[10px] font-bold">
                                {t.teamId}
                              </span>
                            )}
                            <span className="font-extrabold text-slate-900">{t.teamName}</span>
                          </div>
                          {(t.institution || t.teamLead) && (
                            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 font-medium">
                              {t.institution && <span>🏛️ {t.institution}</span>}
                              {t.institution && t.teamLead && <span className="opacity-40">•</span>}
                              {t.teamLead && <span>👤 {t.teamLead}</span>}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono-numbers font-semibold">{t.roundScores?.buzzer || 0}</td>
                        <td className="py-3.5 px-4 font-mono-numbers font-semibold">{t.roundScores?.audioVisual || 0}</td>
                        <td className="py-3.5 px-4 font-mono-numbers font-semibold">{t.roundScores?.rapidFire || 0}</td>
                        <td className="py-3.5 px-4 text-right font-black text-[#583FA9] font-mono-numbers text-base">
                          {t.score} PTS
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleQuickAdjustScore(t._id || t.id, 10, 'buzzer')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-mono font-bold text-[11px] border border-emerald-200 transition-colors"
                              title="Add 10 points"
                            >
                              +10
                            </button>
                            <button
                              onClick={() => handleQuickAdjustScore(t._id || t.id, 5, 'buzzer')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-mono font-bold text-[11px] border border-emerald-200 transition-colors"
                              title="Add 5 points"
                            >
                              +5
                            </button>
                            <button
                              onClick={() => handleQuickAdjustScore(t._id || t.id, -5, 'buzzer')}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 font-mono font-bold text-[11px] border border-rose-200 transition-colors"
                              title="Deduct 5 points"
                            >
                              -5
                            </button>
                            <button
                              onClick={() => handleOpenEditScore(t)}
                              className="px-2.5 py-1 rounded-lg bg-[#583FA9] hover:bg-[#4a3294] text-white font-bold text-[11px] flex items-center gap-1 shadow-sm transition-colors"
                              title="Edit team score breakdown"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. MODALS: TEAMS REGISTRATION & MANAGEMENT                     */}
      {/* ------------------------------------------------------------- */}
      {showTeamModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
          <div className="max-w-3xl w-full bg-white text-slate-900 rounded-3xl p-6 sm:p-7 space-y-5 max-h-[88vh] flex flex-col shadow-2xl border border-purple-100">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#583FA9] to-[#7C3AED] text-white flex items-center justify-center shadow-md shadow-purple-950/20">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#1A103C] flex items-center gap-2">
                    Team Registration &amp; Stage Roster
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#ECE8F9] text-[#583FA9]">
                      {teams.length} Teams
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Register competing stage teams with ID, institution, team lead, and login credentials.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTeamModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* REGISTER NEW TEAM INLINE FORM */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#F8F9FE] border border-purple-100 space-y-3.5">
              <span className="text-xs font-bold text-[#583FA9] uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="w-4 h-4" />
                Register New Stage Team
              </span>

              {teamFormError && (
                <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 p-2 rounded-xl font-semibold">
                  {teamFormError}
                </p>
              )}

              <form onSubmit={handleRegisterTeam} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  {/* Team Name */}
                  <div className="sm:col-span-6">
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      Team Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      placeholder="e.g. Brainiacs / Sparks"
                      required
                      className="w-full bg-white border border-slate-200 focus:border-[#583FA9] focus:ring-2 focus:ring-purple-100 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium"
                    />
                  </div>

                  {/* Team ID */}
                  <div className="sm:col-span-3">
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      Team ID
                    </label>
                    <input
                      type="text"
                      value={newTeamCustomId}
                      onChange={(e) => setNewTeamCustomId(e.target.value)}
                      placeholder="e.g. T-01"
                      className="w-full bg-white border border-slate-200 focus:border-[#583FA9] focus:ring-2 focus:ring-purple-100 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono"
                    />
                  </div>

                  {/* Team Number */}
                  <div className="sm:col-span-3">
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      Team # <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={newTeamNumber}
                      onChange={(e) => setNewTeamNumber(e.target.value)}
                      placeholder="1"
                      required
                      className="w-full bg-white border border-slate-200 focus:border-[#583FA9] focus:ring-2 focus:ring-purple-100 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  {/* Institution */}
                  <div className="sm:col-span-5">
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      Team Institution
                    </label>
                    <input
                      type="text"
                      value={newTeamInstitution}
                      onChange={(e) => setNewTeamInstitution(e.target.value)}
                      placeholder="e.g. BUET / Notre Dame College"
                      className="w-full bg-white border border-slate-200 focus:border-[#583FA9] focus:ring-2 focus:ring-purple-100 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium"
                    />
                  </div>

                  {/* Team Lead */}
                  <div className="sm:col-span-4">
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      Team Lead / Captain
                    </label>
                    <input
                      type="text"
                      value={newTeamLead}
                      onChange={(e) => setNewTeamLead(e.target.value)}
                      placeholder="e.g. Tanvir Hasan"
                      className="w-full bg-white border border-slate-200 focus:border-[#583FA9] focus:ring-2 focus:ring-purple-100 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium"
                    />
                  </div>

                  {/* 4-Digit PIN */}
                  <div className="sm:col-span-3">
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      4-Digit PIN <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={newTeamPin}
                      onChange={(e) => setNewTeamPin(e.target.value)}
                      placeholder="1001"
                      required
                      className="w-full bg-white border border-slate-200 focus:border-[#583FA9] focus:ring-2 focus:ring-purple-100 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isCreatingTeam}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#583FA9] hover:bg-[#4a3294] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-purple-900/10 transition-all disabled:opacity-50 mt-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isCreatingTeam ? 'Registering...' : 'Add Team to Stage Roster'}</span>
                </button>
              </form>
            </div>

            {/* TEAMS ROSTER LIST */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {teams.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  No teams registered yet. Use the form above to add your first team.
                </div>
              ) : (
                teams.map((t) => (
                  <div
                    key={t._id || t.id}
                    className="p-3.5 rounded-2xl bg-white border border-slate-200/80 hover:border-purple-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all shadow-sm"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-6 h-6 rounded-lg bg-gradient-to-tr from-[#583FA9] to-[#7C3AED] text-white text-xs font-bold flex items-center justify-center">
                          #{t.teamNumber}
                        </span>
                        {t.teamId && (
                          <span className="px-2 py-0.5 rounded-md bg-[#ECE8F9] text-[#583FA9] font-mono font-bold text-[11px]">
                            {t.teamId}
                          </span>
                        )}
                        <h4 className="text-sm font-extrabold text-slate-900 truncate">
                          {t.teamName}
                        </h4>
                        {t.isConnected ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Connected
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-medium">
                            Offline
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                        {t.institution && (
                          <span className="font-medium text-slate-700">
                            🏛️ {t.institution}
                          </span>
                        )}
                        {t.teamLead && (
                          <span className="font-medium text-slate-700">
                            👤 Lead: <strong>{t.teamLead}</strong>
                          </span>
                        )}
                        <span>
                          PIN: <strong className="text-slate-800 font-mono">{t.pin}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-amber-700 font-mono font-bold px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg">
                        {t.score} pts
                      </span>

                      <button
                        onClick={() => handleOpenEditScore(t)}
                        className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-[#583FA9] text-[11px] font-bold border border-purple-200 flex items-center gap-1 transition-colors"
                        title="Edit score manually"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit Score</span>
                      </button>

                      <button
                        onClick={() => handleForceResetSession(t._id || t.id)}
                        className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-medium transition-colors"
                        title="Reset mobile session"
                      >
                        Reset Session
                      </button>

                      <button
                        onClick={() => handleDeleteTeam(t._id || t.id, t.teamName)}
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs border border-rose-200 transition-colors"
                        title="Delete team"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. QUESTION BANK (create / edit / order / upload media / CSV)  */}
      {/* ------------------------------------------------------------- */}
      {showQuestionModal && (
        <QuestionBankManager
          questions={questions}
          activeQuestionId={activeQuestion?._id}
          adminFetch={adminFetch}
          onClose={() => setShowQuestionModal(false)}
          onChanged={reloadQuestions}
          flashNotice={flashNotice}
        />
      )}

      {/* ============================================================= */}
      {/* EXPANDED AUDIENCE MONITOR (CINEMA PREVIEW MODAL)              */}
      {/* ============================================================= */}
      {isAudienceMonitorExpanded && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 transition-all duration-200"
          onClick={() => setIsAudienceMonitorExpanded(false)}
        >
          <div
            className="w-full max-w-5xl bg-[#160D2E] border-2 border-[#583FA9]/80 rounded-2xl shadow-2xl shadow-purple-950/80 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-4 py-3 bg-[#201442] border-b border-white/10 flex items-center justify-between text-xs sm:text-sm select-none">
              <div className="flex items-center gap-2 font-bold text-white">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <img src="/tv.png" alt="Logo" className="w-4 h-4 object-contain" />
                <span>Audience Stage Monitor • 16:9 Cinema View</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMonitorKey((k) => k + 1)}
                  className="px-2.5 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-white/10"
                  title="Reload Preview"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reload</span>
                </button>
                <a
                  href="/live"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-[#583FA9] hover:bg-[#6b4ec9] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in New Tab</span>
                </a>
                <button
                  onClick={() => setIsAudienceMonitorExpanded(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/10 transition-colors ml-1"
                  title="Close Expanded Preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Preview Body */}
            <div className="p-3 bg-black flex items-center justify-center">
              <ScaledAudiencePreview monitorKey={monitorKey} />
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-2 bg-[#1b1038] border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Real-time WebSocket Stage Feed
              </span>
              <span className="font-mono text-purple-300">1920×1080 Native Cinema Canvas</span>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 7. MANUAL SCORE & LEADERBOARD EDIT MODAL                      */}
      {/* ------------------------------------------------------------- */}
      {editingScoreModal.open && (
        <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white text-slate-900 border border-purple-100 rounded-3xl p-6 shadow-2xl space-y-5 animate-pop">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  <Trophy className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#1A103C]">
                    Manual Score Override
                  </h3>
                  <p className="text-xs text-slate-500">
                    Team #{editingScoreModal.teamNumber} — {editingScoreModal.teamName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingScoreModal((prev) => ({ ...prev, open: false }))}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveScoreModal} className="space-y-4">
              {/* Quick Modifier Buttons */}
              <div className="p-3 rounded-2xl bg-[#F8F9FE] border border-purple-100 space-y-2">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                  Quick Adjust Total Points
                </span>
                <div className="flex items-center gap-2">
                  {[20, 10, 5, -5, -10].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() =>
                        setEditingScoreModal((prev) => ({
                          ...prev,
                          score: Number(prev.score || 0) + amt,
                          buzzer: Number(prev.buzzer || 0) + amt
                        }))
                      }
                      className={`flex-1 py-1.5 rounded-xl font-mono font-bold text-xs transition-colors ${
                        amt > 0
                          ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {amt > 0 ? `+${amt}` : amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Total Score Field */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Total Leaderboard Score
                </label>
                <input
                  type="number"
                  value={editingScoreModal.score}
                  onChange={(e) =>
                    setEditingScoreModal((prev) => ({ ...prev, score: e.target.value }))
                  }
                  required
                  className="w-full bg-slate-50 border-2 border-amber-400 rounded-xl px-4 py-2.5 text-xl font-extrabold text-amber-700 font-mono-numbers focus:outline-none focus:ring-2 focus:ring-amber-200"
                />
              </div>

              {/* Round Score Breakdown */}
              <div className="grid grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    R1: Buzzer
                  </label>
                  <input
                    type="number"
                    value={editingScoreModal.buzzer}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setEditingScoreModal((prev) => ({
                        ...prev,
                        buzzer: val,
                        score: val + Number(prev.audioVisual || 0) + Number(prev.rapidFire || 0)
                      }));
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono-numbers focus:border-[#583FA9]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    R2: AV
                  </label>
                  <input
                    type="number"
                    value={editingScoreModal.audioVisual}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setEditingScoreModal((prev) => ({
                        ...prev,
                        audioVisual: val,
                        score: Number(prev.buzzer || 0) + val + Number(prev.rapidFire || 0)
                      }));
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono-numbers focus:border-[#583FA9]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    R3: Rapid Fire
                  </label>
                  <input
                    type="number"
                    value={editingScoreModal.rapidFire}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setEditingScoreModal((prev) => ({
                        ...prev,
                        rapidFire: val,
                        score: Number(prev.buzzer || 0) + Number(prev.audioVisual || 0) + val
                      }));
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono-numbers focus:border-[#583FA9]"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingScoreModal((prev) => ({ ...prev, open: false }))}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSavingScore}
                  className="px-5 py-2.5 rounded-xl bg-[#583FA9] hover:bg-[#4a3294] text-white font-bold text-xs shadow-md shadow-purple-900/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingScore ? 'Saving...' : 'Apply & Broadcast'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
