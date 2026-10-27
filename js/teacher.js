const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
const rows = new Map();
const seen = new Set();
let firstLoad = true;

const STATUS_LABELS = {
  in_progress: 'Проходить',
  finished: 'Завершив(-ла)',
  timeout: 'Час вийшов',
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatTime(sec) {
  sec = Math.max(0, Math.round(sec));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

function elapsedSec(r) {
  const start = Date.parse(r.started_at);
  const end = r.finished_at ? Date.parse(r.finished_at) : Date.now();
  return Math.min(QUIZ_DURATION_SEC, (end - start) / 1000);
}

// Студент, який закрив сторінку й не повернувся, після дедлайну вважається таким, що вичерпав час.
function effectiveStatus(r) {
  if (r.status === 'in_progress' && elapsedSec(r) >= QUIZ_DURATION_SEC) return 'timeout';
  return r.status;
}

function setLive(ok, text) {
  $('live').classList.toggle('live--ok', ok);
  $('live-text').textContent = text;
}

function sortedRows() {
  return [...rows.values()].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
}

function renderStats(list) {
  const done = list.filter((r) => effectiveStatus(r) !== 'in_progress');
  $('stat-total').textContent = list.length;
  $('stat-active').textContent = list.length - done.length;
  $('stat-done').textContent = done.length;
  $('stat-avg').textContent = done.length
    ? (done.reduce((s, r) => s + r.score, 0) / done.length).toFixed(1).replace('.', ',')
    : '—';

  $('questions-stats').innerHTML = QUESTIONS.map((q, i) => {
    const answered = list.filter((r) => Array.isArray(r.answers) && r.answers.length > i);
    const correct = answered.filter((r) => r.answers[i] === q.correct).length;
    const pct = answered.length ? Math.round((correct / answered.length) * 100) : 0;
    return `
      <div class="qstat">
        <div class="qstat__head">
          <span class="qstat__num">${i + 1}</span>
          <span class="qstat__text">${escapeHtml(q.text)}</span>
        </div>
        <div class="qstat__bar"><div class="qstat__fill" style="width:${pct}%"></div></div>
        <div class="qstat__meta">${answered.length ? `${pct}% · ${correct} з ${answered.length}` : 'ще немає відповідей'}</div>
      </div>`;
  }).join('');
}

function studentHtml(r) {
  const status = effectiveStatus(r);
  const answers = Array.isArray(r.answers) ? r.answers : [];
  const isNew = !firstLoad && !seen.has(r.id);
  seen.add(r.id);
  const dots = QUESTIONS.map((q, i) => {
    const a = answers[i];
    const cls = a === undefined ? '' : a === q.correct ? 'dot--ok' : 'dot--bad';
    const title = a === undefined ? 'немає відповіді' : q.options[a];
    return `<span class="dot ${cls}" title="${i + 1}. ${escapeHtml(title)}">${i + 1}</span>`;
  }).join('');
  return `
    <article class="student student--${status}${isNew ? ' student--new' : ''}">
      <div class="student__row">
        <div class="student__name">${escapeHtml(r.name)}</div>
        <span class="badge badge--${status}">${STATUS_LABELS[status]}</span>
      </div>
      <div class="student__bar"><div class="student__fill" style="width:${(answers.length / QUESTIONS.length) * 100}%"></div></div>
      <div class="student__row student__row--meta">
        <div class="dots">${dots}</div>
        <div class="student__nums">
          <span class="student__score">${r.score}/${QUESTIONS.length}</span>
          <span class="student__time" data-id="${r.id}">${formatTime(elapsedSec(r))}</span>
        </div>
      </div>
    </article>`;
}

function render() {
  const list = sortedRows();
  renderStats(list);
  $('students').innerHTML = list.map(studentHtml).join('');
  $('empty').hidden = list.length > 0;
  firstLoad = false;
}

// Щосекунди оновлюємо лише таймери; повний перерендер — коли хтось вичерпав час.
function tick() {
  let statusChanged = false;
  document.querySelectorAll('.student__time').forEach((el) => {
    const r = rows.get(el.dataset.id);
    if (!r) return;
    el.textContent = formatTime(elapsedSec(r));
    const card = el.closest('.student');
    if (card && !card.classList.contains(`student--${effectiveStatus(r)}`)) statusChanged = true;
  });
  if (statusChanged) render();
}

async function loadAll() {
  const { data, error } = await db.from('participants').select('*').order('started_at', { ascending: false });
  if (error) {
    setLive(false, 'Помилка завантаження');
    return;
  }
  rows.clear();
  data.forEach((r) => rows.set(r.id, r));
  if (firstLoad) data.forEach((r) => seen.add(r.id));
  render();
}

db.channel('participants-live')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, (payload) => {
    if (payload.eventType === 'DELETE') rows.delete(payload.old.id);
    else rows.set(payload.new.id, payload.new);
    render();
  })
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      setLive(true, 'Онлайн');
      loadAll();
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      setLive(false, 'Перепідключення…');
    }
  });

setInterval(tick, 1000);
// Підстраховка на випадок, якщо realtime-подія загубилася.
setInterval(loadAll, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadAll(); });
loadAll();
