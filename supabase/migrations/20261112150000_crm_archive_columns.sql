-- Soft archive for duplicate companies and bad quotes. NOT applied.
-- Additive: two nullable columns and a guard trigger on each table.
-- Reversible: drop the triggers and the four columns. Existing rows stay.
-- Archive does not delete deals, contacts, quotes, or orders, and does not
-- change their foreign keys. Only commission role "full" (owner/admin:
-- Rich and Amber, and anyone else already on that role) may set or clear
-- archived_at. Setters and other teammates cannot.
-- Run after 20261109190200 so private.commission_sees_cost() exists.

do $$
begin
  if to_regprocedure('private.commission_sees_cost()') is null then
    raise exception 'Apply 20261109190200_crm_commissions_payments_qb.sql first';
  end if;
end $$;

alter table public.crm_companies
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text;

alter table public.crm_quotes
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text;

comment on column public.crm_companies.archived_at is
  'Set when an owner archives a duplicate. Null means the company is on the lists.';
comment on column public.crm_quotes.archived_at is
  'Set when an owner archives a duplicate or incorrect quote. The deal is kept.';

create index if not exists crm_companies_active_idx
  on public.crm_companies (name)
  where archived_at is null;

create index if not exists crm_quotes_active_idx
  on public.crm_quotes (deal_id)
  where archived_at is null;

create or replace function private.guard_archive_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.archived_at is not distinct from old.archived_at
     and new.archived_by is not distinct from old.archived_by then
    return new;
  end if;
  if tg_op = 'INSERT' and new.archived_at is null then
    return new;
  end if;
  if private.commission_sees_cost() then
    return new;
  end if;
  raise exception 'Only an owner or admin can archive or restore records.';
end;
$$;

revoke all on function private.guard_archive_change() from public, anon;
grant execute on function private.guard_archive_change() to authenticated;

drop trigger if exists crm_companies_archive_guard on public.crm_companies;
create trigger crm_companies_archive_guard
  before insert or update on public.crm_companies
  for each row execute function private.guard_archive_change();

drop trigger if exists crm_quotes_archive_guard on public.crm_quotes;
create trigger crm_quotes_archive_guard
  before insert or update on public.crm_quotes
  for each row execute function private.guard_archive_change();
