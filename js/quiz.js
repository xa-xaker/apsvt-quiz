const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const STORE_KEY = 'ai-quiz-session';
const $ = (id) => document.getElementById(id);

// { id, name, startedAt (ms), answers: number[], status, finishedAt }
let state = null;
let selected = null;
let timerId = null;
let retryId = null;

function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { return null; }
}

function clearState() {
  try { localStorage.removeItem(STORE_KEY); } catch (e) {}
}

function formatTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function show(screen) {
  ['screen-start', 'screen-quiz', 'screen-result'].forEach((s) => { $(s).hidden = s !== screen; });
  $('timer').hidden = screen !== 'screen-quiz';
}

function score() {
  return state.answers.reduce((sum, a, i) => sum + (a === QUESTIONS[i].correct ? 1 : 0), 0);
}

function remainingSec() {
  return QUIZ_DURATION_SEC - (Date.now() - state.startedAt) / 1000;
}

let syncing = false;
let syncPending = false;

// Відправляє повний стан на сервер по одному запиту за раз; при помилці повторює, доки не вдасться.
async function sync() {
  clearTimeout(retryId);
  if (syncing) { syncPending = true; return; }
  syncing = true;
  syncPending = false;
  const payload = {
    answers: state.answers,
    current_question: state.answers.length,
    score: score(),
    status: state.status,
    finished_at: state.finishedAt ? new Date(state.finishedAt).toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from('participants').update(payload).eq('id', state.id);
  syncing = false;
  if (syncPending) {
    sync();
  } else if (error) {
    $('sync-status').textContent = 'Немає з\'єднання. Відповіді збережено, повторна спроба…';
    $('sync-status').hidden = false;
    retryId = setTimeout(sync, 3000);
  } else {
    $('sync-status').hidden = true;
  }
}

function tick() {
  const left = remainingSec();
  $('timer-value').textContent = formatTime(left);
  $('timer').classList.toggle('timer--warn', left <= 60);
  if (left <= 0) finish('timeout');
}

function startTimer() {
  clearInterval(timerId);
  tick();
  timerId = setInterval(tick, 500);
}

function renderQuestion() {
  const i = state.answers.length;
  const q = QUESTIONS[i];
  selected = null;
  $('progress-text').textContent = `Питання ${i + 1} з ${QUESTIONS.length}`;
  $('progress-fill').style.width = `${(i / QUESTIONS.length) * 100}%`;
  $('question-text').textContent = q.text;
  $('next-btn').disabled = true;
  $('next-btn').textContent = i === QUESTIONS.length - 1 ? 'Завершити' : 'Відповісти';

  const box = $('options');
  box.innerHTML = '';
  q.options.forEach((text, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', 'false');
    btn.innerHTML = `<span class="option__letter">${'АБВГ'[idx]}</span><span class="option__text"></span>`;
    btn.querySelector('.option__text').textContent = text;
    btn.addEventListener('click', () => {
      selected = idx;
      box.querySelectorAll('.option').forEach((b, j) => {
        b.classList.toggle('option--selected', j === idx);
        b.setAttribute('aria-checked', String(j === idx));
      });
      $('next-btn').disabled = false;
    });
    box.appendChild(btn);
  });
}

function submitAnswer() {
  if (selected === null || state.status !== 'in_progress') return;
  state.answers.push(selected);
  saveState();
  if (state.answers.length >= QUESTIONS.length) {
    finish('finished');
  } else {
    sync();
    renderQuestion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function finish(status) {
  if (state.status !== 'in_progress') return;
  clearInterval(timerId);
  state.status = status;
  state.finishedAt = Math.min(Date.now(), state.startedAt + QUIZ_DURATION_SEC * 1000);
  saveState();
  sync();
  renderResult();
}

function renderResult() {
  show('screen-result');
  const total = QUESTIONS.length;
  const spent = (state.finishedAt - state.startedAt) / 1000;
  $('result-title').textContent = state.status === 'timeout' ? 'Час вичерпано' : `Дякуємо, ${state.name}!`;
  $('result-score').textContent = `${score()} / ${total}`;
  $('result-meta').textContent = `Відповідей: ${state.answers.length} з ${total} · Час: ${formatTime(spent)}`;

  const list = $('result-list');
  list.innerHTML = '';
  QUESTIONS.forEach((q, i) => {
    const a = state.answers[i];
    const li = document.createElement('li');
    const ok = a === q.correct;
    li.className = `review__item ${a === undefined ? 'review__item--skip' : ok ? 'review__item--ok' : 'review__item--bad'}`;
    const yours = a === undefined ? 'немає відповіді' : q.options[a];
    li.innerHTML = '<div class="review__q"></div><div class="review__a"></div>';
    li.querySelector('.review__q').textContent = q.text;
    li.querySelector('.review__a').textContent = ok ? `✓ ${yours}` : `✗ ${yours} — правильно: ${q.options[q.correct]}`;
    list.appendChild(li);
  });
}

async function start(name) {
  const btn = $('start-btn');
  btn.disabled = true;
  btn.textContent = 'Зачекайте…';
  $('start-error').hidden = true;
  const { data, error } = await db.from('participants').insert({ name }).select('id').single();
  if (error) {
    $('start-error').textContent = 'Не вдалося підключитися. Перевірте інтернет і спробуйте ще раз.';
    $('start-error').hidden = false;
    btn.disabled = false;
    btn.textContent = 'Почати';
    return;
  }
  state = { id: data.id, name, startedAt: Date.now(), answers: [], status: 'in_progress', finishedAt: null };
  saveState();
  resume();
}

function resume() {
  if (state.status !== 'in_progress') {
    renderResult();
    return;
  }
  if (remainingSec() <= 0) {
    finish('timeout');
    return;
  }
  show('screen-quiz');
  renderQuestion();
  startTimer();
}

$('duration-label').textContent = `${Math.round(QUIZ_DURATION_SEC / 60)} хв`;
$('timer-value').textContent = formatTime(QUIZ_DURATION_SEC);

$('start-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('name').value.trim().replace(/\s+/g, ' ');
  if (name.length < 2) {
    $('start-error').textContent = 'Введіть ім\'я (щонайменше 2 символи).';
    $('start-error').hidden = false;
    return;
  }
  start(name);
});

$('next-btn').addEventListener('click', submitAnswer);

// index.html?reset — почати заново на цьому пристрої.
if (new URLSearchParams(location.search).has('reset')) {
  clearState();
  history.replaceState(null, '', location.pathname);
}

state = loadState();
if (state && state.id) {
  resume();
} else {
  state = null;
  show('screen-start');
}
