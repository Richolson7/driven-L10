-- Morning huddle scorecard snapshot. NOT applied to the live project.
-- Run after 20261026160000 (private.is_crm_team exists).
-- Do not apply this from the app. A teammate runs it in the Driven SQL editor.
--
-- One row per weekday huddle. The page may insert only during the first
-- three minutes from 10:00 AM America/Chicago (same window as
-- CAPTURE_MINUTES in js/huddle-scorecard.js). There is no update policy,
-- so a later refresh cannot overwrite the row. The next row is the next
-- weekday huddle.

do $$
begin
  if to_regprocedure('private.is_crm_team()') is null then
    raise exception 'Apply 20261026160000_crm_missing_rules_and_user_prefs.sql first';
  end if;
end $$;

create table if not exists public.huddle_snapshots (
  huddle_day date primary key,
  captured_for timestamptz not null,
  captured_at timestamptz not null default now(),
  payload jsonb not null,
  constraint huddle_snapshots_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint huddle_snapshots_captured_for_check check (
    captured_for = (huddle_day::timestamp + time '10:00') at time zone 'America/Chicago'
  )
);

comment on table public.huddle_snapshots is
  'Frozen 10:00 AM America/Chicago morning-huddle scorecard. Insert once. Do not update.';

alter table public.huddle_snapshots enable row level security;

drop policy if exists huddle_snapshots_read on public.huddle_snapshots;
create policy huddle_snapshots_read on public.huddle_snapshots
  for select to authenticated
  using ((select private.is_crm_team()));

drop policy if exists huddle_snapshots_insert on public.huddle_snapshots;
create policy huddle_snapshots_insert on public.huddle_snapshots
  for insert to authenticated
  with check (
    (select private.is_crm_team())
    and huddle_day = (timezone('America/Chicago', now()))::date
    and extract(isodow from timezone('America/Chicago', now())) between 1 and 5
    and (timezone('America/Chicago', now()))::time >= time '10:00'
    and (timezone('America/Chicago', now()))::time < time '10:03'
  );

revoke all on table public.huddle_snapshots from anon, public;
grant select, insert on table public.huddle_snapshots to authenticated;
