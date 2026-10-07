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
  Film,
  Music,
  Image as ImageIcon,
  Check,
  AlertTriangle,
  Sliders
} from 'lucide-react';
import { API_URL } from '../lib/config';

const ROUNDS = [
  { id: 'BUZZER', label: 'Round 1: Buzzer' },
  { id: 'AUDIO_VISUAL', label: 'Round 2: Audio-Visual' },
  { id: 'RAPID_FIRE', label: 'Round 3: Rapid Fire' }
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

function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  return <img src={src} alt="Visual clue" className="max-h-56 rounded-xl mx-auto bg-black/40" />;
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
  const importInputRef = useRef(null);

  const roundQuestions = useMemo(
    () => questions.filter((q) => q.roundType === round).sort((a, b) => (a.order || 0) - (b.order || 0)),
    [questions, round]
  );
  const mediaById = useMemo(() => Object.fromEntries(library.map((m) => [m.id, m])), [library]);

  const loadLibrary = async () => {
    const { json } = await adminFetch('/media');
    if (json?.success) setLibrary(json.data);
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

  const handleExport = async () => {
    const { json, ok } = await adminFetch('/questions/export');
    if (!ok || !Array.isArray(json)) {
      setListError('Export failed');
      return;
    }
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `learnup-questions-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-5xl w-full bg-[#160D2E] border border-white/10 p-6 rounded-3xl space-y-4 max-h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-purple-400" />
              Question Bank
            </h3>
            <p className="text-xs text-slate-400">Create, edit and order questions for each round. Changes are saved to the database.</p>
          </div>
          <div className="flex items-center gap-2">
            {!form && (
              <>
                <button
                  onClick={handleExport}
                  className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Export JSON
                </button>
                <button
                  onClick={() => importInputRef.current?.click()}
                  className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 flex items-center gap-1.5"
                >
                  <FileJson className="w-3.5 h-3.5" /> Import JSON
                </button>
                <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportFile} />
              </>
            )}
            <button
              onClick={onClose}
              aria-label="Close question bank"
              className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Round tabs */}
        {!form && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              {ROUNDS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setRound(r.id);
                    setListError('');
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    round === r.id ? 'bg-[#583FA9] text-white shadow-lg' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {r.label} ({counts[r.id] || 0})
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setFormError('');
                setForm(emptyForm(round));
              }}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md"
            >
              <Plus className="w-4 h-4" /> New Question
            </button>
          </div>
        )}

        {listError && !form && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {listError}
            </span>
            <button onClick={() => setListError('')} className="text-rose-200 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* List view */}
        {!form && (
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {roundQuestions.length === 0 && (
              <div className="p-10 text-center text-sm text-slate-400 rounded-2xl bg-white/5 border border-white/10">
                No questions in this round yet. Click <strong>New Question</strong> to add one.
              </div>
            )}
            {roundQuestions.map((q, idx) => {
              const MediaIcon = MEDIA_ICONS[q.mediaType];
              const isLive = String(activeQuestionId) === String(q._id);
              return (
                <div key={q._id} className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
                  <div className="flex flex-col items-center gap-1 pt-0.5">
                    <button
                      onClick={() => handleMove(idx, -1)}
                      disabled={idx === 0}
                      aria-label="Move up"
                      className="p-1 rounded-md bg-white/5 hover:bg-white/15 text-slate-300 disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] font-bold text-slate-400 font-mono">#{idx + 1}</span>
                    <button
                      onClick={() => handleMove(idx, 1)}
                      disabled={idx === roundQuestions.length - 1}
                      aria-label="Move down"
                      className="p-1 rounded-md bg-white/5 hover:bg-white/15 text-slate-300 disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      {MediaIcon && (
                        <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30 flex items-center gap-1">
                          <MediaIcon className="w-3 h-3" />
                          {mediaById[q.mediaId]?.originalName || q.mediaType}
                        </span>
                      )}
                      <span className="text-emerald-300 font-semibold">
                        +{q.points}
                        {q.negativePoints ? ` / -${q.negativePoints}` : ''} pts
                      </span>
                      {isLive && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">ON STAGE</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-white">{q.questionText}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {q.options?.map((o, oIdx) => (
                        <span key={oIdx} className={oIdx === q.correctOptionIndex ? 'text-emerald-300 font-bold' : ''}>
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
                      className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-semibold flex items-center gap-1"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => handleDelete(q)}
                      aria-label="Delete question"
                      className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30"
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
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">
                {form._id ? 'Edit question' : 'New question'} · {ROUNDS.find((r) => r.id === form.roundType)?.label}
              </h4>
              {String(activeQuestionId) === String(form._id) && (
                <span className="text-[11px] text-amber-300">On stage now: load it again after saving to show the changes.</span>
              )}
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {/* Media (AV round) */}
            {isAv && (
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-300">Clip (video, audio or image)</span>
                  <div className="flex gap-2">
                    <label className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                      <UploadCloud className="w-4 h-4" />
                      {form.media ? 'Replace file' : 'Upload file'}
                      <input type="file" accept={ACCEPTED_MEDIA} className="hidden" onChange={handleUpload} disabled={uploadProgress !== null} />
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowLibrary((v) => !v)}
                      className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200"
                    >
                      {showLibrary ? 'Hide library' : 'Choose from library'}
                    </button>
                  </div>
                </div>

                {uploadProgress !== null && (
                  <div className="space-y-1">
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full bg-sky-500 transition-all" style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
                    </div>
                    <span className="text-[11px] text-slate-400">Uploading… {Math.round(uploadProgress * 100)}%</span>
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
                            selected ? 'bg-sky-500/20 border-sky-400 text-white' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          <Icon className="w-4 h-4 shrink-0 text-sky-300" />
                          <span className="truncate flex-1">{m.originalName}</span>
                          <span className="text-slate-500 shrink-0">{formatBytes(m.size)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {form.media ? (
                  <div className="space-y-2">
                    <MediaPreview media={form.media} />
                    <span className="text-[11px] text-slate-400">
                      {form.media.originalName || 'Current clip'}
                      {form.media.size ? ` · ${formatBytes(form.media.size)}` : ''}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-amber-300">Upload or choose a clip. The projector downloads it in advance so it plays without buffering.</p>
                )}
              </div>
            )}

            {/* Question text */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5 uppercase tracking-wider">Question</label>
              <textarea
                value={form.questionText}
                onChange={(e) => updateForm({ questionText: e.target.value })}
                rows={3}
                required
                maxLength={1000}
                placeholder="Type the question as it should appear on the big screen"
                className="w-full bg-[#0e0720] border border-white/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#583FA9]"
              />
            </div>

            {/* Options */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block uppercase tracking-wider">
                Options <span className="normal-case font-normal text-slate-500">(select the correct one)</span>
              </label>
              {form.options.map((text, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <label
                    className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs cursor-pointer shrink-0 border ${
                      form.correctOptionIndex === idx
                        ? 'bg-emerald-600 border-emerald-400 text-white'
                        : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'
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
                    className="flex-1 bg-[#0e0720] border border-white/15 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#583FA9]"
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    disabled={form.options.length <= MIN_OPTIONS}
                    aria-label={`Remove option ${String.fromCharCode(65 + idx)}`}
                    className="p-2 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 disabled:opacity-30"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {form.options.length < MAX_OPTIONS && (
                <button
                  type="button"
                  onClick={addOption}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 flex items-center gap-1"
                >
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
                  <label className="text-xs font-bold text-slate-300 block mb-1.5">{label}</label>
                  <input
                    type="number"
                    min={min}
                    max={key === 'timeLimitSeconds' ? 600 : 1000}
                    value={form[key]}
                    onChange={(e) => updateForm({ [key]: e.target.value === '' ? '' : Number(e.target.value) })}
                    className="w-full bg-[#0e0720] border border-white/15 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#583FA9]"
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5">Explanation (optional, shown to the host)</label>
              <input
                value={form.explanation}
                onChange={(e) => updateForm({ explanation: e.target.value })}
                maxLength={2000}
                className="w-full bg-[#0e0720] border border-white/15 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#583FA9]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-semibold text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || uploadProgress !== null || (isAv && !form.mediaId)}
                className="px-5 py-2.5 rounded-xl bg-[#583FA9] hover:bg-[#684ec2] text-white text-sm font-bold flex items-center gap-1.5 disabled:opacity-40"
              >
                <Check className="w-4 h-4" />
                {isSaving ? 'Saving…' : form._id ? 'Save changes' : 'Create question'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
