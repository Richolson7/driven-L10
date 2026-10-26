-- Proposed login gate for Driven CRM. NOT applied.
-- Run only after 20261026160000_crm_missing_rules_and_user_prefs.sql,
-- and only when the team can sign in with the emails on crm_team.
--
-- Today most crm_* tables have a policy named "allow all" for role public
-- (qual true) plus full grants to anon, including TRUNCATE. Anyone with the
-- anon key in the page source can read and edit customers, deals, tasks, and team.
-- crm_sequence_steps, crm_suppression, and target_accounts are already limited
-- to authenticated users whose email ends with @drivensol.com (is_driven_user()).
--
-- This replaces the public policies on crm_* with private.is_crm_team():
-- the JWT email must match an active crm_team.email. It does not use user_metadata.
-- It does not change target_accounts, driven_outreach, or the L10 hub tables
-- (driven_tasks, driven_rocks, driven_sprints, dashboard_data).
--
-- Supabase Auth email sign-in has to be enabled. Magic links go to the
-- address the person types on the CRM sign-in form. After this migration,
-- the anon key can no longer read or write crm_* data.

do $$
declare
  t text;
  tables text[] := array[
    'crm_activity',
    'crm_automation_rules',
    'crm_companies',
    'crm_contacts',
    'crm_custom_fields',
    'crm_deals',
    'crm_ship_tos',
    'crm_stages',
    'crm_tasks',
    'crm_team',
    'crm_sequence_steps',
    'crm_suppression',
    'crm_user_prefs',
    'crm_quotes',
    'crm_deal_lines',
    'crm_products',
    'crm_messages'
  ];
begin
  -- private.is_crm_team() is created by the previous migration.
  if to_regprocedure('private.is_crm_team()') is null then
    raise exception 'Apply 20261026160000_crm_missing_rules_and_user_prefs.sql first';
  end if;

  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop policy if exists "allow all" on public.%I', t);
    execute format('drop policy if exists driven_team_all on public.%I', t);
    execute format('drop policy if exists crm_team_all on public.%I', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy crm_team_all on public.%I for all to authenticated using ((select private.is_crm_team())) with check ((select private.is_crm_team()))',
      t
    );
    execute format('revoke all on table public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end $$;

-- Serial ids. Identity tables (crm_sequence_steps, crm_user_prefs) included where the sequence exists.
do $$
declare
  s text;
  seqs text[] := array[
    'crm_activity_id_seq',
    'crm_automation_rules_id_seq',
    'crm_companies_id_seq',
    'crm_contacts_id_seq',
    'crm_custom_fields_id_seq',
    'crm_deals_id_seq',
    'crm_ship_tos_id_seq',
    'crm_stages_id_seq',
    'crm_tasks_id_seq',
    'crm_team_id_seq',
    'crm_sequence_steps_id_seq',
    'crm_user_prefs_id_seq',
    'crm_quotes_id_seq',
    'crm_deal_lines_id_seq',
    'crm_products_id_seq',
    'crm_messages_id_seq'
  ];
begin
  foreach s in array seqs loop
    if to_regclass('public.' || s) is not null then
      execute format('revoke all on sequence public.%I from anon, public', s);
      execute format('grant usage, select on sequence public.%I to authenticated', s);
    end if;
  end loop;
end $$;
