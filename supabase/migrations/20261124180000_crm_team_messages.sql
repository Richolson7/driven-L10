-- Team direct messages. NOT applied.
-- Do not run this from the app. Apply it in the Supabase SQL editor.
--
-- public.crm_messages already exists. It stores email and SMS provider
-- status (channel, direction, provider, status). This migration does not
-- alter that table. Team notes live in public.crm_team_messages.
--
-- Signed-in people are matched the same way as private.is_crm_team():
-- the JWT email, not auth.uid() and not user_metadata. crm_team has no
-- auth user id column. from_user stores that email.
--
-- Run after 20261026160000 (private.is_crm_team exists).

do $$
begin
  if to_regprocedure('private.is_crm_team()') is null then
    raise exception 'Apply 20261026160000_crm_missing_rules_and_user_prefs.sql first';
  end if;
end $$;

create or replace function private.current_crm_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function private.current_crm_team_id()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select t.id
  from public.crm_team t
  where t.active is true
    and private.current_crm_email() <> ''
    and lower(t.email) = private.current_crm_email()
  order by t.id
  limit 1;
$$;

revoke all on function private.current_crm_email() from public, anon;
revoke all on function private.current_crm_team_id() from public, anon;
grant execute on function private.current_crm_email() to authenticated;
grant execute on function private.current_crm_team_id() to authenticated;

comment on function private.current_crm_email() is
  'Lowercased JWT email. Same claim private.is_crm_team() uses. Not user_metadata.';

comment on function private.current_crm_team_id() is
  'crm_team.id for the signed-in active teammate, matched on email.';

create table if not exists public.crm_team_messages (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  from_user text not null,
  to_team_id integer references public.crm_team (id) on delete restrict,
  body text not null,
  read_at timestamptz,
  deal_id bigint references public.crm_deals (id) on delete set null,
  company_id bigint references public.crm_companies (id) on delete set null,
  constraint crm_team_messages_from_user_check check (char_length(btrim(from_user)) > 0),
  constraint crm_team_messages_body_check check (char_length(btrim(body)) > 0)
);

create index if not exists crm_team_messages_inbox_idx
  on public.crm_team_messages (to_team_id, created_at desc)
  where read_at is null;

create index if not exists crm_team_messages_everyone_idx
  on public.crm_team_messages (created_at desc)
  where to_team_id is null;

create index if not exists crm_team_messages_from_idx
  on public.crm_team_messages (lower(from_user), created_at desc);

create index if not exists crm_team_messages_deal_idx
  on public.crm_team_messages (deal_id)
  where deal_id is not null;

create index if not exists crm_team_messages_company_idx
  on public.crm_team_messages (company_id)
  where company_id is not null;

comment on table public.crm_team_messages is
  'Notes between teammates. Not email or SMS. crm_messages remains provider status.';

comment on column public.crm_team_messages.from_user is
  'Sender email. Must match the JWT email, the same way crm_team identifies a signed-in user.';

comment on column public.crm_team_messages.to_team_id is
  'Recipient crm_team.id. Null means everyone.';

comment on column public.crm_team_messages.read_at is
  'Set when a recipient marks the note read. One time per row. A note to everyone is marked read for the row by the first recipient who opens it.';

comment on column public.crm_team_messages.deal_id is
  'Optional link to a deal. The home-screen compose box leaves this empty.';

comment on column public.crm_team_messages.company_id is
  'Optional link to a company. The home-screen compose box leaves this empty.';

create or replace function private.crm_team_messages_read_at_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.from_user is distinct from old.from_user
     or new.to_team_id is distinct from old.to_team_id
     or new.body is distinct from old.body
     or new.deal_id is distinct from old.deal_id
     or new.company_id is distinct from old.company_id
  then
    raise exception 'Only read_at can be updated on a team message';
  end if;
  return new;
end;
$$;

revoke all on function private.crm_team_messages_read_at_only() from public, anon;
grant execute on function private.crm_team_messages_read_at_only() to authenticated;

drop trigger if exists crm_team_messages_read_at_only on public.crm_team_messages;
create trigger crm_team_messages_read_at_only
  before update on public.crm_team_messages
  for each row execute function private.crm_team_messages_read_at_only();

alter table public.crm_team_messages enable row level security;

revoke all on table public.crm_team_messages from anon, public;
grant select, insert on table public.crm_team_messages to authenticated;
grant update (read_at) on table public.crm_team_messages to authenticated;
grant usage, select on sequence public.crm_team_messages_id_seq to authenticated;

drop policy if exists crm_team_messages_select on public.crm_team_messages;
create policy crm_team_messages_select on public.crm_team_messages
  for select to authenticated
  using (
    (select private.is_crm_team())
    and (
      to_team_id is null
      or to_team_id = (select private.current_crm_team_id())
      or lower(from_user) = (select private.current_crm_email())
    )
  );

drop policy if exists crm_team_messages_insert on public.crm_team_messages;
create policy crm_team_messages_insert on public.crm_team_messages
  for insert to authenticated
  with check (
    (select private.is_crm_team())
    and (select private.current_crm_email()) <> ''
    and lower(from_user) = (select private.current_crm_email())
  );

drop policy if exists crm_team_messages_update_read on public.crm_team_messages;
create policy crm_team_messages_update_read on public.crm_team_messages
  for update to authenticated
  using (
    (select private.is_crm_team())
    and (
      to_team_id = (select private.current_crm_team_id())
      or (
        to_team_id is null
        and lower(from_user) is distinct from (select private.current_crm_email())
      )
    )
  )
  with check (
    (select private.is_crm_team())
    and (
      to_team_id = (select private.current_crm_team_id())
      or (
        to_team_id is null
        and lower(from_user) is distinct from (select private.current_crm_email())
      )
    )
  );
