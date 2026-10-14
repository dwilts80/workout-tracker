'use strict';
/* Workout Tracker — plain JS, data in localStorage. */
const KEY = 'workoutTracker.v1'; // legacy single-profile key (migrated into 'Me')
const KEY2 = 'workoutTracker.v2';
const APP_VERSION = 'v10 · stretch warm-up';
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fmtDate = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'}); };
const fmtShort = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}); };
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const fmtNum = n => n == null ? '—' : (Math.round(n * 10) / 10).toString();
const norm = s => s.trim().toLowerCase();
const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;

const FIELD = {weight: {label: 'Weight (lbs)', ph: 'lbs', mode: 'decimal'}, reps: {label: 'Reps', ph: 'reps', mode: 'numeric'}, sec: {label: 'Seconds', ph: 'sec', mode: 'numeric'}, min: {label: 'Minutes', ph: 'min', mode: 'decimal'}, done: {label: 'Round done'}};
const TYPES = {wr: ['weight', 'reps'], ws: ['weight', 'sec'], r: ['reps'], s: ['sec'], m: ['min'], d: ['done']};
const fieldsOf = e => Array.isArray(e.fields) && e.fields.length ? e.fields : ['weight', 'reps'];
const filled = s => !!(s && (s.done || ['weight', 'reps', 'sec', 'min'].some(k => s[k] !== undefined && s[k] !== '' && s[k] != null)));
// A set counts as performed if it has values and is checked (old sets have no 'ok' flag => completed). Rounds use 'done'.
const performed = s => !!s && (s.done === true || (s.done === undefined && s.ok !== false && filled(s)));
const blankSet = fields => { const o = Object.fromEntries(fields.map(k => [k, k === 'done' ? false : ''])); if (!fields.includes('done')) o.ok = false; return o; };
const clone = o => JSON.parse(JSON.stringify(o));
const routine = () => activeProfile().routine;
const suggestedDay = () => { const wd = new Date().getDay(), r = routine(); return wd >= 1 && wd <= 5 && r[wd - 1] ? r[wd - 1].id : null; };
const typeOf = fields => (Object.entries(TYPES).find(([, f]) => f.join() === (fields || WR).join()) || ['wr'])[0];
const TYPE_LABEL = {wr: 'Weight × reps', r: 'Reps only', ws: 'Weight + seconds', s: 'Seconds', m: 'Minutes', d: 'Rounds'};
// Extra one-arm work seeded into Me's upper-body days (after the main press/row/pull work).
const ME_EXTRAS = [
  {name: 'Left Shoulder Press', sets: 3, target: '3 × 8–12', rest: 'light'},
  {name: 'Left Shoulder Shrug', sets: 3, target: '3 × 10–15'},
  {name: 'Left Shoulder Pull', sets: 3, target: '3 × 8–12', note: 'Cable/band pull or row variation of choice.'},
  {name: 'Left Shoulder Lat Pull Down', sets: 3, target: '3 × 8–12', rest: 'light'}];
// Dad-only renames (v9) + old-name aliases so last-time hints/bests carry over.
const DAD_RENAMES = {'Shrug': 'Left Shoulder Shrug', 'Pull (one-arm, left)': 'Left Shoulder Pull'};
const DAD_ALIASES = {'left shoulder shrug': ['shrug'], 'left shoulder pull': ['pull (one-arm, left)']};
function migrateDad(r) {
  for (const id of ['d2', 'd4']) {
    const d = r.find(x => x.id === id); if (!d) continue;
    for (const e of d.exercises) if (DAD_RENAMES[e.name]) e.name = DAD_RENAMES[e.name];
    const i = d.exercises.findIndex(e => e.name === 'Left Shoulder Pull');
    if (i >= 0 && !d.exercises.some(e => norm(e.name) === 'left shoulder lat pull down')) d.exercises.splice(i + 1, 0, {name: 'Left Shoulder Lat Pull Down', sets: 3, target: '3 × 8–12', rest: 'light'});
  }
  return r;
}
/** Same exercise? (case-insensitive; for Dad also old->new aliases) */
function sameEx(a, b) {
  const x = norm(a), y = norm(b); if (x === y) return true;
  if (activeProfile().id !== 'me') return false;
  return (DAD_ALIASES[x] || []).includes(y) || (DAD_ALIASES[y] || []).includes(x);
}
// Cooper-only exercise names (two-arm versions). Applied to old exact names only; sets/targets/order kept.
const COOPER_RENAMES = {
  d2: {'One-Arm Dumbbell/Cable Row': 'Dumbbell/Cable Row', 'One-Arm Incline Press': 'Incline Press', 'One-Arm Lat Pulldown': 'Lat Pulldown', 'One-Arm Lateral Raise': 'Lateral Raise'},
  d4: {'One-Arm Shoulder Press': 'Shoulder Press', 'One-Arm Row': 'Row', 'One-Arm Chest Press': 'Chest Press', 'One-Arm Pulldown': 'Lat Pulldown'}};
function renameCooper(r) {
  for (const [id, map] of Object.entries(COOPER_RENAMES)) { const d = r.find(x => x.id === id); if (d) for (const e of d.exercises) if (map[e.name]) e.name = map[e.name]; }
  return r;
}
function seedRoutine(pid) {
  const r = clone(PROGRAM);
  if (pid === 'cooper') renameCooper(r);
  if (pid === 'me') for (const [id, after] of [['d2', 'One-Arm Lat Pulldown'], ['d4', 'One-Arm Pulldown']]) {
    const d = r.find(x => x.id === id), i = d.exercises.findIndex(e => e.name === after);
    d.exercises.splice(i + 1, 0, ...clone(ME_EXTRAS));
  }
  return r;
}
function cleanRoutine(r) {
  if (!Array.isArray(r) || !r.length) return clone(PROGRAM);
  return r.map((d, i) => ({id: String(d.id || 'd' + (i + 1)), name: String(d.name || 'Day ' + (i + 1)), note: String(d.note || ''),
    exercises: (Array.isArray(d.exercises) ? d.exercises : []).map(e => {
      const x = {name: String(e.name || 'Exercise'), sets: Math.max(1, Math.min(20, parseInt(e.sets) || 1)), target: String(e.target || '')};
      if (e.rest === 'heavy' || e.rest === 'light') x.rest = e.rest;
      if (Array.isArray(e.fields) && TYPES[typeOf(e.fields)].join() === e.fields.join() && e.fields.join() !== 'weight,reps') x.fields = e.fields.slice();
      if (e.note) x.note = String(e.note);
      return x;
    })}));
}
function templateFor(name) { for (const d of [...routine(), ...PROGRAM]) for (const e of d.exercises) if (norm(e.name) === norm(name)) return e; return null; }

let store, db; // initialised after storage helpers below
let state = {tab: 'home', editing: null, picking: false, weightEditDate: null, progDay: null, progEdit: null};

