import React, { useState, useEffect } from 'react';
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
  Sliders,
  UploadCloud,
  ShieldCheck,
  Check,
  X,
  LogOut,
  Key,
  Shield,
  HelpCircle
} from 'lucide-react';
import { socket } from '../lib/socket';

import { apiFetch } from '../lib/config';
import { preloadMedia, subscribeMediaStatus } from '../lib/mediaCache';
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

export default function AdminDashboard() {
  // -------------------------------------------------------------
  // 0. AUTHENTICATION STATE
  // -------------------------------------------------------------
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!localStorage.getItem('admin_token');
  });
  const [adminUser, setAdminUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('admin_user')) || { username: 'admin' };
    } catch {
      return { username: 'admin' };
    }
  });
  const [loginForm, setLoginForm] = useState({ username: 'admin', password: '' });
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

  // Break Config Form
  const [breakType, setBreakType] = useState('INTERMISSION');
  const [breakDuration, setBreakDuration] = useState(15);
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
  const [newTeamNumber, setNewTeamNumber] = useState('');
  const [newTeamPin, setNewTeamPin] = useState('');
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [teamFormError, setTeamFormError] = useState('');

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

  const reloadQuestions = async () => {
    const { json } = await adminFetch('/questions');
    if (json?.success && Array.isArray(json.data)) setQuestions(json.data);
  };

  const applySnapshot = (data) => {
    if (!data) return;
    const state = data.state;
    if (state) {
      setCurrentStage(state.currentStage || 'WELCOME');
      if (STAGE_TO_ROUND[state.currentStage]) setActiveTab(state.currentStage);
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

      const questionsRes = await adminFetch('/questions');
      if (questionsRes.json?.success && Array.isArray(questionsRes.json.data)) {
        setQuestions(questionsRes.json.data);
      }


    } catch (err) {
      console.error('Failed to load initial admin state:', err);
    }
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
      setTeams(updatedTeams);
    }

    function onAdminNotice(data) {
      if (data?.message) flashNotice(data.message);
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
    socket.on('media:manifest', onMediaManifest);
    socket.on('media:projector-status', onProjectorMedia);
    socket.on('questions:updated', onQuestionsUpdated);
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

    return () => {
      socket.off('connect', onConnect);
      socket.off('radar:status', onRadarStatus);
      socket.off('state:sync', onStateSync);
      socket.off('stage:updated', onStageUpdated);
      socket.off('question:presented', onQuestionPresented);
      socket.off('options:updated', onOptionsUpdated);
      socket.off('countdown:tick', onCountdownTick);
      socket.off('buzzer:status', onBuzzerStatus);
      socket.off('buzzer:reset', onBuzzerReset);
      socket.off('buzzer:winner', onBuzzerWinner);
      socket.off('auth:error', onAuthError);
      socket.off('media:manifest', onMediaManifest);
      socket.off('media:projector-status', onProjectorMedia);
      socket.off('questions:updated', onQuestionsUpdated);
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

      if (currentStage === 'ROUND_BUZZER' && activeQuestion && questionSubState.isQuestionVisible) {
        if (e.key === ' ') {
          e.preventDefault();
          const nextHidden = (activeQuestion.options || []).findIndex(
            (_, idx) => !questionSubState.revealedOptions?.includes(idx)
          );
          if (nextHidden !== -1) handleRevealOption(nextHidden);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          handleStartCountdown();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleResetBuzzer();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStage, rfState, activeQuestion, questionSubState]);

  // Stage Switch Handler
  const handleSetStage = (stage) => {
    socket.emit('admin:set-stage', { stage });
    setCurrentStage(stage);
    setActiveTab(stage);
    flashNotice(`Stage changed to ${stage}`);
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
      durationMinutes: breakDuration,
      message: breakMessage
    });
    setCurrentStage('BREAK');
    flashNotice(`${breakType} Break broadcasted to stage`);
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
    if (!newTeamName.trim()) {
      setTeamFormError('Please enter a team name');
      return;
    }
    const num =
      Number(newTeamNumber) ||
      (teams.length > 0 ? Math.max(...teams.map((t) => t.teamNumber || 0)) + 1 : 1);
    const pin = newTeamPin.trim() || String(1000 + num);

    setIsCreatingTeam(true);
    setTeamFormError('');
    try {
      const { json } = await adminFetch('/teams', {
        method: 'POST',
        body: {
          teamName: newTeamName.trim(),
          teamNumber: num,
          pin
        }
      });
      if (json?.success && json.data) {
        setTeams((prev) => [...prev, json.data]);
        setNewTeamName('');
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

  // Countdown button state guard
  const isCountdownDisabled =
    questionSubState.hasCountdownStarted ||
    questionSubState.isCountdownActive ||
    questionSubState.isCountdownDone;

  // -------------------------------------------------------------
  // RENDER: ADMIN AUTHENTICATION GATE
  // -------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0e0720] text-slate-100 flex items-center justify-center p-4 relative overflow-hidden select-none">
        {/* Ambient Glows */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#583FA9]/30 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#7C3AED]/20 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-md w-full glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl relative z-10 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#583FA9] to-[#8B5CF6] mx-auto flex items-center justify-center shadow-lg shadow-[#583FA9]/50">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-2xl font-black text-white font-heading tracking-tight pt-2">
              Quizmaster Control Deck
            </h2>
            <p className="text-xs text-slate-400">
              Authorized personnel only. Enter host credentials to unlock live stage controls.
            </p>
          </div>

          {loginError && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2 animate-shake">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5 uppercase tracking-wider">
                Admin Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                  placeholder="admin"
                  required
                  className="w-full bg-[#160D2E] border border-white/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#583FA9] transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  placeholder="••••••••"
                  required
                  className="w-full bg-[#160D2E] border border-white/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#583FA9] transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#583FA9] to-[#7C3AED] hover:from-[#664ec2] hover:to-[#8b5cf6] text-white font-extrabold text-sm shadow-lg shadow-[#583FA9]/40 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
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
    <div className="min-h-screen bg-[#0e0720] text-slate-100 flex flex-col select-none">
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP HEADER & CONNECTION RADAR                               */}
      {/* ------------------------------------------------------------- */}
      <header className="px-6 py-4 border-b border-white/10 bg-[#160D2E]/90 backdrop-blur-md flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#583FA9] flex items-center justify-center font-bold text-white shadow-md">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white font-heading tracking-tight flex items-center gap-2">
              Quizmaster Control Deck
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#583FA9]/30 text-[#E0D7FE] border border-[#583FA9]/50 font-mono">
                HOST: {adminUser?.username || 'admin'}
              </span>
            </h1>
            <p className="text-xs text-[#E0D7FE]">Centralized Live Stage Operator</p>
          </div>
        </div>

        {/* CONNECTION RADAR */}
        <div className="hidden lg:flex items-center gap-3">
          {/* Projector Radar */}
          <div
            className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-2 ${
              radar.isProjectorConnected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
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
              className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-2 ${
                mediaSummary.allReady
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
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
          <div className="px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs flex items-center gap-2">
            <Users className="w-3.5 h-3.5" />
            <span>
              Teams Online: {radar.connectedTeams?.length || 0} / {teams.length}
            </span>
          </div>
        </div>

        {/* Action Controls & Logout */}
        <div className="flex items-center gap-2">
          {actionNotice && (
            <span className="text-xs font-semibold px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pop">
              {actionNotice}
            </span>
          )}

          <button
            onClick={handleResetEvent}
            className="px-3 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Event
          </button>

          <button
            onClick={handleAdminLogout}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Log out of host deck"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* ------------------------------------------------------------- */}
      {/* 2. MAIN LAYOUT: SIDEBAR + STAGE DECK                           */}
      {/* ------------------------------------------------------------- */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* SIDEBAR NAVIGATION */}
        <aside className="w-full md:w-64 border-r border-white/10 bg-[#160D2E]/50 p-4 space-y-6 shrink-0 overflow-y-auto">
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
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      isCurrent
                        ? 'bg-[#583FA9] text-white shadow-md shadow-[#583FA9]/40 glow-purple font-bold'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
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
          <div className="pt-4 border-t border-white/10 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1 px-2">
              Event Management
            </span>
            <button
              onClick={() => setShowQuestionModal(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors border border-white/5"
            >
              <Sliders className="w-4 h-4 text-purple-400" />
              <span>Questions Bank ({questions.length})</span>
            </button>
            <button
              onClick={() => {
                if (teams.length > 0 && !newTeamNumber) {
                  const maxNum = Math.max(...teams.map((t) => t.teamNumber || 0));
                  setNewTeamNumber(String(maxNum + 1));
                  setNewTeamPin(String(1000 + maxNum + 1));
                }
                setShowTeamModal(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors border border-white/5"
            >
              <Users className="w-4 h-4 text-emerald-400" />
              <span>Teams & Register ({teams.length})</span>
            </button>
            <button
              onClick={handleSeedDemoData}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors border border-white/5"
            >
              <RefreshCw className="w-4 h-4 text-amber-400" />
              <span>Re-seed Demo Data</span>
            </button>
          </div>
        </aside>

        {/* MAIN CONTROLLER DECK */}
        <main className="flex-1 p-6 overflow-y-auto space-y-6">
          {/* ========================================================= */}
          {/* DECK: ROUND 1 — BUZZER BATTLE CONTROLLER                  */}
          {/* ========================================================= */}
          {currentStage === 'ROUND_BUZZER' && (
            <div className="space-y-6">
              {/* Question Selection Bar */}
              <div className="glass-panel p-5 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Zap className="w-4 h-4 text-[#583FA9]" />
                    Question Navigator ({filteredBuzzerQuestions.length} Buzzer Questions)
                  </h3>
                  <button
                    onClick={handleNextQuestion}
                    className="px-3.5 py-2 rounded-xl bg-[#583FA9] hover:bg-[#684ec2] text-xs font-bold text-white transition-all shadow-md flex items-center gap-1.5"
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
                          ? 'bg-[#583FA9] text-white shadow-lg glow-purple'
                          : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
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
                  <div className="lg:col-span-2 glass-panel p-6 rounded-2xl space-y-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>QUESTION #{currentQuestionIndex + 1}</span>
                        <span className="text-emerald-400 font-bold">
                          +{activeQuestion.points ?? 10} / -{activeQuestion.negativePoints ?? 5} PTS
                        </span>
                      </div>
                      <h2 className="text-xl font-bold text-white font-heading">
                        {activeQuestion.questionText}
                      </h2>
                    </div>

                    {/* QUIZMASTER VERDICT GUIDE BANNER (HOST-ONLY PREVIEW) */}
                    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 block">
                            Quizmaster Verdict Guide (Answer Key):
                          </span>
                          <span className="text-sm font-bold text-white">
                            Option {String.fromCharCode(65 + (activeQuestion.correctOptionIndex ?? 0))}:{' '}
                            <span className="text-emerald-300 underline underline-offset-2">
                              {activeQuestion.options?.[activeQuestion.correctOptionIndex]?.text || 'N/A'}
                            </span>
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-bold">
                        HOST CONFIDENTIAL
                      </span>
                    </div>

                    {/* Staggered Option Reveal Controls */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Options Reveal Controls:
                        </span>
                        <button
                          onClick={handleRevealAllOptions}
                          className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-all"
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
                          const isCorrect = activeQuestion.correctOptionIndex === idx;

                          return (
                            <div
                              key={idx}
                              onClick={() => handleLockAnswer(idx)}
                              className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                                isSelected
                                  ? 'bg-amber-500/20 border-amber-400 text-white glow-amber'
                                  : isCorrect
                                  ? 'bg-emerald-950/40 border-emerald-500/60 text-white hover:border-emerald-400'
                                  : isRevealed
                                  ? 'bg-white/5 border-white/20 text-white hover:border-white/40'
                                  : 'bg-white/5 border-white/5 text-slate-500'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className={`w-8 h-8 rounded-lg font-bold flex items-center justify-center text-xs ${
                                    isCorrect ? 'bg-emerald-600 text-white shadow-md' : 'bg-[#583FA9] text-white'
                                  }`}
                                >
                                  {opt.label}
                                </span>
                                <div>
                                  <span className="text-sm font-semibold block">{opt.text}</span>
                                  {isCorrect && (
                                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 mt-0.5">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                      ✓ Correct Answer (Verdict Guide)
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {!isRevealed ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRevealOption(idx);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold text-white"
                                  >
                                    Reveal
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-emerald-400 font-bold">
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
                    <div className="pt-4 border-t border-white/10 flex flex-wrap gap-3">
                      <button
                        onClick={handleStartCountdown}
                        disabled={isCountdownDisabled}
                        className={`flex-1 py-3 px-4 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition-all ${
                          isCountdownDisabled
                            ? 'bg-slate-800/80 border border-slate-700 text-slate-500 cursor-not-allowed'
                            : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black shadow-lg shadow-amber-500/30'
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
                        className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
                      >
                        Reset Buzzer
                      </button>
                    </div>
                  </div>

                  {/* Right Column: Buzzer Lockout & Evaluation */}
                  <div className="glass-panel p-6 rounded-2xl space-y-6">
                    <div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">
                        Buzzer & Evaluation Deck
                      </h3>
                      <p className="text-xs text-slate-400">
                        When a team buzzes in, select their spoken option and render the verdict.
                      </p>
                    </div>

                    {/* Buzzer Status Banner */}
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Live Buzzer State
                      </span>
                      {questionSubState.buzzerLockedBy ? (
                        <div className="p-3 rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-300 font-bold text-sm flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                          <span>LOCKED BY: {questionSubState.buzzerLockedBy.teamName}</span>
                        </div>
                      ) : questionSubState.isBuzzerOpen ? (
                        <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-sm flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>BUZZER UNLOCKED — WAITING FOR TAP</span>
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-400 text-xs">
                          Buzzer Locked (Trigger countdown to open)
                        </div>
                      )}
                    </div>

                    {/* Official Correct Answer in Evaluation Deck */}
                    <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs space-y-1">
                      <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Host Verdict Reference:
                      </div>
                      <div className="text-sm text-white font-bold pl-5">
                        Option {String.fromCharCode(65 + (activeQuestion.correctOptionIndex ?? 0))} —{' '}
                        <span className="text-emerald-300">
                          {activeQuestion.options?.[activeQuestion.correctOptionIndex]?.text || 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Evaluation Buttons */}
                    <div className="space-y-3 pt-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                        Spoken Answer Evaluation:
                      </span>

                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => handleEvaluate(true)}
                          disabled={!questionSubState.buzzerLockedBy || questionSubState.isEvaluated}
                          className="py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Check className="w-4 h-4" />
                          Correct (+{activeQuestion.points ?? 10})
                        </button>

                        <button
                          onClick={() => handleEvaluate(false)}
                          disabled={!questionSubState.buzzerLockedBy || questionSubState.isEvaluated}
                          className="py-3.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <X className="w-4 h-4" />
                          Wrong (-{activeQuestion.negativePoints ?? 5})
                        </button>
                      </div>

                      <p className="text-[11px] text-slate-400 text-center italic">
                        {questionSubState.isEvaluated
                          ? `Evaluated: ${questionSubState.isCorrect ? 'correct' : 'wrong'}. Move to the next question.`
                          : '⚠️ No-Reopen Rule: If wrong, question concludes immediately.'}
                      </p>
                      <p className="text-[10px] text-slate-500 text-center font-mono">
                        Hotkeys: Space reveal next option · Enter countdown · Esc reset buzzer
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* DECK: ROUND 2 — AUDIO-VISUAL CONTROLLER                   */}
          {/* ========================================================= */}
          {currentStage === 'ROUND_AV' && (
            <div className="glass-panel p-6 rounded-2xl space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Tv className="w-5 h-5 text-sky-400" />
                    Audio-Visual Round Command Deck
                  </h3>
                  <p className="text-xs text-slate-400">
                    Remote control stage video/audio playback and score turn-based teams.
                  </p>
                </div>
              </div>

              {/* AV Question Selector (media-first) */}
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-300 block">
                  1. Load a clip on stage (question stays hidden until you show it):
                </span>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {filteredAvQuestions.map((q, idx) => (
                    <button
                      key={q._id || q.id}
                      onClick={() => handleSelectQuestion(q, idx)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-all ${
                        activeQuestion && (activeQuestion._id || activeQuestion.id) === (q._id || q.id)
                          ? 'bg-sky-600 text-white shadow-lg'
                          : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      AV #{idx + 1} · {q.mediaType}
                      <span className="ml-1.5" title="Downloaded on the projector?">
                        {clipReadyOnProjector(q.mediaId) ? '✅' : '⏳'}
                      </span>
                    </button>
                  ))}
                  {filteredAvQuestions.length === 0 && (
                    <span className="text-xs text-slate-500">No audio-visual questions in the bank.</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span>
                    Clips downloaded — this laptop: {mediaSummary.localReady}/{mediaSummary.total} · projector:{' '}
                    {projectorMedia.length ? `${mediaSummary.projectorReady}/${mediaSummary.total}` : 'not connected'}
                    {mediaSummary.allReady && ' · ✅ ready to play without buffering'}
                  </span>
                  <button
                    onClick={handleRedownloadMedia}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-semibold"
                  >
                    Re-download clips
                  </button>
                </div>
              </div>

              {/* Media Remote Controls */}
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Projector Media Remote Controls:
                </span>
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
                    className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 border border-slate-700"
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </button>
                  <button
                    onClick={() => handleMediaControl('replay')}
                    className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 border border-slate-700"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Replay from Start
                  </button>
                  <button
                    onClick={() => handleMediaControl('mute')}
                    className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 border border-slate-700"
                  >
                    <VolumeX className="w-4 h-4" />
                    Mute
                  </button>
                  <button
                    onClick={() => handleMediaControl('unmute')}
                    className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 border border-slate-700"
                  >
                    <Volume2 className="w-4 h-4" />
                    Unmute
                  </button>
                </div>
              </div>

              {/* Turn-Based Team Rotation */}
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                  2. Designate Active Team's Turn:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {teams.map((t) => (
                    <button
                      key={t._id || t.id}
                      onClick={() => handleSetAvTurn(t._id || t.id)}
                      className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                        avActiveTeamId === (t._id || t.id)
                          ? 'bg-amber-500 text-black border-amber-400 shadow-md glow-amber'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {t.teamName}
                    </button>
                  ))}
                </div>
              </div>

              {/* Show Question & Evaluate */}
              {activeQuestion && activeQuestion.roundType === 'AUDIO_VISUAL' && (
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                      3. Question, answer key & verdict:
                    </span>
                    <button
                      onClick={handleShowAvQuestion}
                      disabled={questionSubState.isQuestionVisible}
                      className="px-4 py-2 rounded-xl bg-[#583FA9] hover:bg-[#684ec2] text-white text-xs font-bold flex items-center gap-2 disabled:opacity-40"
                    >
                      <Eye className="w-4 h-4" />
                      {questionSubState.isQuestionVisible ? 'Question Shown on Stage' : 'Show Question & Options'}
                    </button>
                  </div>

                  <h4 className="text-base font-bold text-white">{activeQuestion.questionText}</h4>
                  <div className="text-sm text-emerald-300 font-bold">
                    Answer: Option {String.fromCharCode(65 + (activeQuestion.correctOptionIndex ?? 0))} —{' '}
                    {activeQuestion.options?.[activeQuestion.correctOptionIndex]?.text || 'N/A'}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleEvaluate(true)}
                      disabled={!avActiveTeamId || questionSubState.isEvaluated}
                      className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Check className="w-4 h-4" />
                      Correct (+{activeQuestion.points ?? 15})
                    </button>
                    <button
                      onClick={() => handleEvaluate(false)}
                      disabled={!avActiveTeamId || questionSubState.isEvaluated}
                      className="py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <X className="w-4 h-4" />
                      Wrong ({activeQuestion.negativePoints ? `-${activeQuestion.negativePoints}` : '0'})
                    </button>
                  </div>
                  {!avActiveTeamId && (
                    <p className="text-[11px] text-amber-300 text-center">Designate the team whose turn it is before scoring.</p>
                  )}
                  {questionSubState.isEvaluated && (
                    <p className="text-[11px] text-slate-400 text-center">
                      Evaluated: {questionSubState.isCorrect ? 'correct' : 'wrong'}. Load the next clip.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* DECK: ROUND 3 — RAPID FIRE CONTROLLER                     */}
          {/* ========================================================= */}
          {currentStage === 'ROUND_RAPID_FIRE' && (
            <div className="glass-panel p-6 rounded-2xl space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Flame className="w-5 h-5 text-rose-500" />
                    60-Second Rapid Fire Command Deck
                  </h3>
                  <p className="text-xs text-slate-400">
                    Host accelerator pad: Use keyboard keys [Z] Correct, [X] Wrong, [C] Pass for instant transitions.
                  </p>
                </div>

                <div className="text-right font-mono-numbers">
                  <span className="text-3xl font-black text-amber-400">
                    {rfState.secondsRemaining}s
                  </span>
                  <span className="text-[10px] text-slate-400 block">REMAINING</span>
                </div>
              </div>

              {/* Team Selector & Start Button */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Select Team for Hot Seat:
                  </label>
                  <select
                    value={rfTeamId}
                    onChange={(e) => setRfTeamId(e.target.value)}
                    className="w-full bg-[#160D2E] border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#583FA9]"
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
                      className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm border border-slate-700"
                    >
                      Stop Clock
                    </button>
                  )}
                  <button
                    onClick={handleStartRapidFire}
                    disabled={rfState.isActive}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:opacity-95 text-white font-bold text-sm shadow-lg shadow-rose-600/30 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    Start 60s Rapid Fire Clock
                  </button>
                </div>
              </div>

              {/* Current question (host view, with answer) */}
              {activeQuestion && activeQuestion.roundType === 'RAPID_FIRE' && (
                <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>NOW ON STAGE</span>
                    <span className="font-mono-numbers">
                      ✓ {rfState.stats.correct} · ✗ {rfState.stats.wrong} · ↷ {rfState.stats.pass}
                    </span>
                  </div>
                  <h4 className="text-lg font-bold text-white">{activeQuestion.questionText}</h4>
                  <div className="text-sm text-emerald-300 font-bold">
                    Answer: {activeQuestion.options?.[activeQuestion.correctOptionIndex]?.text || 'N/A'}
                  </div>
                </div>
              )}

              {/* 3 GIANT TOUCH / HOTKEY ACCELERATOR PADS */}
              <div className="grid grid-cols-3 gap-4 pt-4">
                <button
                  onClick={() => handleRapidFireAction('CORRECT')}
                  disabled={!rfState.isActive}
                  className="py-12 rounded-2xl bg-gradient-to-b from-emerald-600 to-emerald-800 text-white font-extrabold flex flex-col items-center justify-center gap-2 shadow-xl shadow-emerald-600/40 glow-mint active:scale-95 transition-all disabled:opacity-40"
                >
                  <Check className="w-8 h-8" />
                  <span className="text-xl sm:text-2xl font-heading">[Z] CORRECT (+1)</span>
                </button>

                <button
                  onClick={() => handleRapidFireAction('WRONG')}
                  disabled={!rfState.isActive}
                  className="py-12 rounded-2xl bg-gradient-to-b from-rose-600 to-rose-800 text-white font-extrabold flex flex-col items-center justify-center gap-2 shadow-xl shadow-rose-600/40 glow-rose active:scale-95 transition-all disabled:opacity-40"
                >
                  <X className="w-8 h-8" />
                  <span className="text-xl sm:text-2xl font-heading">[X] WRONG (0)</span>
                </button>

                <button
                  onClick={() => handleRapidFireAction('PASS')}
                  disabled={!rfState.isActive}
                  className="py-12 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-extrabold flex flex-col items-center justify-center gap-2 border border-slate-700 active:scale-95 transition-all disabled:opacity-40"
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
            <div className="glass-panel p-6 rounded-2xl space-y-6 max-w-2xl">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Coffee className="w-5 h-5 text-amber-400" />
                  Dynamic Break Screens Deck
                </h3>
                <p className="text-xs text-slate-400">
                  Select the intermission theme and broadcast it to the audience screen.
                </p>
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
                    className={`p-4 rounded-xl border text-center space-y-2 transition-all ${
                      breakType === b.id
                        ? 'bg-[#583FA9] border-[#583FA9] text-white shadow-lg'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                    }`}
                  >
                    <b.icon className="w-6 h-6 mx-auto" />
                    <span className="text-xs font-bold block">{b.label}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={breakDuration}
                    onChange={(e) => setBreakDuration(Number(e.target.value))}
                    className="w-full bg-[#160D2E] border border-white/15 rounded-xl px-4 py-2 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Custom Message (Optional)
                  </label>
                  <input
                    type="text"
                    value={breakMessage}
                    onChange={(e) => setBreakMessage(e.target.value)}
                    placeholder="e.g. We will resume with Round 2 shortly!"
                    className="w-full bg-[#160D2E] border border-white/15 rounded-xl px-4 py-2 text-sm text-white"
                  />
                </div>

                <button
                  onClick={handleBroadcastBreak}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-bold text-sm shadow-lg shadow-amber-500/30"
                >
                  Broadcast Break to Projector
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* DECK: LEADERBOARD & WINNER                                */}
          {/* ========================================================= */}
          {(currentStage === 'LEADERBOARD' || currentStage === 'FINAL_WINNER') && (
            <div className="glass-panel p-6 rounded-2xl space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-400" />
                    Leaderboard & Championship Ceremony
                  </h3>
                  <p className="text-xs text-slate-400">
                    Live team standings and celebratory champion coronation.
                  </p>
                </div>

                <button
                  onClick={() => socket.emit('admin:announce-winner')}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 text-black font-extrabold text-sm shadow-xl shadow-amber-400/40 glow-gold flex items-center gap-2"
                >
                  <Award className="w-4 h-4" />
                  Crown Champion & Confetti
                </button>
              </div>

              {/* Roster Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="border-b border-white/10 text-slate-400 uppercase">
                    <tr>
                      <th className="py-3 px-4">Rank</th>
                      <th className="py-3 px-4">Team</th>
                      <th className="py-3 px-4">Buzzer Pts</th>
                      <th className="py-3 px-4">AV Pts</th>
                      <th className="py-3 px-4">Rapid Fire Pts</th>
                      <th className="py-3 px-4 text-right">Total Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {teams.map((t, idx) => (
                      <tr key={t._id || t.id} className="hover:bg-white/5">
                        <td className="py-3 px-4 font-bold text-amber-400">#{idx + 1}</td>
                        <td className="py-3 px-4 font-bold text-white">{t.teamName}</td>
                        <td className="py-3 px-4 font-mono-numbers">{t.roundScores?.buzzer || 0}</td>
                        <td className="py-3 px-4 font-mono-numbers">{t.roundScores?.audioVisual || 0}</td>
                        <td className="py-3 px-4 font-mono-numbers">{t.roundScores?.rapidFire || 0}</td>
                        <td className="py-3 px-4 text-right font-bold text-amber-300 font-mono-numbers text-sm">
                          {t.score} PTS
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="max-w-2xl w-full glass-panel p-6 rounded-3xl space-y-5 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                Team Registration & Stage Roster ({teams.length} Teams)
              </h3>
              <button
                onClick={() => setShowTeamModal(false)}
                className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* REGISTER NEW TEAM INLINE FORM */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
                + Register New Stage Team
              </span>

              {teamFormError && (
                <p className="text-xs text-rose-400 font-semibold">{teamFormError}</p>
              )}

              <form onSubmit={handleRegisterTeam} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-5">
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Team Name</label>
                  <input
                    type="text"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="e.g. Team Phoenix"
                    required
                    className="w-full bg-[#160D2E] border border-white/15 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Team #</label>
                  <input
                    type="number"
                    value={newTeamNumber}
                    onChange={(e) => setNewTeamNumber(e.target.value)}
                    placeholder="7"
                    required
                    className="w-full bg-[#160D2E] border border-white/15 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">4-Digit PIN</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={newTeamPin}
                    onChange={(e) => setNewTeamPin(e.target.value)}
                    placeholder="1007"
                    required
                    className="w-full bg-[#160D2E] border border-white/15 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={isCreatingTeam}
                    className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-md transition-all disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </form>
            </div>

            {/* TEAMS ROSTER LIST */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {teams.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  No teams registered yet. Use the form above to add your first team.
                </div>
              ) : (
                teams.map((t) => (
                  <div
                    key={t._id || t.id}
                    className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between hover:bg-white/10 transition-colors"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        #{t.teamNumber} — {t.teamName}
                        {t.isConnected && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Connected" />
                        )}
                      </h4>
                      <span className="text-xs text-slate-400">
                        Access PIN: <strong className="text-amber-300 font-mono font-bold">{t.pin}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-400 font-mono font-bold px-2 py-1 bg-amber-500/10 rounded-lg">
                        {t.score} pts
                      </span>

                      <button
                        onClick={() => handleForceResetSession(t._id || t.id)}
                        className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 text-[11px] font-semibold transition-colors"
                        title="Reset mobile session"
                      >
                        Reset Session
                      </button>

                      <button
                        onClick={() => handleDeleteTeam(t._id || t.id, t.teamName)}
                        className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs border border-rose-500/30 transition-colors"
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
      {/* 4. QUESTION BANK EDITOR (create / edit / order / upload media) */}
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
    </div>
  );
}
