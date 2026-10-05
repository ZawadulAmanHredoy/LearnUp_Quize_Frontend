import React, { useState, useEffect } from 'react';
import {
  Radio,
  Server,
  Database,
  Cpu,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Send,
  Layers,
  ArrowRight,
  ShieldCheck,
  Activity
} from 'lucide-react';
import { socket } from './lib/socket';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function App() {
  const [apiHealth, setApiHealth] = useState(null);
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError, setApiError] = useState(null);

  const [socketConnected, setSocketConnected] = useState(socket.connected);
  const [socketId, setSocketId] = useState(socket.id || null);
  const [latency, setLatency] = useState(null);
  const [socketLogs, setSocketLogs] = useState([]);

  const [quizzes, setQuizzes] = useState([]);
  const [quizzesLoading, setQuizzesLoading] = useState(true);

  const [testRoom, setTestRoom] = useState('arena-lobby');
  const [roomJoined, setRoomJoined] = useState(false);

  // 1. Fetch Backend API Health
  const checkApiHealth = async () => {
    setApiLoading(true);
    setApiError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setApiHealth(json.data);
    } catch (err) {
      setApiError(err.message);
      setApiHealth(null);
    } finally {
      setApiLoading(false);
    }
  };

  // 2. Fetch Quizzes
  const fetchQuizzes = async () => {
    setQuizzesLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/quizzes`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setQuizzes(json.data);
      }
    } catch (err) {
      console.error('Failed to load quizzes:', err);
    } finally {
      setQuizzesLoading(false);
    }
  };

  useEffect(() => {
    checkApiHealth();
    fetchQuizzes();

    // 3. Socket.IO Listeners
    function onConnect() {
      setSocketConnected(true);
      setSocketId(socket.id);
      appendLog(`Connected to Socket.IO server (ID: ${socket.id})`);
    }

    function onDisconnect(reason) {
      setSocketConnected(false);
      setSocketId(null);
      setRoomJoined(false);
      appendLog(`Disconnected: ${reason}`);
    }

    function onPong(data) {
      const roundTrip = Date.now() - (data.sentAt || Date.now());
      setLatency(roundTrip);
      appendLog(`Pong received! Roundtrip: ${roundTrip}ms`);
    }

    function onUserJoined(data) {
      appendLog(`User [${data.userName}] joined room: ${data.room}`);
    }

    function onUserLeft(data) {
      appendLog(`User [${data.userName}] left room: ${data.room}`);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('pong', onPong);
    socket.on('user_joined', onUserJoined);
    socket.on('user_left', onUserLeft);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('pong', onPong);
      socket.off('user_joined', onUserJoined);
      socket.off('user_left', onUserLeft);
    };
  }, []);

  const appendLog = (msg) => {
    setSocketLogs((prev) => [
      { id: Math.random().toString(), time: new Date().toLocaleTimeString(), text: msg },
      ...prev.slice(0, 19)
    ]);
  };

  const handlePing = () => {
    if (!socket.connected) return;
    const now = Date.now();
    socket.emit('ping');
    appendLog('Sent ping request to server...');
  };

  const handleToggleRoom = () => {
    if (!socket.connected) return;
    if (roomJoined) {
      socket.emit('leave_room', { room: testRoom, userName: 'Admin-Test' });
      setRoomJoined(false);
    } else {
      socket.emit('join_room', { room: testRoom, userName: 'Admin-Test' });
      setRoomJoined(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Background Glow Accents */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/4 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 -right-40 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                LearnUp Quiz Arena
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                  v1.0.0
                </span>
              </h1>
              <p className="text-xs text-slate-400">Express • React • MongoDB • Socket.IO Architecture</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                checkApiHealth();
                fetchQuizzes();
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all border border-slate-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${apiLoading ? 'animate-spin' : ''}`} />
              Refresh Status
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-8">
        
        {/* Architecture Status Cards */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Card 1: Backend API */}
          <div className="p-5 rounded-2xl glass-panel space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-indigo-400" />
                Express API
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  apiHealth
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${apiHealth ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
                {apiHealth ? 'Active' : 'Offline'}
              </span>
            </div>
            <div>
              <div className="text-xl font-bold text-white tracking-tight">
                {apiHealth ? 'Port 5000' : 'Connection Refused'}
              </div>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {API_URL}
              </p>
            </div>
          </div>

          {/* Card 2: MongoDB */}
          <div className="p-5 rounded-2xl glass-panel space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                MongoDB
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  apiHealth?.database === 'connected'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    apiHealth?.database === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                ></span>
                {apiHealth?.database === 'connected' ? 'Connected' : 'Fallback / Offline'}
              </span>
            </div>
            <div>
              <div className="text-xl font-bold text-white tracking-tight">
                {apiHealth?.database === 'connected' ? 'Mongoose v8' : 'In-Memory Mode'}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {apiHealth?.database === 'connected' ? 'Ready for collections' : 'Start mongod service'}
              </p>
            </div>
          </div>

          {/* Card 3: Socket.IO */}
          <div className="p-5 rounded-2xl glass-panel space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-purple-400" />
                Socket.IO
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  socketConnected
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${socketConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
                {socketConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div>
              <div className="text-xl font-bold text-white tracking-tight">
                {socketConnected ? `${socketId?.slice(0, 8)}...` : 'Not Connected'}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {latency ? `Latency: ${latency}ms` : 'Ready for real-time events'}
              </p>
            </div>
          </div>

          {/* Card 4: Architecture */}
          <div className="p-5 rounded-2xl glass-panel space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                Git Setup
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                sheikh-sa-kib
              </span>
            </div>
            <div>
              <div className="text-xl font-bold text-white tracking-tight">
                Dual Remotes
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Root untracked • 2 repos connected
              </p>
            </div>
          </div>
        </section>

        {/* Realtime Socket Test & Live Console */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Socket.IO Controls */}
          <div className="lg:col-span-1 p-6 rounded-2xl glass-panel space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Radio className="w-5 h-5 text-indigo-400" />
                Real-Time Tester
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Trigger real-time socket events between this React client and the Express backend.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Arena Room Code
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={testRoom}
                    onChange={(e) => setTestRoom(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. room-101"
                  />
                  <button
                    onClick={handleToggleRoom}
                    disabled={!socketConnected}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 ${
                      roomJoined
                        ? 'bg-rose-600 hover:bg-rose-500 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    {roomJoined ? 'Leave' : 'Join'}
                  </button>
                </div>
              </div>

              <div>
                <button
                  onClick={handlePing}
                  disabled={!socketConnected}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all disabled:opacity-50"
                >
                  <Activity className="w-4 h-4 text-emerald-400" />
                  Emit Ping Event (Measure Latency)
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800/80 text-xs text-slate-400 space-y-2">
              <div className="flex justify-between">
                <span>Status:</span>
                <span className={socketConnected ? 'text-emerald-400' : 'text-rose-400'}>
                  {socketConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Socket ID:</span>
                <span className="font-mono text-slate-300 truncate max-w-[150px]">
                  {socketId || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Latency:</span>
                <span className="text-slate-300">
                  {latency !== null ? `${latency} ms` : 'Not tested'}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Live Event Stream */}
          <div className="lg:col-span-2 p-6 rounded-2xl glass-panel flex flex-col h-[340px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Socket.IO Event Stream
              </h2>
              <button
                onClick={() => setSocketLogs([])}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Clear
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-2 font-mono text-xs">
              {socketLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-600">
                  Waiting for socket events...
                </div>
              ) : (
                socketLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 p-2 rounded-lg bg-slate-900/60 border border-slate-800/50">
                    <span className="text-slate-500 shrink-0">[{log.time}]</span>
                    <span className="text-indigo-300 break-all">{log.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Quizzes Overview */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                Available Quiz Arenas
              </h2>
              <p className="text-xs text-slate-400">
                Connected with Express REST endpoints (`/api/v1/quizzes`)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quizzesLoading ? (
              <div className="col-span-full p-8 text-center text-slate-500">
                Loading quiz data...
              </div>
            ) : quizzes.length === 0 ? (
              <div className="col-span-full p-8 text-center text-slate-500 glass-panel rounded-2xl">
                No quizzes found. Create one via `POST /api/v1/quizzes`!
              </div>
            ) : (
              quizzes.map((quiz) => (
                <div
                  key={quiz._id}
                  className="p-5 rounded-2xl glass-panel glass-panel-hover transition-all duration-200 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 font-mono font-bold border border-indigo-500/20">
                      {quiz.code || 'CODE'}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                      {quiz.status}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">{quiz.title}</h3>
                    <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                      {quiz.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                    <span>{quiz.questions?.length || 0} Questions</span>
                    <span className="text-indigo-400 flex items-center gap-1 font-medium cursor-pointer hover:underline">
                      Ready to Launch <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 py-4 px-6 text-center text-xs text-slate-500">
        LearnUp Quiz Architecture • Dual Repository Setup • User: sheikh-sa-kib
      </footer>
    </div>
  );
}