const emptyData = () => ({version: 1, workouts: [], weights: []});
const cleanData = d => ({version: 1, workouts: Array.isArray(d && d.workouts) ? d.workouts : [], weights: Array.isArray(d && d.weights) ? d.weights : []});
function defaultStore() { return {version: 2, stretchAdded: true, renamedDad: true, cooperRenamed: true, dadLeftRenamed: true, active: 'me', profiles: [{id: 'me', name: 'Dad', data: emptyData(), routine: seedRoutine('me')}, {id: 'cooper', name: 'Cooper', data: emptyData(), routine: seedRoutine('cooper')}]}; }
function loadStore() {
  try {
    const st = JSON.parse(localStorage.getItem(KEY2));
    if (st && Array.isArray(st.profiles) && st.profiles.length) {
      st.profiles.forEach(p => { p.data = cleanData(p.data); p.name = String(p.name || 'Profile'); p.routine = Array.isArray(p.routine) && p.routine.length ? cleanRoutine(p.routine) : seedRoutine(p.id); });
      if (!st.profiles.some(p => p.id === st.active)) st.active = st.profiles[0].id;
      // One-time rename of the default 'Me' profile to 'Dad' (custom names are left alone).
      // One-time migration (by profile id): Cooper's Day 2 / Day 4 renames.
      if (!st.cooperRenamed) { st.profiles.forEach(p => { if (p.id === 'cooper') renameCooper(p.routine); }); st.cooperRenamed = true; localStorage.setItem(KEY2, JSON.stringify(st)); }
      // One-time: add the Stretch day to existing profiles (by id) if absent.
      if (!st.stretchAdded) { st.profiles.forEach(p => { if ((p.id === 'me' || p.id === 'cooper') && !p.routine.some(d => d.id === 'stretch')) p.routine.push(clone(PROGRAM.find(d => d.id === 'stretch'))); }); st.stretchAdded = true; localStorage.setItem(KEY2, JSON.stringify(st)); }
      if (!st.dadLeftRenamed) { st.profiles.forEach(p => { if (p.id === 'me') migrateDad(p.routine); }); st.dadLeftRenamed = true; localStorage.setItem(KEY2, JSON.stringify(st)); }
      if (!st.renamedDad) { st.profiles.forEach(p => { if (p.id === 'me' && p.name === 'Me') p.name = 'Dad'; }); st.renamedDad = true; localStorage.setItem(KEY2, JSON.stringify(st)); }
      return st;
    }
  } catch (e) {}
  const st = defaultStore();
  // Migrate legacy single-profile data into 'Me'.
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && Array.isArray(d.workouts)) st.profiles[0].data = cleanData(d); } catch (e) {}
  localStorage.setItem(KEY2, JSON.stringify(st));
  return st;
}
function activeProfile() { return store.profiles.find(p => p.id === store.active) || store.profiles[0]; }
const profileColor = id => id === 'cooper' ? '#38bdf8' : id === 'me' ? '#22c55e' : '#c084fc';
function save() { activeProfile().data = db; localStorage.setItem(KEY2, JSON.stringify(store)); }
store = loadStore(); db = activeProfile().data;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1800); }

const sortedWorkouts = () => [...db.workouts].sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
const sortedWeights = () => [...db.weights].sort((a, b) => a.date.localeCompare(b.date));

function exerciseNames() {
  const seen = new Map();
  for (const w of sortedWorkouts()) for (const e of w.exercises) if (e.name && !seen.has(norm(e.name))) seen.set(norm(e.name), e.name);
  return [...seen.values()];
}
/** Most recent previous occurrence of an exercise (excluding the given workout). */
function lastTime(name, excludeId, beforeDate) {
  for (const w of sortedWorkouts()) {
    if (w.id === excludeId) continue;
    if (beforeDate && w.date > beforeDate) continue;
    const e = w.exercises.find(x => sameEx(x.name, name) && x.sets.some(performed));
    if (e) return {date: w.date, sets: e.sets.filter(performed), fields: fieldsOf(e)};
  }
  return null;
}
/** n set rows pre-filled set-by-set from last time (copy the last past set if fewer); unchecked. */
const holdFromTarget = t => { const m = /(\d+)\s*(s|sec)\b/i.exec(t || ''); return m ? m[1] : ''; };
function prefillSets(name, fields, n, excludeId, date, target) {
  const hold = fields.join() === 'sec' ? holdFromTarget(target) : '';
  if (hold) return Array.from({length: n}, () => ({...blankSet(fields), sec: hold}));
  const prev = lastTime(name, excludeId, date);
  return Array.from({length: n}, (_, i) => {
    const o = blankSet(fields);
    const ps = prev && prev.fields.join() === fields.join() && prev.sets.length ? prev.sets[Math.min(i, prev.sets.length - 1)] : null;
    if (ps && !fields.includes('done')) for (const k of fields) o[k] = ps[k] ?? '';
    return o;
  });
}
function bestWeight(name) {
  let best = null;
  for (const w of db.workouts) for (const e of w.exercises) if (!e.warmup && sameEx(e.name, name))
    for (const s of e.sets.filter(performed)) { const wt = num(s.weight); if (wt != null && (best == null || wt > best.weight)) best = {weight: wt, reps: s.reps, date: w.date}; }
  return best;
}
const setStr = (s, fields = ['weight', 'reps']) => {
  if (fields.includes('done')) return s.done ? '✓' : '–';
  const parts = [];
  if (fields.includes('weight') && (fields.includes('reps') || num(s.weight) != null)) parts.push(num(s.weight) != null ? fmtNum(num(s.weight)) : 'BW');
  if (fields.includes('reps')) parts.push(s.reps || '?');
  let out = parts.join('×');
  if (fields.includes('sec')) out += (out ? ' · ' : '') + (s.sec || '?') + 's';
  if (fields.includes('min')) out += (out ? ' · ' : '') + (s.min || '?') + ' min';
  return out;
};
const prevStr = p => p.fields.includes('done') ? `${p.sets.filter(s => s.done).length} rounds` : p.sets.map(s => setStr(s, p.fields)).join(', ');

