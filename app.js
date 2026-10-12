'use strict';
/* Workout Tracker — plain JS, data in localStorage. */
const KEY = 'workoutTracker.v1';
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
const blankSet = fields => Object.fromEntries(fields.map(k => [k, k === 'done' ? false : '']));
const suggestedDay = () => { const wd = new Date().getDay(); return wd >= 1 && wd <= 5 ? PROGRAM[wd - 1].id : null; };
function templateFor(name) { for (const d of PROGRAM) for (const e of d.exercises) if (norm(e.name) === norm(name)) return e; return null; }

let db = load();
let state = {tab: 'home', editing: null, picking: false, weightEditDate: null};

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.workouts)) return {version: 1, workouts: d.workouts, weights: Array.isArray(d.weights) ? d.weights : []};
  } catch (e) {}
  return {version: 1, workouts: [], weights: []};
}
function save() { localStorage.setItem(KEY, JSON.stringify(db)); }
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
    const e = w.exercises.find(x => norm(x.name) === norm(name) && x.sets.some(filled));
    if (e) return {date: w.date, sets: e.sets.filter(filled), fields: fieldsOf(e)};
  }
  return null;
}
function bestWeight(name) {
  let best = null;
  for (const w of db.workouts) for (const e of w.exercises) if (norm(e.name) === norm(name))
    for (const s of e.sets) { const wt = num(s.weight); if (wt != null && (best == null || wt > best.weight)) best = {weight: wt, reps: s.reps, date: w.date}; }
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
function render() {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  if (state.tab === 'home') state.editing ? renderEditor() : state.picking ? renderPicker() : renderHome();
  else if (state.tab === 'weight') renderWeight();
  else renderData();
}

function renderHome() {
  setHeader('Workouts');
  const ws = sortedWorkouts();
  const names = exerciseNames();
  let h = `<button class="btn btn-primary btn-block" data-act="new">＋ Start workout</button><div class="mt"></div>`;
  if (!ws.length) h += `<div class="empty">No workouts yet.<br>Tap <b>Start workout</b> to log your first one.</div>`;
  else {
    h += `<h2 style="font-size:15px;color:var(--muted);margin:8px 2px">History</h2>`;
    for (const w of ws) {
      const sets = w.exercises.reduce((n, e) => n + e.sets.length, 0);
      const exNames = w.exercises.map(e => e.name).filter(Boolean);
      h += `<button class="list-item" data-act="open" data-id="${w.id}"><div class="grow"><div class="t">${esc(fmtDate(w.date))}</div>${w.templateName ? `<div class="small" style="color:var(--accent)">${esc(w.templateName)}</div>` : ''}
        <div class="muted small">${exNames.length ? esc(exNames.join(' · ')) : 'No exercises'}</div>
        <div class="muted small">${w.exercises.length} exercise${w.exercises.length === 1 ? '' : 's'} · ${sets} set${sets === 1 ? '' : 's'}${w.notes ? ' · 📝' : ''}</div></div><span class="chev">›</span></button>`;
    }
  }
  if (names.length) {
    h += `<div class="card mt"><h2>🏆 Best weight per exercise</h2><div class="bests">`;
    for (const n of names.sort((a, b) => a.localeCompare(b))) { const b = bestWeight(n); h += `<div>${esc(n)}</div><div>${b ? fmtNum(b.weight) + ' lbs' : '—'}</div>`; }
    h += `</div></div>`;
  }
  app.innerHTML = h;
}

function renderPicker() {
  setHeader('Start workout', `<button class="btn btn-sm" data-act="cancelPick">Cancel</button>`);
  const sug = suggestedDay();
  let h = `<div class="muted small" style="margin:0 2px 10px">Pick a day from your program${sug ? ' — today is suggested' : ''}, or start blank.</div>`;
  for (const d of PROGRAM) {
    h += `<button class="list-item day-pick${d.id === sug ? ' suggested' : ''}" data-act="startTpl" data-tpl="${d.id}"><div class="grow"><div class="t">${esc(d.name)}${d.id === sug ? ' <span class="badge">Today</span>' : ''}</div>
      <div class="muted small">${esc(d.exercises.map(e => e.name).join(' · '))}</div></div><span class="chev">›</span></button>`;
  }
  h += `<button class="list-item" data-act="startBlank"><div class="grow"><div class="t">＋ Blank workout</div><div class="muted small">Add your own exercises</div></div><span class="chev">›</span></button>`;
  app.innerHTML = h;
}

function renderEditor() {
  const w = db.workouts.find(x => x.id === state.editing);
  if (!w) { state.editing = null; return renderHome(); }
  setHeader('Workout', `<button class="btn btn-primary btn-sm" data-act="done">Done</button>`);
  let h = `<div class="card"><div class="row"><div class="grow"><label>Date</label><input type="date" data-f="date" value="${esc(w.date)}"></div></div>
    <div class="mt"><label>Notes (optional)</label><textarea data-f="notes" placeholder="How did it feel?">${esc(w.notes || '')}</textarea></div></div>`;
  if (w.templateName) h += `<div class="card tpl-banner"><div class="t">${esc(w.templateName)}</div>${w.templateNote ? `<div class="mt small">📌 ${esc(w.templateNote)}</div>` : ''}<div class="mt small muted">⏱ ${esc(REST_NOTE)}</div></div>`;
  w.exercises.forEach((e, ei) => {
    const prev = lastTime(e.name, w.id, w.date);
    const fields = fieldsOf(e);
    const best = fields.includes('weight') ? bestWeight(e.name) : null;
    h += `<div class="ex-card"><div class="ex-head"><div><div class="ex-name">${esc(e.name)}</div>${e.target ? `<div class="target">Target ${esc(e.target)}${e.rest ? ` · rest ${e.rest === 'heavy' ? '2–3 min' : '60–90 s'}` : ''}</div>` : ''}</div><button class="btn-icon" data-act="delEx" data-ei="${ei}" aria-label="Remove exercise">🗑</button></div>
      ${e.note ? `<div class="ex-note small">${esc(e.note)}</div>` : ''}
      <div class="prev">${prev ? `Last time (${esc(fmtShort(prev.date))}): <b>${esc(prevStr(prev))}</b>` : 'First time logging this exercise'}
      ${best ? `<br><span class="pr">🏆 Best: <b>${fmtNum(best.weight)} lbs</b></span> <span>(${esc(fmtShort(best.date))})</span>` : ''}</div>
      <table class="sets"><thead><tr><th></th>${fields.map(k => `<th>${k === 'done' ? 'Round' : FIELD[k].label}</th>`).join('')}<th></th></tr></thead><tbody>`;
    e.sets.forEach((s, si) => {
      const ps = prev && prev.sets[si];
      h += `<tr><td class="n">${si + 1}</td>${fields.map(k => k === 'done'
        ? `<td><button class="btn round-btn${s.done ? ' on' : ''}" data-act="toggleDone" data-ei="${ei}" data-si="${si}">${s.done ? '✓ Done' : 'Mark done'}</button></td>`
        : `<td><input inputmode="${FIELD[k].mode}" data-ei="${ei}" data-si="${si}" data-k="${k}" value="${esc(s[k] ?? '')}" placeholder="${ps && ps[k] !== undefined && ps[k] !== '' ? esc(ps[k]) : FIELD[k].ph}" aria-label="${FIELD[k].label}"></td>`).join('')}
        <td class="x"><button class="btn-icon" data-act="delSet" data-ei="${ei}" data-si="${si}" aria-label="Remove set">✕</button></td></tr>`;
    });
    h += `</tbody></table><button class="btn btn-sm mt" data-act="addSet" data-ei="${ei}">＋ Add ${fields.includes('done') ? 'round' : 'set'}</button></div>`;
  });
  h += `<div class="card"><label>Add exercise</label><div class="row"><input class="grow" id="exName" list="exList" placeholder="e.g. Bench Press" autocomplete="off" enterkeyhint="done">
    <button class="btn btn-primary" data-act="addEx">Add</button></div>
    <div class="mt"><label>Log as</label><select id="exType"><option value="">Auto (weight × reps)</option><option value="wr">Weight × reps</option><option value="r">Reps only</option><option value="ws">Weight + seconds</option><option value="s">Seconds</option><option value="m">Minutes</option><option value="d">Rounds</option></select></div><datalist id="exList">${exerciseNames().map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div id="exPreview" class="muted small mt" hidden></div></div>
    <button class="btn btn-danger btn-block mt" data-act="delWorkout">Delete workout</button>`;
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

function renderData() {
  setHeader('Backup');
  const sets = db.workouts.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.sets.length, 0), 0);
  app.innerHTML = `<div class="card"><h2>Your data</h2><div class="muted">Saved on this device only (browser storage).<br>${db.workouts.length} workouts · ${sets} sets · ${db.weights.length} weight entries</div></div>
    <div class="card"><h2>Export</h2><div class="muted small">Download a JSON backup of workouts and weight entries.</div><button class="btn btn-primary btn-block mt" data-act="export">Export JSON</button></div>
    <div class="card"><h2>Import</h2><div class="muted small">Restore from a JSON backup. This replaces the data currently on this device.</div><button class="btn btn-block mt" data-act="import">Import JSON…</button></div>
    <div class="card"><h2>Reset</h2><button class="btn btn-danger btn-block" data-act="wipe">Delete all data</button></div>`;
}

