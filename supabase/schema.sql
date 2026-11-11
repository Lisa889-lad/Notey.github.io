-- Run this once in Supabase SQL Editor.
-- Each authenticated user can read/write only their own full application state.
create table if not exists public.ledgerpro_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.ledgerpro_state enable row level security;

revoke all on table public.ledgerpro_state from anon;
grant select, insert, update, delete on table public.ledgerpro_state to authenticated;

drop policy if exists "Users can read their own LedgerPro state" on public.ledgerpro_state;
create policy "Users can read their own LedgerPro state"
  on public.ledgerpro_state for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own LedgerPro state" on public.ledgerpro_state;
create policy "Users can create their own LedgerPro state"
  on public.ledgerpro_state for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own LedgerPro state" on public.ledgerpro_state;
create policy "Users can update their own LedgerPro state"
  on public.ledgerpro_state for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own LedgerPro state" on public.ledgerpro_state;
create policy "Users can delete their own LedgerPro state"
  on public.ledgerpro_state for delete to authenticated
  using (auth.uid() = user_id);
