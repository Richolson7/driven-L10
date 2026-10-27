-- Morning huddle goals. NOT applied to the live project.
-- Run after 20261026160000 (private.is_crm_team exists).

do $$
begin
  if to_regprocedure('private.is_crm_team()') is null then
    raise exception 'Apply 20261026160000_crm_missing_rules_and_user_prefs.sql first';
  end if;
end $$;
-- Daily rep goals and the team sales/win goals live here so the weekly
-- kpi_defs rows (Revenue $115,000, Wins 3, New Opportunities 5, Close Rate 30%)
-- stay on the scorecard. Change a target in this table to change the board.
-- No anon access. The morning huddle page reads this only after CRM sign-in.

create table if not exists public.huddle_goals (
  id bigint generated always as identity primary key,
  company text not null default 'driven',
  scope text not null,
  rep text,
  metric text not null,
  period text not null,
  target numeric not null,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint huddle_goals_scope_check check (scope = any (array['rep'::text, 'team'::text])),
  constraint huddle_goals_metric_check check (metric = any (array[
    'touches'::text,
    'calls'::text,
    'emails'::text,
    'quotes_sent'::text,
    'sales_landed'::text,
    'wins'::text
  ])),
  constraint huddle_goals_period_check check (period = any (array['day'::text, 'week'::text])),
  constraint huddle_goals_target_check check (target >= 0),
  constraint huddle_goals_rep_check check (
    (scope = 'team' and rep is null)
    or (scope = 'rep' and rep is not null and char_length(btrim(rep)) > 0)
  )
);

create unique index if not exists huddle_goals_identity_uidx
  on public.huddle_goals (company, scope, coalesce(rep, ''), metric, period);

create index if not exists huddle_goals_company_idx
  on public.huddle_goals (company)
  where active;

comment on table public.huddle_goals is
  'Editable morning-huddle goals. Rep rows are per weekday. Team sales_landed is per weekday. Team wins is per week.';

insert into public.huddle_goals (company, scope, rep, metric, period, target)
select v.company, v.scope, v.rep, v.metric, v.period, v.target
from (
  values
    ('driven'::text, 'rep'::text, 'Rich'::text, 'touches'::text, 'day'::text, 25::numeric),
    ('driven', 'rep', 'Rich', 'calls', 'day', 15),
    ('driven', 'rep', 'Rich', 'emails', 'day', 10),
    ('driven', 'rep', 'Rich', 'quotes_sent', 'day', 1),
    ('driven', 'rep', 'Landon', 'touches', 'day', 25),
    ('driven', 'rep', 'Landon', 'calls', 'day', 15),
    ('driven', 'rep', 'Landon', 'emails', 'day', 10),
    ('driven', 'rep', 'Landon', 'quotes_sent', 'day', 1),
    ('driven', 'team', null, 'sales_landed', 'day', 23000),
    ('driven', 'team', null, 'wins', 'week', 3)
) as v(company, scope, rep, metric, period, target)
where not exists (
  select 1
  from public.huddle_goals g
  where g.company = v.company
    and g.scope = v.scope
    and coalesce(g.rep, '') = coalesce(v.rep, '')
    and g.metric = v.metric
    and g.period = v.period
);

alter table public.huddle_goals enable row level security;

drop policy if exists crm_team_all on public.huddle_goals;
create policy crm_team_all on public.huddle_goals
  for all to authenticated
  using ((select private.is_crm_team()))
  with check ((select private.is_crm_team()));

revoke all on table public.huddle_goals from anon, public;
grant select, insert, update, delete on table public.huddle_goals to authenticated;
grant usage, select on sequence public.huddle_goals_id_seq to authenticated;