/* ---------- Actions ---------- */
function current() { return db.workouts.find(x => x.id === state.editing); }
function addExercise() {
  const inp = $('#exName'); const name = inp && inp.value.trim();
  if (!name) { inp && inp.focus(); return; }
  const w = current();
  const known = [...exerciseNames(), ...PROGRAM.flatMap(d => d.exercises.map(e => e.name))];
  const canonical = known.find(n => norm(n) === norm(name)) || name;
  const prev = lastTime(canonical, w.id, w.date);
  const tpl = templateFor(canonical);
  const type = $('#exType') && $('#exType').value;
  const fields = type ? TYPES[type] : prev ? prev.fields : tpl && tpl.fields ? tpl.fields : WR;
  const n = prev ? prev.sets.length : tpl ? tpl.sets : 1;
  const ex = {name: canonical, sets: Array.from({length: n}, () => blankSet(fields))};
  if (fields.join() !== 'weight,reps') ex.fields = fields;
  if (tpl) { ex.target = tpl.target; if (tpl.rest) ex.rest = tpl.rest; if (tpl.note) ex.note = tpl.note; }
  w.exercises.push(ex);
  save(); renderEditor();
  const cards = document.querySelectorAll('.ex-card'); cards[cards.length - 1]?.scrollIntoView({block: 'center'});
}
function cleanWorkout(w) {
  for (const e of w.exercises) e.sets = e.sets.filter(filled);
  w.exercises = w.exercises.filter(e => e.sets.length);
}

