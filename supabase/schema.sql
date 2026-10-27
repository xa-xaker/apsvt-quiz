-- Таблиця учасників опитування. Виконати в Supabase → SQL Editor.
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  status text not null default 'in_progress' check (status in ('in_progress', 'finished', 'timeout')),
  current_question int not null default 0,
  answers jsonb not null default '[]'::jsonb,
  score int not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.participants enable row level security;

-- Доступ без авторизації: студент створює й оновлює свій запис, сторінка викладача читає всі.
drop policy if exists "participants_select" on public.participants;
create policy "participants_select" on public.participants for select to anon using (true);

drop policy if exists "participants_insert" on public.participants;
create policy "participants_insert" on public.participants for insert to anon with check (true);

drop policy if exists "participants_update" on public.participants;
create policy "participants_update" on public.participants for update to anon using (true) with check (true);

-- Realtime: сторінка викладача отримує зміни без перезавантаження.
alter table public.participants replica identity full;
alter publication supabase_realtime add table public.participants;

-- Очистити результати перед новою групою (виконувати вручну):
-- truncate table public.participants;
