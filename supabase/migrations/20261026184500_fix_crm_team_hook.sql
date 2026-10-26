-- Replace private.hook_crm_team_only. NOT applied.
-- The copy applied live as version 20261026184005 (file
-- 20261026160050_crm_team_signin.sql) fails at runtime:
--   ERROR 42702: column reference "email" is ambiguous
-- The PL/pgSQL variable email clashes with crm_team.email inside the IF.
-- This renames that variable to v_email. Do not re-apply 20261026160050.
-- private.is_crm_team() is language sql and has no variable named email, so it
-- does not have this clash. It was applied inside version 20261026183950.

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