/* ---------- Rendering ---------- */
function setHeader(title, actionHTML = '') { $('#title').textContent = title; $('#topAction').innerHTML = actionHTML; }
function renderProfileBar() {
  const p = activeProfile();
  const bar = $('#profileBar');
  bar.style.setProperty('--pc', profileColor(p.id));
  bar.innerHTML = `<span class="pb-label">Logging for</span> <b id="profileName">${esc(p.name)}</b> <span class="pb-switch">Switch ▾</span>`;
}
function renderProfileSheet() {
  const sh = $('#profileSheet');
  sh.innerHTML = `<div class="sheet"><h2>Who's training?</h2>${store.profiles.map(p => `<div class="row profile-row"><button class="grow list-item${p.id === store.active ? ' current' : ''}" style="--pc:${profileColor(p.id)}" data-act="switchProfile" data-pid="${p.id}"><span><span class="dot"></span>${esc(p.name)}</span><span class="muted small">${p.data.workouts.length} workout${p.data.workouts.length === 1 ? '' : 's'}${p.id === store.active ? ' · ✓ active' : ''}</span></button>
    <button class="btn btn-sm" data-act="renameProfile" data-pid="${p.id}">Rename</button></div>`).join('')}<button class="btn btn-block mt" data-act="closeSheet">Close</button></div>`;
  sh.hidden = false; syncHistory();
}
function finishEditing() {
  if (state.editing) { save(); state.editing = null; } // drafts are kept as-is (never auto-discarded)
  state.picking = false; state.weightEditDate = null; state.progDay = null; state.progEdit = null;
}
const inProgress = w => w.status === 'in_progress';
const drafts = () => sortedWorkouts().filter(inProgress).sort((a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0));
const startedStr = w => w.created ? new Date(w.created).toLocaleString(undefined, {weekday: 'short', hour: 'numeric', minute: '2-digit'}) : fmtShort(w.date);
const filledSets = w => w.exercises.reduce((n, e) => n + e.sets.filter(performed).length, 0);
function resumeCards() {
  return drafts().map(w => `<button class="list-item resume-card" data-act="open" data-id="${w.id}"><div class="grow"><div class="t">▶ Resume workout</div>
    <div class="small">${esc(w.templateName || 'Blank workout')} · started ${esc(startedStr(w))}</div><div class="muted small">${filledSets(w)} set${filledSets(w) === 1 ? '' : 's'} logged so far</div></div><span class="chev">›</span></button>`).join('');
}
/* Android back / browser back: keep one history entry while in a sub-view, so back returns home instead of leaving the app. */
let ignorePop = false;
const isSub = () => !!(state.editing || state.picking || state.progDay || !$('#profileSheet').hidden);
function syncHistory() {
  const sub = !!(history.state && history.state.wtSub);
  if (isSub() && !sub) history.pushState({wtSub: 1}, '');
  else if (!isSub() && sub) { ignorePop = true; history.back(); }
}
window.addEventListener('popstate', () => {
  if (ignorePop) { ignorePop = false; return; }
  if (!$('#profileSheet').hidden) $('#profileSheet').hidden = true;
  else if (state.editing) { save(); state.editing = null; toast('Workout saved — resume anytime'); }
  else if (state.picking) state.picking = false;
  else if (state.progEdit != null) state.progEdit = null;
  else if (state.progDay) state.progDay = null;
  render(); window.scrollTo(0, 0);
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
window.addEventListener('pagehide', () => save());

/* ---------- Timers: rest (persisted end timestamp) + hold countdown ---------- */
const REST_KEY = 'workoutTracker.rest';
let holdTimer = null, audioCtx = null, lastAlert = null;
const restSecs = e => e.rest === 'heavy' ? 150 : e.rest === 'light' ? 75 : 90;
const mmss = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const getRest = () => { try { return JSON.parse(localStorage.getItem(REST_KEY)); } catch (e) { return null; } };
const setRest = r => { if (r) localStorage.setItem(REST_KEY, JSON.stringify(r)); else localStorage.removeItem(REST_KEY); tick(); };
const warmupOn = () => activeProfile().warmup !== false && !window.__WT_NO_WARMUP;
function maybeStartRest(w, ex) {
  if (ex.warmup) return;
  const f = fieldsOf(ex);
  if (w.template === 'stretch' || f.includes('sec') || f.includes('min') || f.includes('done')) return;
  const secs = restSecs(ex);
  setRest({end: Date.now() + secs * 1000, total: secs, label: ex.name, alerted: false});
}
function alertDone(kind) {
  lastAlert = {kind, at: Date.now()};
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 880; g.gain.setValueAtTime(0.25, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.4);
  } catch (e) {}
}
document.addEventListener('click', () => { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {} }, {capture: true});
function tick() {
  const bar = $('#restBar'), r = getRest(), now = Date.now();
  if (!r) { bar.hidden = true; bar.dataset.key = ''; document.body.classList.remove('has-rest'); }
  else {
    const left = r.end - now, done = left <= 0;
    if (done && !r.alerted) { r.alerted = true; localStorage.setItem(REST_KEY, JSON.stringify(r)); alertDone('rest'); }
    bar.hidden = false; document.body.classList.add('has-rest'); bar.classList.toggle('done', done);
    const html = done ? `<span class="rb-t">✓ Rest done</span><span class="muted small grow">${esc(r.label || '')}</span><button class="btn btn-sm" data-r="skip">Dismiss</button>`
      : `<span class="rb-t" id="restLeft">${mmss(left)}</span><span class="muted small grow">Rest · ${esc(r.label || '')}</span><button class="btn btn-sm" data-r="minus">−15s</button><button class="btn btn-sm" data-r="plus">+15s</button><button class="btn btn-sm" data-r="skip">Skip</button>`;
    const key = (done ? 'done' : 'run') + '|' + r.label + '|' + r.total;
    const el = $('#restLeft');
    if (bar.dataset.key !== key || (!done && !el)) { bar.innerHTML = html; bar.dataset.key = key; }
    else if (el) el.textContent = mmss(left);
  }
  if (holdTimer) {
    const w = db.workouts.find(x => x.id === holdTimer.wid), btn = app.querySelector(`.hold-btn[data-ei="${holdTimer.ei}"][data-si="${holdTimer.si}"]`);
    const left = holdTimer.end - now;
    if (!w) holdTimer = null;
    else if (left <= 0) {
      const st = w.exercises[holdTimer.ei] && w.exercises[holdTimer.ei].sets[holdTimer.si];
      holdTimer = null; if (st) { st.ok = true; w.updated = now; save(); }
      alertDone('hold'); if (state.editing === w.id) renderEditor();
    } else if (btn) btn.textContent = mmss(left) + ' ■';
  }
}
setInterval(tick, 250);

function render() {
  renderProfileBar();
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  if (state.tab === 'home') state.editing ? renderEditor() : state.picking ? renderPicker() : renderHome();
  else if (state.tab === 'weight') renderWeight();
  else if (state.tab === 'program') renderProgram();
  else renderData();
  syncHistory();
}

function renderHome() {
  setHeader('Workouts');
  const ws = sortedWorkouts();
  const names = exerciseNames();
  let h = (backupDue() ? `<button class="list-item backup-nudge" data-act="gotoBackup"><div class="grow"><div class="t">☁️ Time for a backup</div><div class="muted small">${store.lastBackup ? 'Last backup was over a week ago.' : 'You haven’t backed up yet.'} Save a copy to Google Drive.</div></div><span class="chev">›</span></button>` : '') + resumeCards() + `<button class="btn ${drafts().length ? '' : 'btn-primary '}btn-block" data-act="new">＋ Start ${drafts().length ? 'new ' : ''}workout</button><div class="mt"></div>`;
  if (!ws.length) h += `<div class="empty">No workouts yet.<br>Tap <b>Start workout</b> to log your first one.</div>`;
  else {
    h += `<h2 style="font-size:15px;color:var(--muted);margin:8px 2px">History</h2>`;
    for (const w of ws) {
      const sets = filledSets(w);
      const exNames = w.exercises.filter(e => !e.warmup).map(e => e.name).filter(Boolean).concat(w.exercises.some(e => e.warmup) ? ['+ warm-up stretch'] : []);
      h += `<button class="list-item" data-act="open" data-id="${w.id}"><div class="grow"><div class="t">${esc(fmtDate(w.date))}${inProgress(w) ? ' <span class="badge badge-ip">In progress</span>' : ''}</div>${w.templateName ? `<div class="small" style="color:var(--accent)">${esc(w.templateName)}</div>` : ''}
        <div class="muted small">${exNames.length ? esc(exNames.join(' · ')) : 'No exercises'}</div>
        <div class="muted small">${w.exercises.length} exercise${w.exercises.length === 1 ? '' : 's'} · ${sets} set${sets === 1 ? '' : 's'}${w.notes ? ' · 📝' : ''}</div></div><span class="chev">›</span></button>`;
    }
  }
  if (names.some(n => bestWeight(n))) {
    h += `<div class="card mt"><h2>🏆 Best weight per exercise</h2><div class="bests">`;
    for (const n of names.sort((a, b) => a.localeCompare(b))) { const b = bestWeight(n); if (!b) continue; h += `<div>${esc(n)}</div><div>${b ? fmtNum(b.weight) + ' lbs' : '—'}</div>`; }
    h += `</div></div>`;
  }
  app.innerHTML = h;
}

function renderPicker() {
  setHeader('Start workout', `<button class="btn btn-sm" data-act="cancelPick">Cancel</button>`);
  const sug = suggestedDay();
  let h = drafts().length ? `<div class="card ip-note"><div class="t">You have a workout in progress</div><div class="muted small">Resume it, or pick a day below to start a new one (the unfinished one stays saved).</div></div>${resumeCards()}` : '';
  h += `<div class="muted small" style="margin:0 2px 10px">Pick a day from your program${sug ? ' — today is suggested' : ''}, or start blank.</div>`;
  for (const d of routine()) {
    h += `<button class="list-item day-pick${d.id === sug ? ' suggested' : ''}" data-act="startTpl" data-tpl="${d.id}"><div class="grow"><div class="t">${esc(d.name)}${d.id === sug ? ' <span class="badge">Today</span>' : ''}</div>
      <div class="muted small">${esc(d.exercises.map(e => e.name).join(' · '))}</div></div><span class="chev">›</span></button>`;
  }
  h += `<button class="btn btn-sm mt" style="width:100%;margin-bottom:8px" data-act="gotoProgram">✎ Edit ${esc(activeProfile().name)}'s routine</button>`;
  h += `<button class="list-item" data-act="startBlank"><div class="grow"><div class="t">＋ Blank workout</div><div class="muted small">Add your own exercises</div></div><span class="chev">›</span></button>`;
  app.innerHTML = h;
}

function renderEditor() {
  const w = db.workouts.find(x => x.id === state.editing);
  if (!w) { state.editing = null; return renderHome(); }
  setHeader(inProgress(w) ? 'Workout · in progress' : 'Workout', `<div class="row"><button class="btn btn-sm" data-act="exitWorkout">‹ Home</button><button class="btn btn-primary btn-sm" data-act="done">${inProgress(w) ? 'Finish' : 'Done'}</button></div>`);
  let h = `<div class="card"><div class="row"><div class="grow"><label>Date</label><input type="date" data-f="date" value="${esc(w.date)}"></div></div>
    <div class="mt"><label>Notes (optional)</label><textarea data-f="notes" placeholder="How did it feel?">${esc(w.notes || '')}</textarea></div></div>`;
  if (w.templateName) h += `<div class="card tpl-banner"><div class="t">${esc(w.templateName)}</div>${w.templateNote ? `<div class="mt small">📌 ${esc(w.templateNote)}</div>` : ''}${w.template === 'stretch' ? '' : `<div class="mt small muted">⏱ ${esc(REST_NOTE)}</div>`}</div>`;
  const wuCount = w.exercises.filter(e => e.warmup).length, wuOpen = w.warmup !== 'collapsed';
  const wuDone = w.exercises.filter(e => e.warmup).reduce((n, e) => n + e.sets.filter(st => st.ok !== false).length, 0), wuTotal = w.exercises.filter(e => e.warmup).reduce((n, e) => n + e.sets.length, 0);
  w.exercises.forEach((e, ei) => {
    if (e.warmup && (ei === 0 || !w.exercises[ei - 1].warmup)) h += `<div class="warmup-sec"><div class="wu-head"><button class="wu-toggle grow" data-act="wuToggle"><span class="t">${wuOpen ? '▾' : '▸'} Warm-up stretch (~11 min)</span><span class="muted small">${wuDone}/${wuTotal} holds done · ${wuCount} stretches</span></button><button class="btn btn-sm" data-act="wuSkip">Skip stretch</button></div>`;
    const wuEnd = () => { if (e.warmup && (ei === w.exercises.length - 1 || !w.exercises[ei + 1].warmup)) h += `</div>`; };
    if (e.warmup && !wuOpen) { wuEnd(); return; }
    const prev = lastTime(e.name, w.id, w.date);
    const fields = fieldsOf(e);
    const best = fields.includes('weight') ? bestWeight(e.name) : null;
    h += `<div class="ex-card"><div class="ex-head"><div><div class="ex-name">${esc(e.name)}</div>${e.target ? `<div class="target">Target ${esc(e.target)}${e.rest ? ` · rest ${e.rest === 'heavy' ? '2–3 min' : '60–90 s'}` : ''}</div>` : ''}</div><button class="btn-icon" data-act="delEx" data-ei="${ei}" aria-label="Remove exercise">🗑</button></div>
      ${e.note ? `<div class="ex-note small">${esc(e.note)}</div>` : ''}
      <div class="prev">${prev ? `Last time (${esc(fmtShort(prev.date))}): <b>${esc(prevStr(prev))}</b>` : 'First time logging this exercise'}
      ${best ? `<br><span class="pr">🏆 Best: <b>${fmtNum(best.weight)} lbs</b></span> <span>(${esc(fmtShort(best.date))})</span>` : ''}</div>
      <table class="sets"><thead><tr><th></th>${fields.map(k => `<th>${k === 'done' ? 'Round' : FIELD[k].label}</th>${k === 'sec' ? '<th>Timer</th>' : ''}`).join('')}${fields.includes('done') ? '' : '<th>Done</th>'}<th></th></tr></thead><tbody>`;
    e.sets.forEach((s, si) => {
      const ps = prev && prev.sets[si];
      const isRound = fields.includes('done'), chk = !isRound && s.ok !== false;
      h += `<tr class="${chk || (isRound && s.done) ? 'set-done' : ''}"><td class="n">${si + 1}</td>${fields.map(k => k === 'done'
        ? `<td><button class="btn round-btn${s.done ? ' on' : ''}" data-act="toggleDone" data-ei="${ei}" data-si="${si}">${s.done ? '✓ Done' : 'Mark done'}</button></td>`
        : `<td><input inputmode="${FIELD[k].mode}" data-ei="${ei}" data-si="${si}" data-k="${k}" value="${esc(s[k] ?? '')}" placeholder="${ps && ps[k] !== undefined && ps[k] !== '' ? esc(ps[k]) : FIELD[k].ph}" aria-label="${FIELD[k].label}"></td>${k === 'sec' ? `<td class="t"><button class="hold-btn${holdTimer && holdTimer.wid === w.id && holdTimer.ei === ei && holdTimer.si === si ? ' run' : ''}" data-act="holdTimer" data-ei="${ei}" data-si="${si}" aria-label="Start hold timer">▶</button></td>` : ''}`).join('')}
        ${isRound ? '' : `<td class="c"><button class="chk${chk ? ' on' : ''}" data-act="toggleSet" data-ei="${ei}" data-si="${si}" aria-label="Mark set ${si + 1} complete" aria-pressed="${chk}">✓</button></td>`}
        <td class="x"><button class="btn-icon" data-act="delSet" data-ei="${ei}" data-si="${si}" aria-label="Remove set">✕</button></td></tr>`;
    });
    h += `</tbody></table><button class="btn btn-sm mt" data-act="addSet" data-ei="${ei}">＋ Add ${fields.includes('done') ? 'round' : 'set'}</button></div>`;
    wuEnd();
  });
  h += `<div class="card"><label>Add exercise</label><div class="row"><input class="grow" id="exName" list="exList" placeholder="e.g. Bench Press" autocomplete="off" enterkeyhint="done">
    <button class="btn btn-primary" data-act="addEx">Add</button></div>
    <div class="mt"><label>Log as</label><select id="exType"><option value="">Auto (weight × reps)</option><option value="wr">Weight × reps</option><option value="r">Reps only</option><option value="ws">Weight + seconds</option><option value="s">Seconds</option><option value="m">Minutes</option><option value="d">Rounds</option></select></div><datalist id="exList">${exerciseNames().map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div id="exPreview" class="muted small mt" hidden></div></div>
    ${inProgress(w) ? '<div class="muted small mt" style="text-align:center">Saved automatically. Tap ‹ Home or Back anytime — you can resume later.</div><button class="btn btn-primary btn-block mt" data-act="finishBottom">✓ Finish workout</button>' : ''}<button class="btn btn-danger btn-block mt" data-act="delWorkout">Delete workout</button>`;
  app.innerHTML = h;
}

function weightStats() {
  const ws = sortedWeights();
  if (!ws.length) return null;
  const cur = ws[ws.length - 1], prev = ws[ws.length - 2];
  // Entry closest to 30 days before the latest entry (on or before that day).
  let ago = null;
  for (const e of ws) if (daysBetween(e.date, cur.date) >= 30) ago = e;
  return {cur, prev, ago};
}
const delta = (a, b) => { if (!b) return `<span class="muted">—</span>`; const d = a.lbs - b.lbs; const cls = d > 0 ? 'up' : d < 0 ? 'down' : ''; return `<span class="${cls}">${d > 0 ? '+' : d < 0 ? '−' : '±'}${fmtNum(Math.abs(d))}</span>`; };

function chartSVG(ws) {
  if (ws.length < 2) return `<div class="empty">Log at least two days to see your chart.</div>`;
  const W = 340, H = 180, p = {l: 36, r: 10, t: 12, b: 24};
  const xs = ws.map(e => Date.parse(e.date)), ys = ws.map(e => e.lbs);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = Math.max(1, (maxY - minY) * 0.15); minY -= pad; maxY += pad;
  const minX = xs[0], maxX = xs[xs.length - 1] || minX + 1;
  const X = x => p.l + (x - minX) / ((maxX - minX) || 1) * (W - p.l - p.r);
  const Y = y => p.t + (maxY - y) / (maxY - minY) * (H - p.t - p.b);
  const pts = ws.map((e, i) => `${X(xs[i]).toFixed(1)},${Y(e.lbs).toFixed(1)}`);
  let g = '';
  for (let i = 0; i <= 3; i++) { const v = minY + (maxY - minY) * i / 3; const y = Y(v).toFixed(1); g += `<line x1="${p.l}" x2="${W - p.r}" y1="${y}" y2="${y}" stroke="#334155" stroke-width="1"/><text x="${p.l - 4}" y="${+y + 4}" fill="#94a3b8" font-size="10" text-anchor="end">${Math.round(v)}</text>`; }
  g += `<text x="${p.l}" y="${H - 6}" fill="#94a3b8" font-size="10">${esc(fmtShort(ws[0].date))}</text><text x="${W - p.r}" y="${H - 6}" fill="#94a3b8" font-size="10" text-anchor="end">${esc(fmtShort(ws[ws.length - 1].date))}</text>`;
  const area = `M${pts[0]} L${pts.join(' L')} L${X(maxX).toFixed(1)},${H - p.b} L${X(minX).toFixed(1)},${H - p.b} Z`;
  const dots = ws.length <= 40 ? ws.map((e, i) => `<circle cx="${X(xs[i]).toFixed(1)}" cy="${Y(e.lbs).toFixed(1)}" r="2.5" fill="#22c55e"/>`).join('') : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight over time"><defs><linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22c55e" stop-opacity=".35"/><stop offset="1" stop-color="#22c55e" stop-opacity="0"/></linearGradient></defs>${g}<path d="${area}" fill="url(#gr)"/><polyline points="${pts.join(' ')}" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${dots}</svg>`;
}

function renderWeight() {
  setHeader('Body weight');
  const ws = sortedWeights(), st = weightStats();
  const editing = state.weightEditDate && db.weights.find(e => e.date === state.weightEditDate);
  const fDate = editing ? editing.date : todayISO();
  const existingToday = !editing && db.weights.find(e => e.date === fDate);
  let h = `<div class="card"><h2>${editing ? 'Edit entry' : 'Log weight'}</h2><div class="row">
    <div class="grow"><label>Date</label><input type="date" id="wDate" value="${fDate}" max="${todayISO()}"></div>
    <div style="width:38%"><label>Weight (lbs)</label><input id="wLbs" inputmode="decimal" placeholder="lbs" value="${esc(editing ? editing.lbs : existingToday ? existingToday.lbs : '')}"></div></div>
    <div class="row mt"><button class="btn btn-primary grow" data-act="saveWeight">Save</button>${editing ? `<button class="btn" data-act="cancelWeight">Cancel</button>` : ''}</div>
    <div class="muted small mt">One entry per day — saving a date that already has an entry replaces it.</div></div>`;
  if (st) {
    h += `<div class="stats"><div class="stat"><div class="v">${fmtNum(st.cur.lbs)}</div><div class="l">Current (lbs)</div></div>
      <div class="stat"><div class="v">${delta(st.cur, st.prev)}</div><div class="l">vs last entry</div></div>
      <div class="stat"><div class="v">${delta(st.cur, st.ago)}</div><div class="l">vs 30 days ago</div></div></div>`;
    h += `<div class="card"><h2>Trend</h2>${chartSVG(ws)}</div><h2 style="font-size:15px;color:var(--muted);margin:8px 2px">Entries</h2>`;
    const rev = [...ws].reverse();
    rev.forEach((e, i) => {
      const before = rev[i + 1];
      h += `<div class="list-item"><button class="grow" style="background:none;padding:0;text-align:left" data-act="editWeight" data-date="${e.date}"><div class="t">${fmtNum(e.lbs)} lbs <span class="small">${before ? delta(e, before) : ''}</span></div><div class="muted small">${esc(fmtDate(e.date))}</div></button>
        <button class="btn-icon" data-act="delWeight" data-date="${e.date}" aria-label="Delete entry">🗑</button></div>`;
    });
  } else h += `<div class="empty">No weight entries yet.</div>`;
  app.innerHTML = h;
}

function renderProgram() {
  const r = routine(), pn = esc(activeProfile().name);
  const d = state.progDay && r.find(x => x.id === state.progDay);
  if (!d) {
    setHeader('Program');
    let h = `<div class="muted small" style="margin:0 2px 10px">${pn}'s routine. Changes apply to ${pn}'s future workouts only.</div>
      <label class="card setting-row"><input type="checkbox" id="wuSetting" ${activeProfile().warmup !== false ? 'checked' : ''}><span><b>Start workouts with stretch</b><br><span class="muted small">Adds ${pn}'s Stretch routine as a warm-up to Days 1–5</span></span></label>`;
    r.forEach((x, i) => { h += `<button class="list-item" data-act="progOpen" data-day="${x.id}"><div class="grow"><div class="t">${esc(x.name)}</div><div class="muted small">${x.exercises.length} exercises · ${esc(x.exercises.map(e => e.name).join(' · '))}</div></div><span class="chev">✎</span></button>`; });
    app.innerHTML = h; return;
  }
  setHeader('Edit day', `<button class="btn btn-primary btn-sm" data-act="progBack">Done</button>`);
  const pe = state.progEdit;
  const form = (e, idx) => `<div class="card prog-form" data-idx="${idx}"><h2>${idx === -1 ? 'Add exercise' : 'Edit exercise'}</h2>
    <label>Name</label><input id="peName" value="${esc(e.name || '')}" placeholder="e.g. One-Arm Cable Fly" list="peList"><datalist id="peList">${[...new Set([...exerciseNames(), ...PROGRAM.flatMap(x => x.exercises.map(y => y.name))])].map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="row mt"><div style="width:30%"><label>Sets</label><input id="peSets" inputmode="numeric" value="${esc(e.sets || 3)}"></div><div class="grow"><label>Target (text)</label><input id="peTarget" value="${esc(e.target || '')}" placeholder="e.g. 3 × 8–12"></div></div>
    <div class="row mt"><div class="grow"><label>Rest</label><select id="peRest"><option value="">Not set</option><option value="heavy"${e.rest === 'heavy' ? ' selected' : ''}>2–3 min (heavy)</option><option value="light"${e.rest === 'light' ? ' selected' : ''}>60–90 s (accessory)</option></select></div>
      <div class="grow"><label>Log as</label><select id="peType">${Object.entries(TYPE_LABEL).map(([k, l]) => `<option value="${k}"${typeOf(e.fields) === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div class="mt"><label>Note (optional)</label><input id="peNote" value="${esc(e.note || '')}" placeholder="Cues, substitutions…"></div>
    <div class="row mt"><button class="btn btn-primary grow" data-act="progSaveEx">${idx === -1 ? 'Add' : 'Save'}</button><button class="btn" data-act="progCancelEx">Cancel</button></div></div>`;
  let h = `<div class="card"><label>Day name</label><input id="dayName" value="${esc(d.name)}"><div class="mt"><label>Day note (optional)</label><input id="dayNote" value="${esc(d.note || '')}" placeholder="Focus for the day"></div></div>`;
  d.exercises.forEach((e, i) => {
    if (pe === i) { h += form(e, i); return; }
    h += `<div class="ex-card prog-ex"><div class="ex-head"><div class="grow"><div class="ex-name">${i + 1}. ${esc(e.name)}</div>
      <div class="target">${esc(e.target || e.sets + ' sets')}${e.rest ? ` · rest ${e.rest === 'heavy' ? '2–3 min' : '60–90 s'}` : ''} · ${TYPE_LABEL[typeOf(e.fields)]}</div>${e.note ? `<div class="ex-note small">${esc(e.note)}</div>` : ''}</div></div>
      <div class="row mt prog-btns"><button class="btn btn-sm" data-act="progUp" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button class="btn btn-sm" data-act="progDown" data-i="${i}" ${i === d.exercises.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
      <button class="btn btn-sm grow" data-act="progEditEx" data-i="${i}">✎ Edit</button><button class="btn btn-sm btn-danger" data-act="progDelEx" data-i="${i}">Delete</button></div></div>`;
  });
  h += pe === -1 ? form({sets: 3}, -1) : `<button class="btn btn-primary btn-block" data-act="progAddEx">＋ Add exercise</button>`;
  h += `<button class="btn btn-danger btn-block mt" data-act="progReset">Reset this day to default</button>`;
  app.innerHTML = h;
}
function routineAction(act, b) {
  const r = routine(), d = r.find(x => x.id === state.progDay), i = +b.dataset.i;
  const rr = () => { save(); renderProgram(); };
  switch (act) {
    case 'gotoProgram': finishEditing(); state.tab = 'program'; render(); window.scrollTo(0, 0); return true;
    case 'progOpen': state.progDay = b.dataset.day; state.progEdit = null; renderProgram(); window.scrollTo(0, 0); return true;
    case 'progBack': state.progDay = null; state.progEdit = null; renderProgram(); window.scrollTo(0, 0); return true;
    case 'progUp': if (i > 0) { [d.exercises[i - 1], d.exercises[i]] = [d.exercises[i], d.exercises[i - 1]]; rr(); } return true;
    case 'progDown': if (i < d.exercises.length - 1) { [d.exercises[i + 1], d.exercises[i]] = [d.exercises[i], d.exercises[i + 1]]; rr(); } return true;
    case 'progEditEx': state.progEdit = i; renderProgram(); $('.prog-form')?.scrollIntoView({block: 'center'}); return true;
    case 'progAddEx': state.progEdit = -1; renderProgram(); $('.prog-form')?.scrollIntoView({block: 'center'}); $('#peName')?.focus(); return true;
    case 'progCancelEx': state.progEdit = null; renderProgram(); return true;
    case 'progDelEx': if (confirm(`Delete ${d.exercises[i].name} from ${d.name}?`)) { d.exercises.splice(i, 1); state.progEdit = null; rr(); } return true;
    case 'progSaveEx': {
      const name = $('#peName').value.trim(); if (!name) { toast('Enter a name'); $('#peName').focus(); return true; }
      const sets = Math.max(1, Math.min(20, parseInt($('#peSets').value) || 1));
      const x = {name, sets, target: $('#peTarget').value.trim() || `${sets} sets`};
      const rest = $('#peRest').value; if (rest) x.rest = rest;
      const t = $('#peType').value; if (t !== 'wr') x.fields = TYPES[t].slice();
      const note = $('#peNote').value.trim(); if (note) x.note = note;
      if (state.progEdit === -1) d.exercises.push(x); else d.exercises[state.progEdit] = x;
      state.progEdit = null; rr(); toast('Saved'); return true;
    }
    case 'progReset': {
      const def = (activeProfile().id === 'cooper' ? seedRoutine('cooper') : PROGRAM).find(x => x.id === d.id);
      if (!def) { toast('No default for this day'); return true; }
      if (confirm(`Reset ${d.name} to the default program? Your changes to this day will be lost.`)) { r[r.indexOf(d)] = clone(def); state.progEdit = null; rr(); toast('Day reset'); }
      return true;
    }
  }
  return false;
}

function renderData() {
  setHeader('Backup');
  const sets = db.workouts.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.sets.filter(performed).length, 0), 0);
  const pn = esc(activeProfile().name);
  app.innerHTML = `<div class="card"><h2>${pn}'s data</h2><div class="muted">Saved on this device only (browser storage).<br>${db.workouts.length} workouts · ${sets} sets · ${db.weights.length} weight entries</div>
    <div class="muted small mt">All profiles: ${store.profiles.map(p => `${esc(p.name)} (${p.data.workouts.length} workouts, ${p.data.weights.length} weights)`).join(' · ')}</div></div>
    <div class="card backup-card"><h2>Back up</h2><div class="muted small">All profiles: workouts, weights and routines.</div>
      <div class="small mt" id="lastBackup">${store.lastBackup ? `Last backup: <b>${esc(new Date(store.lastBackup).toLocaleString(undefined, {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'}))}</b>` : 'Last backup: <b>never</b>'}</div>
      <button class="btn btn-primary btn-block mt drive-btn" data-act="shareBackup">☁️ Save to Google Drive</button>
      <div class="muted small mt">Opens your phone's share menu — pick <b>Drive</b>.</div>
      <button class="btn btn-block mt" data-act="export">Download JSON file</button></div>
    <div class="card"><h2>Restore</h2><div class="muted small">Full backups replace all profiles on this device. Older single-profile backups are imported into the current profile (${pn}).</div><button class="btn btn-block mt" data-act="import">Restore from file / Google Drive</button></div>
    <div class="card"><h2>Reset</h2><button class="btn btn-danger btn-block" data-act="wipe">Delete ${pn}'s data</button></div>
    <div class="muted small" id="appVersion" style="text-align:center">App version ${esc(APP_VERSION)}</div>`;
}

/* ---------- Actions ---------- */
function current() { return db.workouts.find(x => x.id === state.editing); }
function addExercise() {
  const inp = $('#exName'); const name = inp && inp.value.trim();
  if (!name) { inp && inp.focus(); return; }
  const w = current();
  const known = [...exerciseNames(), ...routine().flatMap(d => d.exercises.map(e => e.name))];
  const canonical = known.find(n => norm(n) === norm(name)) || name;
  const prev = lastTime(canonical, w.id, w.date);
  const tpl = templateFor(canonical);
  const type = $('#exType') && $('#exType').value;
  const fields = type ? TYPES[type] : prev ? prev.fields : tpl && tpl.fields ? tpl.fields : WR;
  const n = prev ? prev.sets.length : tpl ? tpl.sets : 1;
  const ex = {name: canonical, sets: prefillSets(canonical, fields, n, w.id, w.date, tpl && tpl.target)};
  if (fields.join() !== 'weight,reps') ex.fields = fields;
  if (tpl) { ex.target = tpl.target; if (tpl.rest) ex.rest = tpl.rest; if (tpl.note) ex.note = tpl.note; }
  w.exercises.push(ex);
  save(); renderEditor();
  const cards = document.querySelectorAll('.ex-card'); cards[cards.length - 1]?.scrollIntoView({block: 'center'});
}
// On finish: drop blank set rows but keep the exercise list.
function cleanWorkout(w, keepUnchecked) {
  for (const e of w.exercises) {
    if (keepUnchecked && !e.warmup) for (const st of e.sets) if (st.ok === false && filled(st)) st.ok = true;
    e.sets = e.sets.filter(performed);
  }
}
const hasUncheckedWithValues = w => w.exercises.some(e => !e.warmup && e.sets.some(st => st.ok === false && filled(st)));

/* ---------- Backups ---------- */
const backupName = () => `workout-backup-${todayISO()}.json`;
function backupData() {
  save();
  return {app: 'workout-tracker', version: 2, exportedAt: new Date().toISOString(), active: store.active, profiles: store.profiles.map(p => ({id: p.id, name: p.name, workouts: p.data.workouts, weights: p.data.weights, routine: p.routine, warmup: p.warmup !== false}))};
}
function markBackup() { store.lastBackup = Date.now(); save(); if (state.tab === 'data') renderData(); }
function downloadBackup(out) {
  const blob = new Blob([JSON.stringify(out, null, 2)], {type: 'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = backupName(); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000); markBackup();
}
async function shareBackup() {
  const out = backupData();
  let file = null;
  try { file = new File([JSON.stringify(out, null, 2)], backupName(), {type: 'application/json'}); } catch (e) {}
  if (file && navigator.canShare && navigator.share && navigator.canShare({files: [file]})) {
    try { await navigator.share({files: [file], title: 'Workout backup', text: 'Workout tracker backup ' + todayISO()}); markBackup(); toast('Backup shared'); }
    catch (e) { if (e && e.name !== 'AbortError') { downloadBackup(out); toast('Saved to Downloads, upload it to Drive'); } }
    return;
  }
  downloadBackup(out); toast('Saved to Downloads, upload it to Drive');
}
const backupDue = () => store.profiles.some(p => p.data.workouts.length) && (!store.lastBackup || Date.now() - store.lastBackup > 7 * 86400000);

app.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, ei = +b.dataset.ei, si = +b.dataset.si;
  if (routineAction(act, b)) return;
  const w = current();
  switch (act) {
    case 'new': state.picking = true; render(); window.scrollTo(0, 0); break;
    case 'startBlank': case 'startTpl': {
      const nw = {id: uid(), date: todayISO(), notes: '', exercises: [], created: Date.now(), status: 'in_progress'};
      const d = act === 'startTpl' && routine().find(x => x.id === b.dataset.tpl);
      if (d) {
        nw.template = d.id; nw.templateName = d.name; if (d.note) nw.templateNote = d.note;
        const fromTpl = t => { const fields = t.fields || WR; const ex = {name: t.name, target: t.target, sets: prefillSets(t.name, fields, t.sets, nw.id, nw.date, t.target)}; if (t.fields) ex.fields = fields; if (t.rest) ex.rest = t.rest; if (t.note) ex.note = t.note; return ex; };
        nw.exercises = d.exercises.map(fromTpl);
        const sd = routine().find(x => x.id === 'stretch');
        if (/^d[1-5]$/.test(d.id) && warmupOn() && sd && sd.exercises.length) {
          nw.exercises = [...sd.exercises.map(t => ({...fromTpl(t), warmup: true})), ...nw.exercises]; nw.warmup = 'open';
        }
      }
      db.workouts.push(nw); save(); state.picking = false; state.editing = nw.id; render(); window.scrollTo(0, 0); break;
    }
    case 'cancelPick': state.picking = false; render(); break;
    case 'finishBottom': finishWorkout(); break;
    case 'toggleSet': { const ex = w.exercises[ei], st = ex.sets[si]; st.ok = st.ok === false; w.updated = Date.now(); save(); if (st.ok) maybeStartRest(w, ex); const tr = b.closest('tr'); tr.classList.toggle('set-done', st.ok); b.classList.toggle('on', st.ok); b.setAttribute('aria-pressed', st.ok); break; }
    case 'wuToggle': w.warmup = w.warmup === 'collapsed' ? 'open' : 'collapsed'; save(); renderEditor(); break;
    case 'wuSkip': if (confirm('Skip the warm-up stretch for this workout?')) { if (holdTimer && w.exercises[holdTimer.ei] && w.exercises[holdTimer.ei].warmup) holdTimer = null; w.exercises = w.exercises.filter(e => !e.warmup); w.warmup = 'skipped'; w.updated = Date.now(); save(); renderEditor(); toast('Stretch skipped'); } break;
    case 'holdTimer': {
      if (holdTimer && holdTimer.wid === w.id && holdTimer.ei === ei && holdTimer.si === si) { holdTimer = null; renderEditor(); break; }
      const secs = Math.max(1, parseInt(w.exercises[ei].sets[si].sec) || holdFromTarget(w.exercises[ei].target) || 30);
      holdTimer = {wid: w.id, ei, si, end: Date.now() + secs * 1000}; renderEditor(); tick(); break;
    }
    case 'toggleDone': { const st = w.exercises[ei].sets[si]; st.done = !st.done; save(); renderEditor(); break; }
    case 'open': state.editing = b.dataset.id; render(); window.scrollTo(0, 0); break;
    case 'addEx': addExercise(); break;
    case 'delEx': if (confirm(`Remove ${w.exercises[ei].name}?`)) { w.exercises.splice(ei, 1); save(); renderEditor(); } break;
    case 'addSet': { const ex = w.exercises[ei], sets = ex.sets, last = sets[sets.length - 1]; const ns = blankSet(fieldsOf(ex)); if (last) for (const k of Object.keys(ns)) if (k !== 'done' && k !== 'ok') ns[k] = last[k] ?? ''; sets.push(ns); save(); renderEditor(); break; }
    case 'delSet': w.exercises[ei].sets.splice(si, 1); save(); renderEditor(); break;
    case 'delWorkout': if (confirm('Delete this workout?')) { db.workouts = db.workouts.filter(x => x.id !== w.id); save(); state.editing = null; render(); toast('Workout deleted'); } break;
    case 'saveWeight': {
      const date = $('#wDate').value, lbs = num($('#wLbs').value);
      if (!date || lbs == null || lbs <= 0) { toast('Enter a date and weight'); break; }
      if (state.weightEditDate && state.weightEditDate !== date) db.weights = db.weights.filter(e => e.date !== state.weightEditDate);
      const ex = db.weights.find(e => e.date === date);
      if (ex) ex.lbs = lbs; else db.weights.push({date, lbs});
      state.weightEditDate = null; save(); renderWeight(); toast('Weight saved'); break;
    }
    case 'editWeight': state.weightEditDate = b.dataset.date; renderWeight(); window.scrollTo(0, 0); break;
    case 'cancelWeight': state.weightEditDate = null; renderWeight(); break;
    case 'delWeight': if (confirm('Delete this weight entry?')) { db.weights = db.weights.filter(e => e.date !== b.dataset.date); if (state.weightEditDate === b.dataset.date) state.weightEditDate = null; save(); renderWeight(); } break;
    case 'shareBackup': shareBackup(); break;
    case 'gotoBackup': finishEditing(); state.tab = 'data'; render(); window.scrollTo(0, 0); break;
    case 'export': {
      save();
      const out = {app: 'workout-tracker', version: 2, exportedAt: new Date().toISOString(), active: store.active, profiles: store.profiles.map(p => ({id: p.id, name: p.name, workouts: p.data.workouts, weights: p.data.weights, routine: p.routine, warmup: p.warmup !== false}))};
      downloadBackup(out); toast('Backup downloaded'); break;
    }
    case 'import': $('#importFile').click(); break;
    case 'wipe': if (confirm(`Delete ALL of ${activeProfile().name}'s workouts and weight entries?`)) { db = emptyData(); save(); renderData(); toast('Data deleted'); } break;
  }
});
$('#topAction').addEventListener('click', ev => {
  if (ev.target.closest('[data-act="cancelPick"]')) { state.picking = false; render(); return; }
  if (ev.target.closest('[data-act="exitWorkout"]')) { save(); state.editing = null; render(); window.scrollTo(0, 0); toast('Workout saved — resume anytime'); return; }
  if (ev.target.closest('[data-act="done"]')) finishWorkout();
});
function finishWorkout() {
  const w = current();
  if (w) { const was = inProgress(w); cleanWorkout(w, hasUncheckedWithValues(w) && confirm('Some sets have values but aren’t checked. Save unchecked sets too?\n\nOK = save them · Cancel = drop them')); if (was) { delete w.status; w.finished = Date.now(); } save(); toast(was ? 'Workout finished 💪' : 'Workout saved'); }
  state.editing = null; render(); window.scrollTo(0, 0);
}
app.addEventListener('input', ev => {
  const t = ev.target, w = current();
  if (t.id === 'wuSetting') { activeProfile().warmup = t.checked; save(); toast(t.checked ? 'Warm-up stretch on' : 'Warm-up stretch off'); return; }
  if ((t.id === 'dayName' || t.id === 'dayNote') && state.progDay) { const d = routine().find(x => x.id === state.progDay); if (d) { if (t.id === 'dayName') { if (t.value.trim()) d.name = t.value.trim().slice(0, 60); } else d.note = t.value.trim(); save(); } return; }
  if (w && (t.dataset.k || t.dataset.f)) w.updated = Date.now();
  if (t.dataset.k && w) {
    const ei = +t.dataset.ei, si = +t.dataset.si, k = t.dataset.k, sets = w.exercises[ei].sets, old = sets[si][k] ?? '', v = t.value.trim();
    sets[si][k] = v;
    // Copy into following unchecked sets that are empty or still hold the old (copied/prefilled) value.
    for (let j = si + 1; j < sets.length; j++) {
      const sj = sets[j];
      if (sj.ok !== false || !((sj[k] ?? '') === '' || (sj[k] ?? '') === old)) continue;
      sj[k] = v; const inp = app.querySelector(`input[data-ei="${ei}"][data-si="${j}"][data-k="${k}"]`); if (inp) inp.value = v;
    }
    save();
  }
  else if (t.dataset.f && w) { w[t.dataset.f] = t.value; save(); }
  else if (t.id === 'exName') {
    const pv = $('#exPreview'), name = t.value.trim(), prev = name && lastTime(name, w.id, w.date), best = name && bestWeight(name);
    pv.hidden = !prev; if (prev) pv.innerHTML = `Last time (${esc(fmtShort(prev.date))}): ${esc(prevStr(prev))}${best ? ` · 🏆 ${fmtNum(best.weight)} lbs` : ''}`;
  } else if (t.id === 'wDate' && !state.weightEditDate) {
    const ex = db.weights.find(e => e.date === t.value); $('#wLbs').value = ex ? ex.lbs : '';
  }
});
app.addEventListener('change', ev => { if (ev.target.dataset.f === 'date') renderEditor(); });
app.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.id === 'exName') { ev.preventDefault(); addExercise(); } });
document.querySelector('.tabs').addEventListener('click', ev => {
  const b = ev.target.closest('.tab'); if (!b) return;
  finishEditing();
  state.tab = b.dataset.tab; render(); window.scrollTo(0, 0);
});