app.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, ei = +b.dataset.ei, si = +b.dataset.si;
  const w = current();
  switch (act) {
    case 'new': state.picking = true; render(); window.scrollTo(0, 0); break;
    case 'startBlank': case 'startTpl': {
      const nw = {id: uid(), date: todayISO(), notes: '', exercises: [], created: Date.now()};
      const d = act === 'startTpl' && PROGRAM.find(x => x.id === b.dataset.tpl);
      if (d) {
        nw.template = d.id; nw.templateName = d.name; if (d.note) nw.templateNote = d.note;
        nw.exercises = d.exercises.map(t => { const fields = t.fields || WR; const ex = {name: t.name, target: t.target, sets: Array.from({length: t.sets}, () => blankSet(fields))}; if (t.fields) ex.fields = fields; if (t.rest) ex.rest = t.rest; if (t.note) ex.note = t.note; return ex; });
      }
      db.workouts.push(nw); save(); state.picking = false; state.editing = nw.id; render(); window.scrollTo(0, 0); break;
    }
    case 'cancelPick': state.picking = false; render(); break;
    case 'toggleDone': { const st = w.exercises[ei].sets[si]; st.done = !st.done; save(); renderEditor(); break; }
    case 'open': state.editing = b.dataset.id; render(); window.scrollTo(0, 0); break;
    case 'addEx': addExercise(); break;
    case 'delEx': if (confirm(`Remove ${w.exercises[ei].name}?`)) { w.exercises.splice(ei, 1); save(); renderEditor(); } break;
    case 'addSet': { const ex = w.exercises[ei], sets = ex.sets, last = sets[sets.length - 1]; const ns = blankSet(fieldsOf(ex)); if (last) for (const k of Object.keys(ns)) if (k !== 'done') ns[k] = last[k] ?? ''; sets.push(ns); save(); renderEditor(); break; }
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
    case 'export': {
      const blob = new Blob([JSON.stringify({app: 'workout-tracker', exportedAt: new Date().toISOString(), ...db}, null, 2)], {type: 'application/json'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `workouts-backup-${todayISO()}.json`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast('Backup exported'); break;
    }
    case 'import': $('#importFile').click(); break;
    case 'wipe': if (confirm('Delete ALL workouts and weight entries on this device?')) { db = {version: 1, workouts: [], weights: []}; save(); renderData(); toast('All data deleted'); } break;
  }
});
$('#topAction').addEventListener('click', ev => {
  if (ev.target.closest('[data-act="cancelPick"]')) { state.picking = false; render(); return; }
  if (!ev.target.closest('[data-act="done"]')) return;
  const w = current();
  if (w) { cleanWorkout(w); if (!w.exercises.length && !w.notes.trim()) db.workouts = db.workouts.filter(x => x.id !== w.id); else toast('Workout saved'); save(); }
  state.editing = null; render(); window.scrollTo(0, 0);
});
app.addEventListener('input', ev => {
  const t = ev.target, w = current();
  if (t.dataset.k && w) { w.exercises[+t.dataset.ei].sets[+t.dataset.si][t.dataset.k] = t.value.trim(); save(); }
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
  if (state.editing) { const w = current(); if (w) { cleanWorkout(w); if (!w.exercises.length && !w.notes.trim()) db.workouts = db.workouts.filter(x => x.id !== w.id); save(); } state.editing = null; }
  state.tab = b.dataset.tab; state.picking = false; state.weightEditDate = null; render(); window.scrollTo(0, 0);
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
        return o;
      })};
      if (Array.isArray(e.fields)) ex.fields = e.fields.filter(k => k in FIELD);
      for (const k of ['target', 'rest', 'note']) if (e[k]) ex[k] = String(e[k]);
      return ex;
    })
  }));
  d.workouts.forEach((w, i) => { for (const k of ['template', 'templateName', 'templateNote']) if (w[k]) workouts[i][k] = String(w[k]); });
  const byDate = new Map();
  for (const e of (Array.isArray(d.weights) ? d.weights : [])) { const lbs = num(e.lbs); if (/^\d{4}-\d{2}-\d{2}$/.test(e.date) && lbs != null) byDate.set(e.date, {date: e.date, lbs}); }
  return {version: 1, workouts, weights: [...byDate.values()]};
}
$('#importFile').addEventListener('change', async ev => {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  try {
    const d = validateImport(JSON.parse(await f.text()));
    if (!confirm(`Import ${d.workouts.length} workouts and ${d.weights.length} weight entries? This replaces current data.`)) return;
    db = d; save(); render(); toast('Backup imported');
  } catch (e) { alert('Import failed: ' + e.message); }
});

// Exposed for testing/automation only.
window.WT = {get db() { return db; }, PROGRAM, suggestedDay, validateImport, weightStats, lastTime, bestWeight, reload() { db = load(); render(); }};

render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
