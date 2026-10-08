import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Pencil,
  ArrowUp,
  ArrowDown,
  UploadCloud,
  Download,
  FileJson,
  FileText,
  Film,
  Music,
  Image as ImageIcon,
  Check,
  AlertTriangle,
  Info,
  RefreshCw
} from 'lucide-react';
import { API_URL } from '../lib/config';
import { parseCSV, rowsToQuestions, getSampleCsvTemplate } from '../lib/csvParser';

const ROUNDS = [
  { id: 'BUZZER', label: 'Round 1: Buzzer Battle', hint: 'Speed buzzer questions with a penalty for wrong answers.' },
  { id: 'AUDIO_VISUAL', label: 'Round 2: Audio-Visual', hint: 'Video, audio or image clue first; the question and options are revealed after it.' },
  { id: 'RAPID_FIRE', label: 'Round 3: Rapid Fire', hint: '60-second hot-seat questions.' }
];

// Same defaults the server applies (Rules.md)
const ROUND_DEFAULTS = {
  BUZZER: { points: 10, negativePoints: 5, timeLimitSeconds: 30 },
  AUDIO_VISUAL: { points: 15, negativePoints: 0, timeLimitSeconds: 30 },
  RAPID_FIRE: { points: 1, negativePoints: 0, timeLimitSeconds: 10 }
};

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;
const ACCEPTED_MEDIA = 'video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,image/jpeg,image/png,image/webp,image/gif,.mp4,.webm,.mov,.m4v,.mp3,.wav,.ogg,.m4a,.aac,.jpg,.jpeg,.png,.webp,.gif';
const LARGE_FILE_BYTES = 100 * 1024 * 1024;

const MEDIA_ICONS = { VIDEO: Film, AUDIO: Music, IMAGE: ImageIcon };

const INPUT_CLASS =
  'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#583FA9] focus:bg-white transition-all';
const SECONDARY_BUTTON =
  'px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-40';

function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function roundLabel(roundType) {
  return ROUNDS.find((r) => r.id === roundType)?.label || roundType;
}

function fileNameOf(ref) {
  return String(ref || '').split(/[\\/]/).pop().trim().toLowerCase();
}