function validateImport(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.workouts)) throw new Error('Not a workout backup file');
  const workouts = d.workouts.map(w => ({
    id: String(w.id || uid()), date: /^\d{4}-\d{2}-\d{2}$/.test(w.date) ? w.date : todayISO(), notes: String(w.notes || ''), created: +w.created || Date.now(),
    exercises: (Array.isArray(w.exercises) ? w.exercises : []).map(e => {
      const ex = {name: String(e.name || 'Exercise'), sets: (Array.isArray(e.sets) ? e.sets : []).map(s => {
        const o = {weight: s.weight == null ? '' : String(s.weight), reps: s.reps == null ? '' : String(s.reps)};
        for (const k of ['sec', 'min']) if (s[k] != null) o[k] = String(s[k]);
        if (s.done != null) o.done = !!s.done;
        if (s.ok === false) o.ok = false; else if (s.ok === true) o.ok = true;
        return o;
      })};
      if (Array.isArray(e.fields)) ex.fields = e.fields.filter(k => k in FIELD);
      for (const k of ['target', 'rest', 'note']) if (e[k]) ex[k] = String(e[k]);
      if (e.warmup) ex.warmup = true;
      return ex;
    })
  }));
  d.workouts.forEach((w, i) => { for (const k of ['template', 'templateName', 'templateNote']) if (w[k]) workouts[i][k] = String(w[k]); if (w.status === 'in_progress') workouts[i].status = 'in_progress'; if (['open', 'collapsed', 'skipped'].includes(w.warmup)) workouts[i].warmup = w.warmup; for (const k of ['finished', 'updated']) if (+w[k]) workouts[i][k] = +w[k]; });
  const byDate = new Map();
  for (const e of (Array.isArray(d.weights) ? d.weights : [])) { const lbs = num(e.lbs); if (/^\d{4}-\d{2}-\d{2}$/.test(e.date) && lbs != null) byDate.set(e.date, {date: e.date, lbs}); }
  return {version: 1, workouts, weights: [...byDate.values()]};
}
function validateFullImport(raw) {
  const profiles = raw.profiles.map((p, i) => ({id: String(p.id || 'p' + i), name: String(p.name || 'Profile ' + (i + 1)), data: validateImport({workouts: p.workouts || (p.data && p.data.workouts) || [], weights: p.weights || (p.data && p.data.weights) || []}), routine: Array.isArray(p.routine) && p.routine.length ? cleanRoutine(p.routine) : seedRoutine(String(p.id || '')), warmup: p.warmup !== false}));
  if (!profiles.length) throw new Error('Backup has no profiles');
  return {version: 2, active: profiles.some(p => p.id === raw.active) ? raw.active : profiles[0].id, profiles};
}
$('#profileBar').addEventListener('click', renderProfileSheet);
$('#restBar').addEventListener('click', ev => {
  const b = ev.target.closest('[data-r]'), r = getRest(); if (!b || !r) return;
  if (b.dataset.r === 'skip') setRest(null);
  else { r.end += (b.dataset.r === 'plus' ? 15 : -15) * 1000; if (r.end - Date.now() > 0) r.alerted = false; setRest(r); }
});
$('#profileSheet').addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]');
  if (!b) { if (ev.target.id === 'profileSheet') $('#profileSheet').hidden = true; return; }
  const p = store.profiles.find(x => x.id === b.dataset.pid);
  if (b.dataset.act === 'closeSheet') $('#profileSheet').hidden = true;
  else if (b.dataset.act === 'switchProfile' && p) {
    finishEditing(); store.active = p.id; db = p.data; save();
    $('#profileSheet').hidden = true; render(); window.scrollTo(0, 0); toast(`Now logging for ${p.name}`);
  } else if (b.dataset.act === 'renameProfile' && p) {
    const n = prompt('Profile name', p.name);
    if (n && n.trim()) { p.name = n.trim().slice(0, 30); save(); renderProfileSheet(); render(); }
  }
});
$('#importFile').addEventListener('change', async ev => {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  try {
    const raw = JSON.parse(await f.text());
    finishEditing();
    if (raw && Array.isArray(raw.profiles)) {
      const ns = validateFullImport(raw);
      if (!confirm(`Import ${ns.profiles.length} profiles (${ns.profiles.map(p => `${p.name}: ${p.data.workouts.length} workouts`).join(', ')})? This replaces all profiles on this device.`)) return;
      const lb = store.lastBackup; store = ns; if (lb) store.lastBackup = lb; db = activeProfile().data; save();
    } else {
      const d = validateImport(raw);
      if (!confirm(`Import ${d.workouts.length} workouts and ${d.weights.length} weight entries into ${activeProfile().name}? This replaces ${activeProfile().name}'s current data.`)) return;
      db = d; save();
    }
    render(); toast('Backup imported');
  } catch (e) { alert('Import failed: ' + e.message); }
});

// Exposed for testing/automation only.
window.WT = {get db() { return db; }, getRest, get lastAlert() { return lastAlert; }, get holdTimer() { return holdTimer; }, tick, PROGRAM, routine, suggestedDay, validateImport, weightStats, lastTime, bestWeight, reload() { store = loadStore(); db = activeProfile().data; render(); },
  get store() { return store; }, seed(d) { db = cleanData(d); save(); render(); }, switchTo(id) { finishEditing(); store.active = id; db = activeProfile().data; save(); render(); }, validateFullImport};

render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // A new version took over: reload once (skip on very first install). Data lives in localStorage, so it is kept.
    if (!hadController || reloaded) return;
    reloaded = true; location.reload();
  });
  navigator.serviceWorker.register('sw.js', {updateViaCache: 'none'}).then(reg => {
    const check = () => reg.update().catch(() => {});
    check();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  }).catch(() => {});
}
