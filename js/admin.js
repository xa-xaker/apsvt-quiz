const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
const MIN_OPTIONS = 2;
const MAX_OPTIONS = OPTION_LETTERS.length;

// Редагований набір: [{ id?, text, options: string[], correct }]
let items = [];
let savedIds = [];
let dirty = false;

function show(screen) {
  ['screen-login', 'screen-editor'].forEach((s) => { $(s).hidden = s !== screen; });
  $('topbar-links').hidden = screen !== 'screen-editor';
  $('savebar').hidden = screen !== 'screen-editor';
}

function setDirty(value) {
  dirty = value;
  $('save-status').textContent = dirty ? 'Є незбережені зміни' : 'Усе збережено';
  $('savebar').classList.toggle('savebar--dirty', dirty);
  $('save-btn').disabled = !dirty;
}

function iconButton(label, title, onClick, extraClass = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `icon-btn ${extraClass}`;
  btn.textContent = label;
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.addEventListener('click', onClick);
  return btn;
}

function change(fn, rerender = true) {
  fn();
  setDirty(true);
  if (rerender) render();
}

function renderQuestion(q, qi) {
  const card = document.createElement('article');
  card.className = 'card qedit';

  const head = document.createElement('div');
  head.className = 'qedit__head';
  head.innerHTML = `<span class="qstat__num">${qi + 1}</span>`;
  const tools = document.createElement('div');
  tools.className = 'qedit__tools';
  const up = iconButton('↑', 'Перемістити вище', () => change(() => items.splice(qi - 1, 0, items.splice(qi, 1)[0])));
  const down = iconButton('↓', 'Перемістити нижче', () => change(() => items.splice(qi + 1, 0, items.splice(qi, 1)[0])));
  up.disabled = qi === 0;
  down.disabled = qi === items.length - 1;
  const del = iconButton('✕', 'Видалити питання', () => change(() => items.splice(qi, 1)), 'icon-btn--danger');
  del.disabled = items.length === 1;
  tools.append(up, down, del);
  head.appendChild(tools);
  card.appendChild(head);

  const text = document.createElement('textarea');
  text.className = 'input qedit__text';
  text.rows = 2;
  text.placeholder = 'Текст питання';
  text.value = q.text;
  text.addEventListener('input', () => change(() => { q.text = text.value; }, false));
  card.appendChild(text);

  const list = document.createElement('div');
  list.className = 'qedit__options';
  q.options.forEach((opt, oi) => {
    const row = document.createElement('div');
    row.className = `qedit__option${q.correct === oi ? ' qedit__option--correct' : ''}`;

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = `correct-${qi}`;
    radio.checked = q.correct === oi;
    radio.title = 'Правильна відповідь';
    radio.setAttribute('aria-label', `Варіант ${OPTION_LETTERS[oi]} — правильна відповідь`);
    radio.addEventListener('change', () => change(() => { q.correct = oi; }));

    const letter = document.createElement('span');
    letter.className = 'option__letter';
    letter.textContent = OPTION_LETTERS[oi];

    const input = document.createElement('input');
    input.className = 'input qedit__input';
    input.placeholder = `Варіант ${OPTION_LETTERS[oi]}`;
    input.value = opt;
    input.addEventListener('input', () => change(() => { q.options[oi] = input.value; }, false));

    const remove = iconButton('✕', 'Видалити варіант', () => change(() => {
      q.options.splice(oi, 1);
      if (q.correct === oi) q.correct = 0;
      else if (q.correct > oi) q.correct -= 1;
    }));
    remove.disabled = q.options.length <= MIN_OPTIONS;

    row.append(radio, letter, input, remove);
    list.appendChild(row);
  });
  card.appendChild(list);

  if (q.options.length < MAX_OPTIONS) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'link-btn qedit__add';
    add.textContent = '+ Додати варіант';
    add.addEventListener('click', () => change(() => q.options.push('')));
    card.appendChild(add);
  }
  return card;
}

function render() {
  const box = $('questions');
  box.innerHTML = '';
  items.forEach((q, qi) => box.appendChild(renderQuestion(q, qi)));
}

async function loadItems() {
  const { data, error } = await db.from('questions').select('id, text, options, correct').order('position');
  if (error) {
    $('save-status').textContent = 'Не вдалося завантажити питання';
    return;
  }
  items = data.map((q) => ({ ...q, options: [...q.options] }));
  savedIds = data.map((q) => q.id);
  render();
  setDirty(false);
}

function validate() {
  for (let i = 0; i < items.length; i += 1) {
    const q = items[i];
    if (!q.text.trim()) return `Питання ${i + 1}: введіть текст питання.`;
    if (q.options.some((o) => !o.trim())) return `Питання ${i + 1}: заповніть усі варіанти або видаліть зайві.`;
  }
  return null;
}

async function save() {
  const problem = validate();
  if (problem) {
    $('save-status').textContent = problem;
    return;
  }
  $('save-btn').disabled = true;
  $('save-status').textContent = 'Збереження…';

  const rows = items.map((q, i) => ({
    position: i,
    text: q.text.trim(),
    options: q.options.map((o) => o.trim()),
    correct: q.correct,
    updated_at: new Date().toISOString(),
  }));
  const keptIds = items.filter((q) => q.id).map((q) => q.id);
  const removedIds = savedIds.filter((id) => !keptIds.includes(id));
  const existing = rows.map((r, i) => ({ ...r, id: items[i].id })).filter((r) => r.id);
  const created = rows.filter((r, i) => !items[i].id);

  const results = await Promise.all([
    removedIds.length ? db.from('questions').delete().in('id', removedIds) : { error: null },
    existing.length ? db.from('questions').upsert(existing) : { error: null },
    created.length ? db.from('questions').insert(created) : { error: null },
  ]);
  const failed = results.find((r) => r.error);
  if (failed) {
    $('save-status').textContent = 'Помилка збереження. Спробуйте ще раз.';
    $('save-btn').disabled = false;
    return;
  }
  await loadItems();
}

async function clearResults() {
  if (!confirm('Видалити результати всіх студентів? Цю дію неможливо скасувати.')) return;
  const { error } = await db.from('participants').delete().gte('started_at', '1970-01-01');
  $('clear-status').textContent = error ? 'Не вдалося очистити результати.' : 'Результати очищено.';
  $('clear-status').hidden = false;
}

async function openEditor() {
  show('screen-editor');
  await loadItems();
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('login-btn');
  btn.disabled = true;
  $('login-error').hidden = true;
  const { error } = await db.auth.signInWithPassword({ email: ADMIN_EMAIL, password: $('password').value });
  btn.disabled = false;
  if (error) {
    $('login-error').textContent = 'Невірний пароль.';
    $('login-error').hidden = false;
    return;
  }
  $('password').value = '';
  openEditor();
});

$('logout-btn').addEventListener('click', async () => {
  if (dirty && !confirm('Є незбережені зміни. Все одно вийти?')) return;
  await db.auth.signOut();
  show('screen-login');
});

$('add-question').addEventListener('click', () => {
  change(() => items.push({ text: '', options: ['', '', '', ''], correct: 0 }));
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
});

$('save-btn').addEventListener('click', save);
$('clear-results').addEventListener('click', clearResults);

window.addEventListener('beforeunload', (e) => {
  if (dirty) e.preventDefault();
});

db.auth.getSession().then(({ data }) => {
  if (data.session) openEditor();
  else show('screen-login');
});
