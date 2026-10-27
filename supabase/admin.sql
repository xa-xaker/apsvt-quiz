-- Адмінпанель: питання в базі + права викладача. Виконати в Supabase → SQL Editor після schema.sql.

-- Хто є викладачем: email облікового запису в Supabase Auth (має збігатися з ADMIN_EMAIL у js/config.js).
create or replace function public.is_quiz_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'teacher@example.com'
$$;

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  position int not null default 0,
  text text not null check (char_length(text) between 1 and 500),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  correct int not null,
  updated_at timestamptz not null default now(),
  check (correct >= 0 and correct < jsonb_array_length(options))
);

alter table public.questions enable row level security;

drop policy if exists "questions_select" on public.questions;
create policy "questions_select" on public.questions for select to anon, authenticated using (true);

drop policy if exists "questions_admin_insert" on public.questions;
create policy "questions_admin_insert" on public.questions for insert to authenticated with check (public.is_quiz_admin());

drop policy if exists "questions_admin_update" on public.questions;
create policy "questions_admin_update" on public.questions for update to authenticated using (public.is_quiz_admin()) with check (public.is_quiz_admin());

drop policy if exists "questions_admin_delete" on public.questions;
create policy "questions_admin_delete" on public.questions for delete to authenticated using (public.is_quiz_admin());

-- Учасники: після входу викладач стає роллю authenticated, тому доступ відкриваємо обом ролям.
drop policy if exists "participants_select" on public.participants;
create policy "participants_select" on public.participants for select to anon, authenticated using (true);

drop policy if exists "participants_insert" on public.participants;
create policy "participants_insert" on public.participants for insert to anon, authenticated with check (true);

drop policy if exists "participants_update" on public.participants;
create policy "participants_update" on public.participants for update to anon, authenticated using (true) with check (true);

-- Очищення результатів — лише викладач.
drop policy if exists "participants_admin_delete" on public.participants;
create policy "participants_admin_delete" on public.participants for delete to authenticated using (public.is_quiz_admin());

-- Сторінка результатів отримує зміни питань без перезавантаження.
alter table public.questions replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.questions;
exception when duplicate_object then null;
end $$;

-- Початковий набір питань (лише якщо таблиця порожня).
insert into public.questions (position, text, options, correct)
select * from (values
  (0, 'Яке використання ШІ під час виконання домашнього завдання є найбільш доброчесним?', '["Згенерувати всю роботу й здати її як власну", "Попросити ШІ пояснити складну тему, а завдання виконати самостійно", "Перефразувати відповідь ШІ, щоб її не розпізнали", "Скопіювати відповідь ШІ без перевірки"]'::jsonb, 1),
  (1, 'Що таке «галюцинації» ШІ?', '["Збій, через який чат-бот перестає відповідати", "Здатність ШІ генерувати зображення", "Впевнено подана, але вигадана або неправдива інформація", "Режим творчого письма в чат-боті"]'::jsonb, 2),
  (2, 'Як найкраще перевірити факт, який надав ШІ?', '["Поставити те саме питання ще раз тому ж чат-боту", "Повірити, якщо відповідь звучить переконливо", "Запитати однокурсника", "Звірити з надійними першоджерелами: підручником, науковою статтею, офіційним сайтом"]'::jsonb, 3),
  (3, 'Яку інформацію не варто вводити в загальнодоступні ШІ-сервіси?', '["Персональні дані, паролі та конфіденційні документи", "Загальне питання про історичну подію", "Прохання пояснити формулу", "Текст для перевірки граматики без особистих даних"]'::jsonb, 0),
  (4, 'Що таке «промпт» у роботі з генеративним ШІ?', '["Платна підписка на чат-бот", "Запит або інструкція, яку користувач дає моделі", "Помилка в роботі нейромережі", "Програма для виявлення плагіату"]'::jsonb, 1)
) as v(position, text, options, correct)
where not exists (select 1 from public.questions);