function downloadFile(content, fileName, type) {
  const blob = new Blob([content], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

function emptyForm(roundType) {
  return {
    _id: null,
    roundType,
    questionText: '',
    options: ['', '', '', ''],
    correctOptionIndex: 0,
    ...ROUND_DEFAULTS[roundType],
    explanation: '',
    mediaType: roundType === 'AUDIO_VISUAL' ? 'VIDEO' : 'NONE',
    mediaId: null,
    media: null
  };
}

function formFromQuestion(q, mediaById) {
  return {
    _id: q._id,
    roundType: q.roundType,
    questionText: q.questionText || '',
    options: (q.options || []).map((o) => o.text),
    correctOptionIndex: q.correctOptionIndex ?? 0,
    points: q.points,
    negativePoints: q.negativePoints,
    timeLimitSeconds: q.timeLimitSeconds,
    explanation: q.explanation || '',
    mediaType: q.mediaType || 'NONE',
    mediaId: q.mediaId || null,
    media: q.mediaId ? mediaById[q.mediaId] || { id: q.mediaId, url: `/media/${q.mediaId}`, mediaType: q.mediaType } : null
  };
}

/**
 * Upload with progress (fetch can't report upload progress)
 */
function uploadWithProgress(file, token, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/v1/media`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let json = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch (err) {}
      if (xhr.status >= 200 && xhr.status < 300 && json?.success) resolve(json.data);
      else reject(new Error(json?.error || `Upload failed (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

function MediaPreview({ media }) {
  if (!media) return null;
  const src = `${API_URL}${media.url}`;
  if (media.mediaType === 'VIDEO') {
    return <video src={src} controls preload="metadata" className="w-full max-h-56 rounded-xl bg-black" />;
  }
  if (media.mediaType === 'AUDIO') {
    return <audio src={src} controls preload="metadata" className="w-full" />;
  }
  return <img src={src} alt="Visual clue" className="max-h-56 rounded-xl mx-auto bg-slate-100" />;
}

/**
 * Small confirmation / notice dialog on top of the question bank
 */
function Dialog({ tone = 'info', title, subtitle, children, actions }) {
  const isDanger = tone === 'danger';
  const Icon = isDanger ? AlertTriangle : Info;
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className={`max-w-md w-full bg-white text-slate-900 border rounded-3xl p-6 shadow-2xl space-y-4 animate-pop ${
          isDanger ? 'border-rose-200' : 'border-purple-100'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${
              isDanger ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-[#ECE8F9] text-[#583FA9] border-purple-200'
            }`}
          >
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-[#1A103C]">{title}</h3>
            {subtitle && (
              <span className={`text-[11px] font-bold ${isDanger ? 'text-rose-600' : 'text-[#583FA9]'}`}>{subtitle}</span>
            )}
          </div>
        </div>
        {children}
        <div className="flex gap-3 pt-2">{actions}</div>
      </div>
    </div>
  );
}

export default function QuestionBankManager({ questions, activeQuestionId, adminFetch, onClose, onChanged, flashNotice }) {
  const [round, setRound] = useState('BUZZER');
  const [form, setForm] = useState(null); // null = list view
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [library, setLibrary] = useState([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [listError, setListError] = useState('');
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [notice, setNotice] = useState(null); // { title, message, details }
  const [confirmDeleteRound, setConfirmDeleteRound] = useState(false);
  const importInputRef = useRef(null);
  const csvInputRef = useRef(null);

  const roundQuestions = useMemo(
    () => questions.filter((q) => q.roundType === round).sort((a, b) => (a.order || 0) - (b.order || 0)),
    [questions, round]
  );
  const mediaById = useMemo(() => Object.fromEntries(library.map((m) => [m.id, m])), [library]);
  const roundInfo = ROUNDS.find((r) => r.id === round);

  const loadLibrary = async () => {
    const { json } = await adminFetch('/media');
    if (json?.success) setLibrary(json.data);
    return json?.success ? json.data : library;
  };

  useEffect(() => {
    loadLibrary();
  }, []);

  const counts = useMemo(() => {
    const c = { BUZZER: 0, AUDIO_VISUAL: 0, RAPID_FIRE: 0 };
    questions.forEach((q) => {
      c[q.roundType] = (c[q.roundType] || 0) + 1;
    });
    return c;
  }, [questions]);

  // -------------------------------------------------------------
  // List actions
  // -------------------------------------------------------------
  const handleMove = async (idx, delta) => {
    const ids = roundQuestions.map((q) => q._id);
    const target = idx + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
    const { json } = await adminFetch('/questions/reorder', { method: 'PUT', body: { roundType: round, orderedIds: ids } });
    if (!json?.success) setListError(json?.error || 'Could not reorder');
    onChanged();
  };

  const handleDelete = async (q) => {
    if (!window.confirm(`Delete this question?\n\n"${q.questionText}"`)) return;
    const { json } = await adminFetch(`/questions/${q._id}`, { method: 'DELETE' });
    if (json?.success) {
      flashNotice('Question deleted');
      onChanged();
    } else {
      setListError(json?.error || 'Could not delete the question');
    }
  };

  const handleDeleteRound = async () => {
    setConfirmDeleteRound(false);
    const { json } = await adminFetch(`/questions/round/${round}`, { method: 'DELETE' });
    if (json?.success) {
      flashNotice(`Deleted ${json.count} question(s) from ${roundLabel(round)}`);
      onChanged();
    } else {
      setListError(json?.error || 'Could not delete the round');
    }
  };

  const handleExport = async () => {
    const { json, ok } = await adminFetch('/questions/export');
    if (!ok || !Array.isArray(json)) {
      setListError('Export failed');
      return;
    }
    downloadFile(JSON.stringify(json, null, 2), `learnup-questions-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const list = Array.isArray(parsed) ? parsed : parsed.questions;
      if (!Array.isArray(list)) throw new Error('The file must contain an array of questions');
      if (!window.confirm(`Add ${list.length} question(s) from ${file.name}?`)) return;
      const { json } = await adminFetch('/questions/bulk', { method: 'POST', body: { questions: list } });
      if (json?.success) {
        flashNotice(`Imported ${json.count} question(s)`);
        onChanged();
      } else {
        setListError(json?.error || 'Import failed');
      }
    } catch (err) {
      setListError(`Import failed: ${err.message}`);
    }
  };

  /**
   * Add the questions in a CSV to the selected round. Questions already in
   * the round (same text) are skipped. Audio-visual rows name their clip by
   * file name; the clip must already be in the media library.
   */
  const handleImportCsv = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setListError('');
    setIsImportingCsv(true);
    try {
      const parsed = rowsToQuestions(parseCSV(await file.text()), round);
      if (parsed.length === 0) {
        setListError('No questions found in the CSV. Download the sample CSV to see the expected columns.');
        return;
      }

      const seen = new Set(roundQuestions.map((q) => q.questionText.trim().toLowerCase()));
      const fresh = [];
      let duplicates = 0;
      for (const q of parsed) {
        const key = q.questionText.trim().toLowerCase();
        if (seen.has(key)) {
          duplicates += 1;
        } else {
          seen.add(key);
          fresh.push(q);
        }
      }

      if (fresh.length === 0) {
        setNotice({
          title: 'Nothing new to add',
          message: `All ${duplicates} question(s) in "${file.name}" are already in ${roundLabel(round)}.`,
          details: 'Duplicates are skipped so the same question is never asked twice.'
        });
        return;
      }

      // Link audio-visual rows to uploaded clips by file name
      if (round === 'AUDIO_VISUAL') {
        const assets = await loadLibrary();
        const byName = new Map(assets.map((m) => [m.originalName.toLowerCase(), m]));
        const missing = new Set();
        for (const q of fresh) {
          if (/^https:\/\//i.test(q.mediaUrl || '')) continue;
          const asset = byName.get(fileNameOf(q.mediaUrl));
          if (asset) {
            q.mediaId = asset.id;
            q.mediaType = asset.mediaType;
            q.mediaUrl = null;
          } else {
            missing.add(q.mediaUrl || '(no file named)');
          }
        }
        if (missing.size > 0) {
          setNotice({
            title: 'Upload the clips first',
            message: `These files from the CSV are not in the media library yet: ${[...missing].join(', ')}.`,
            details: 'Add them with New Question → Upload file (you can cancel the question afterwards), then import the CSV again. Nothing was imported.'
          });
          return;
        }
      }

      const { json } = await adminFetch('/questions/bulk', { method: 'POST', body: { questions: fresh } });
      if (!json?.success) {
        setListError(json?.error || 'Import failed');
        return;
      }
      onChanged();
      if (duplicates > 0) {
        setNotice({
          title: 'Questions added',
          message: `Added ${json.count} new question(s) to ${roundLabel(round)}.`,
          details: `${duplicates} question(s) were already in this round and were skipped.`
        });
      } else {
        flashNotice(`Added ${json.count} question(s) to ${roundLabel(round)}`);
      }
    } catch (err) {
      setListError(`Could not read the CSV: ${err.message}`);
    } finally {
      setIsImportingCsv(false);
    }
  };

  const handleDownloadTemplate = () => {
    downloadFile(getSampleCsvTemplate(round), `LearnUp_${round.toLowerCase()}_sample_questions.csv`, 'text/csv;charset=utf-8;');
  };

  // -------------------------------------------------------------
  // Form actions
  // -------------------------------------------------------------
  const updateForm = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const updateOption = (idx, text) => {
    setForm((prev) => {
      const options = [...prev.options];
      options[idx] = text;
      return { ...prev, options };
    });
  };

  const addOption = () => {
    setForm((prev) => (prev.options.length >= MAX_OPTIONS ? prev : { ...prev, options: [...prev.options, ''] }));
  };

  const removeOption = (idx) => {
    setForm((prev) => {
      if (prev.options.length <= MIN_OPTIONS) return prev;
      const options = prev.options.filter((_, i) => i !== idx);
      let correct = prev.correctOptionIndex;
      if (idx === correct) correct = 0;
      else if (idx < correct) correct -= 1;
      return { ...prev, options, correctOptionIndex: correct };
    });
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > LARGE_FILE_BYTES && !window.confirm(
      `${file.name} is ${formatBytes(file.size)}. Large files take longer to download onto the projector. Upload anyway?`
    )) return;

    setFormError('');
    setUploadProgress(0);
    try {
      const asset = await uploadWithProgress(file, localStorage.getItem('admin_token'), setUploadProgress);
      updateForm({ mediaId: asset.id, media: asset, mediaType: asset.mediaType });
      loadLibrary();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setUploadProgress(null);
    }
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    setFormError('');
    setIsSaving(true);
    const body = {
      roundType: form.roundType,
      questionText: form.questionText,
      options: form.options,
      correctOptionIndex: form.correctOptionIndex,
      points: form.points,
      negativePoints: form.negativePoints,
      timeLimitSeconds: form.timeLimitSeconds,
      explanation: form.explanation,
      mediaType: form.mediaType,
      mediaId: form.mediaId
    };
    try {
      const { json } = form._id
        ? await adminFetch(`/questions/${form._id}`, { method: 'PUT', body })
        : await adminFetch('/questions', { method: 'POST', body });
      if (json?.success) {
        flashNotice(json.notice || (form._id ? 'Question updated' : 'Question created'), json.notice ? 6000 : 3000);
        setForm(null);
        onChanged();
      } else {
        setFormError(json?.error || 'Could not save the question');
      }
    } catch (err) {
      setFormError('Network error while saving');
    } finally {
      setIsSaving(false);
    }
  };

  // -------------------------------------------------------------
  // Render
  // -------------------------------------------------------------
  const isAv = form?.roundType === 'AUDIO_VISUAL';

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-5xl w-full bg-white text-slate-900 border border-purple-100 rounded-3xl p-6 sm:p-7 shadow-2xl flex flex-col max-h-[92vh] space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#583FA9] to-[#7C3AED] text-white flex items-center justify-center p-2 shadow-md shadow-purple-950/20">
              <img src="/tv.png" alt="" className="w-full h-full object-contain" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#1A103C] flex items-center gap-2">
                Question Bank &amp; Round Manager
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#ECE8F9] text-[#583FA9]">
                  {questions.length} Total Questions
                </span>
              </h3>
              <p className="text-xs text-slate-500">Create, edit and order questions for each round. Changes are saved to the database.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!form && (
              <>
                <button onClick={handleExport} className={SECONDARY_BUTTON}>
                  <Download className="w-3.5 h-3.5 text-[#583FA9]" /> Export JSON
                </button>
                <button onClick={() => importInputRef.current?.click()} className={SECONDARY_BUTTON}>
                  <FileJson className="w-3.5 h-3.5 text-[#583FA9]" /> Import JSON
                </button>
                <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportFile} />
              </>
            )}
            <button
              onClick={onClose}
              aria-label="Close question bank"
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Round tabs */}
        {!form && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1.5 rounded-2xl bg-slate-100">
            {ROUNDS.map((r) => {
              const isActive = round === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => {
                    setRound(r.id);
                    setListError('');
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    isActive ? 'bg-[#583FA9] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <span>{r.label}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                      isActive ? 'bg-white/20 text-white font-bold' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {counts[r.id] || 0}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Round toolbar */}
        {!form && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-[#F8F9FE] border border-purple-100">
            <div>
              <h4 className="text-sm font-extrabold text-[#1A103C] flex items-center gap-2">
                {roundInfo.label}
                <span className="text-xs font-normal text-slate-500">({roundQuestions.length} questions)</span>
              </h4>
              <p className="text-[11px] text-slate-500">{roundInfo.hint}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setFormError('');
                  setForm(emptyForm(round));
                }}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md"
              >
                <Plus className="w-4 h-4" /> New Question
              </button>
              <input ref={csvInputRef} type="file" accept=".csv,text/csv" onChange={handleImportCsv} className="hidden" />
              <button
                onClick={() => csvInputRef.current?.click()}
                disabled={isImportingCsv}
                title="Add the questions in a CSV file to this round"
                className="px-3.5 py-2 rounded-xl bg-[#583FA9] hover:bg-[#4a3294] text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-purple-900/10 transition-all disabled:opacity-50"
              >
                {isImportingCsv ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                {isImportingCsv ? 'Importing…' : 'Upload CSV'}
              </button>
              <button onClick={handleDownloadTemplate} title="Download a sample CSV for this round" className={SECONDARY_BUTTON}>
                <FileText className="w-3.5 h-3.5 text-[#583FA9]" /> Sample CSV
              </button>
              <button
                onClick={() => setConfirmDeleteRound(true)}
                disabled={roundQuestions.length === 0}
                title="Delete every question in this round (other rounds are kept)"
                className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Round
              </button>
            </div>
          </div>
        )}

        {listError && !form && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {listError}
            </span>
            <button onClick={() => setListError('')} aria-label="Dismiss" className="text-rose-500 hover:text-rose-800">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* List view */}
        {!form && (
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {roundQuestions.length === 0 && (
              <div className="p-12 text-center space-y-2 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                <UploadCloud className="w-6 h-6 text-[#583FA9] mx-auto" />
                <h4 className="text-sm font-bold text-slate-800">No questions in {roundInfo.label} yet</h4>
                <p className="text-xs text-slate-500">
                  Click <strong>New Question</strong>, or <strong>Upload CSV</strong> (see <strong>Sample CSV</strong> for the columns).
                </p>
              </div>
            )}
            {roundQuestions.map((q, idx) => {
              const MediaIcon = MEDIA_ICONS[q.mediaType];
              const isLive = String(activeQuestionId) === String(q._id);
              return (
                <div
                  key={q._id}
                  className="p-3.5 rounded-2xl bg-white border border-slate-200/80 hover:border-purple-300 shadow-sm flex items-start gap-3 transition-all"
                >
                  <div className="flex flex-col items-center gap-1 pt-0.5">
                    <button
                      onClick={() => handleMove(idx, -1)}
                      disabled={idx === 0}
                      aria-label="Move up"
                      className="p-1 rounded-md bg-slate-100 hover:bg-purple-100 text-slate-600 disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] font-bold text-[#583FA9] font-mono">#{idx + 1}</span>
                    <button
                      onClick={() => handleMove(idx, 1)}
                      disabled={idx === roundQuestions.length - 1}
                      aria-label="Move down"
                      className="p-1 rounded-md bg-slate-100 hover:bg-purple-100 text-slate-600 disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold">
                        +{q.points}
                        {q.negativePoints ? ` · -${q.negativePoints}` : ''} pts
                      </span>
                      {MediaIcon && (
                        <span className="px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 font-bold border border-sky-200 flex items-center gap-1">
                          <MediaIcon className="w-3 h-3" />
                          {mediaById[q.mediaId]?.originalName || q.mediaType}
                        </span>
                      )}
                      {isLive && (
                        <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold border border-rose-200">ON STAGE</span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-slate-900 leading-relaxed">{q.questionText}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {q.options?.map((o, oIdx) => (
                        <span key={oIdx} className={oIdx === q.correctOptionIndex ? 'text-emerald-700 font-bold' : ''}>
                          {o.label}. {o.text}
                          {oIdx < q.options.length - 1 ? '   ·   ' : ''}
                        </span>
                      ))}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => {
                        setFormError('');
                        setForm(formFromQuestion(q, mediaById));
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-[#ECE8F9] hover:bg-purple-200 text-[#583FA9] text-xs font-bold flex items-center gap-1"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => handleDelete(q)}
                      aria-label="Delete question"
                      className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Editor */}
        {form && (
          <form onSubmit={handleSave} className="flex-1 overflow-y-auto space-y-5 pr-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-extrabold text-[#1A103C]">
                {form._id ? 'Edit question' : 'New question'} · {roundLabel(form.roundType)}
              </h4>
              {String(activeQuestionId) === String(form._id) && (
                <span className="text-[11px] font-semibold text-amber-700">On stage now: load it again after saving to show the changes.</span>
              )}
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {/* Media (AV round) */}
            {isAv && (
              <div className="p-4 rounded-2xl bg-[#F8F9FE] border border-purple-100 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-800">Clip (video, audio or image)</span>
                  <div className="flex gap-2">
                    <label className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm">
                      <UploadCloud className="w-4 h-4" />
                      {form.media ? 'Replace file' : 'Upload file'}
                      <input type="file" accept={ACCEPTED_MEDIA} className="hidden" onChange={handleUpload} disabled={uploadProgress !== null} />
                    </label>
                    <button type="button" onClick={() => setShowLibrary((v) => !v)} className={SECONDARY_BUTTON}>
                      {showLibrary ? 'Hide library' : 'Choose from library'}
                    </button>
                  </div>
                </div>

                {uploadProgress !== null && (
                  <div className="space-y-1">
                    <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div className="h-full bg-sky-500 transition-all" style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
                    </div>
                    <span className="text-[11px] text-slate-500">Uploading… {Math.round(uploadProgress * 100)}%</span>
                  </div>
                )}

                {showLibrary && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {library.length === 0 && <span className="text-xs text-slate-500">No files uploaded yet.</span>}
                    {library.map((m) => {
                      const Icon = MEDIA_ICONS[m.mediaType] || Film;
                      const selected = form.mediaId === m.id;
                      return (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => {
                            updateForm({ mediaId: m.id, media: m, mediaType: m.mediaType });
                            setShowLibrary(false);
                          }}
                          className={`p-2.5 rounded-xl border text-left text-xs flex items-center gap-2 ${
                            selected ? 'bg-sky-50 border-sky-400 text-slate-900' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Icon className="w-4 h-4 shrink-0 text-sky-600" />
                          <span className="truncate flex-1">{m.originalName}</span>
                          <span className="text-slate-400 shrink-0">{formatBytes(m.size)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {form.media ? (
                  <div className="space-y-2">
                    <MediaPreview media={form.media} />
                    <span className="text-[11px] text-slate-500">
                      {form.media.originalName || 'Current clip'}
                      {form.media.size ? ` · ${formatBytes(form.media.size)}` : ''}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs font-semibold text-amber-700">
                    Upload or choose a clip. The projector downloads it in advance so it plays without buffering.
                  </p>
                )}
              </div>
            )}

            {/* Question text */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Question (Bangla, math and symbols are fine)</label>
              <textarea
                value={form.questionText}
                onChange={(e) => updateForm({ questionText: e.target.value })}
                rows={3}
                required
                maxLength={1000}
                placeholder="Type the question as it should appear on the big screen"
                className={`${INPUT_CLASS} rounded-2xl p-3`}
              />
            </div>

            {/* Options */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Options <span className="font-normal text-[#583FA9]">(click the letter of the correct one)</span>
              </label>
              {form.options.map((text, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <label
                    className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs cursor-pointer shrink-0 border ${
                      form.correctOptionIndex === idx
                        ? 'bg-emerald-600 border-emerald-500 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                    title="Mark as correct"
                  >
                    <input
                      type="radio"
                      name="correctOption"
                      className="sr-only"
                      checked={form.correctOptionIndex === idx}
                      onChange={() => updateForm({ correctOptionIndex: idx })}
                    />
                    {form.correctOptionIndex === idx ? <Check className="w-4 h-4" /> : String.fromCharCode(65 + idx)}
                  </label>
                  <input
                    value={text}
                    onChange={(e) => updateOption(idx, e.target.value)}
                    required
                    maxLength={300}
                    placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                    className={`flex-1 ${INPUT_CLASS}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    disabled={form.options.length <= MIN_OPTIONS}
                    aria-label={`Remove option ${String.fromCharCode(65 + idx)}`}
                    className="p-2 rounded-lg bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {form.options.length < MAX_OPTIONS && (
                <button type="button" onClick={addOption} className={SECONDARY_BUTTON}>
                  <Plus className="w-3.5 h-3.5" /> Add option
                </button>
              )}
            </div>

            {/* Scoring */}
            <div className="grid grid-cols-3 gap-3">
              {[
                ['points', 'Points if correct', 0],
                ['negativePoints', 'Penalty if wrong', 0],
                ['timeLimitSeconds', 'Time limit (s)', 5]
              ].map(([key, label, min]) => (
                <div key={key}>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">{label}</label>
                  <input
                    type="number"
                    min={min}
                    max={key === 'timeLimitSeconds' ? 600 : 1000}
                    value={form[key]}
                    onChange={(e) => updateForm({ [key]: e.target.value === '' ? '' : Number(e.target.value) })}
                    className={`${INPUT_CLASS} font-mono-numbers`}
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Explanation (optional, shown to the host)</label>
              <input
                value={form.explanation}
                onChange={(e) => updateForm({ explanation: e.target.value })}
                maxLength={2000}
                className={INPUT_CLASS}
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || uploadProgress !== null || (isAv && !form.mediaId)}
                className="px-5 py-2.5 rounded-xl bg-[#583FA9] hover:bg-[#4a3294] text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-purple-900/20 disabled:opacity-40"
              >
                <Check className="w-4 h-4" />
                {isSaving ? 'Saving…' : form._id ? 'Save changes' : 'Create question'}
              </button>
            </div>
          </form>
        )}
      </div>

      {notice && (
        <Dialog
          title={notice.title}
          subtitle="Question Bank"
          actions={
            <button
              onClick={() => setNotice(null)}
              className="w-full py-2.5 rounded-xl bg-[#583FA9] hover:bg-[#4a3294] text-white font-bold text-xs shadow-md shadow-purple-900/20"
            >
              Got it
            </button>
          }
        >
          <p className="text-sm text-slate-700 leading-relaxed">{notice.message}</p>
          {notice.details && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed">{notice.details}</div>
          )}
        </Dialog>
      )}

      {confirmDeleteRound && (
        <Dialog
          tone="danger"
          title={`Clear ${roundInfo.label}?`}
          subtitle="This round only"
          actions={
            <>
              <button
                onClick={() => setConfirmDeleteRound(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteRound}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-900/20"
              >
                Yes, delete {roundQuestions.length} question(s)
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-700 leading-relaxed">
            Delete all <strong>{roundQuestions.length} questions</strong> in <strong>{roundInfo.label}</strong>? This cannot be undone
            (use <strong>Export JSON</strong> first if you may need them again).
          </p>
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
            Questions in the other two rounds and uploaded clips are kept.
          </div>
        </Dialog>
      )}
    </div>
  );
}
