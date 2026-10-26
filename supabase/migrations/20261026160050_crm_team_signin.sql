-- Team rows and the Before User Created allow list.
-- Run after 20261026160000_crm_missing_rules_and_user_prefs.sql (private schema)
-- and before 20261026160100_crm_login_rls.sql.
--
-- Applied live as version 20261026184005 (the filename is not the live version).
-- That applied copy declares a PL/pgSQL variable named email, which clashes with
-- crm_team.email and raises 42702 at the IF. The function below is corrected for
-- a fresh install. The live database is corrected by
-- 20261026184500_fix_crm_team_hook.sql. Do not re-apply this file.
--
-- Checked read-only on 2026-10-26: all five rows already exist and are active.
-- This insert does nothing while those emails are present. It does not change
-- name, team, or alert_via on an existing row. It only adds a missing email
-- and turns active back on if one of these addresses was switched off.
-- Do not insert these rows from the CRM page or from a one-off script.

insert into public.crm_team (name, email, team, alert_via, active)
select v.name, v.email, v.team, v.alert_via, true
from (
  values
    ('Rich'::text, 'rich@drivensol.com'::text, 'sales'::text, 'both'::text),
    ('Landon', 'landon@drivensol.com', 'sales', 'task'),
    ('Annie', 'orders@drivensol.com', 'operations', 'email'),
    ('Patrick', 'logistics@drivensol.com', 'operations', 'both'),
    ('Amber', 'amber@drivensol.com', 'accounting', 'email')
) as v(name, email, team, alert_via)
where not exists (
  select 1 from public.crm_team t where lower(t.email) = lower(v.email)
);

update public.crm_team
set active = true
where lower(email) in (
  'rich@drivensol.com',
  'landon@drivensol.com',
  'orders@drivensol.com',
  'logistics@drivensol.com',
  'amber@drivensol.com'
)
  and active is distinct from true;

-- One row per sign-in address. Fails if a duplicate email was added by hand.
create unique index if not exists crm_team_email_lower_uidx
  on public.crm_team (lower(email));

-- Supabase Auth calls this from the Before User Created hook.
-- Creating the function does not turn the hook on. In Authentication → Hooks,
-- choose Before user created, schema private, function hook_crm_team_only.
-- Return {} to allow. Return an error object to reject the signup.
-- The hook runs only when a new auth user is created, so the CRM page also
-- signs out any session whose email is not an active crm_team row.
-- security definer so the check still reads crm_team after anon access is revoked.
create or replace function private.hook_crm_team_only(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  v_email := lower(coalesce(event -> 'user' ->> 'email', ''));
  if v_email <> '' and exists (
    select 1
    from public.crm_team t
    where t.active is true
      and lower(t.email) = v_email
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'This address is not an active Driven team email.'
    )
  );
end;
$$;

revoke all on function private.hook_crm_team_only(jsonb) from public, anon, authenticated;
grant execute on function private.hook_crm_team_only(jsonb) to supabase_auth_admin;
grant usage on schema private to supabase_auth_admin;

comment on function private.hook_crm_team_only(jsonb) is
  'Before User Created hook. Allows a new auth user only when the email is an active crm_team row.';
