-- Driven CRM: missing automation rules, sequence metadata, per-user prefs, and quotes.
-- NOT applied to the live project. Rich reviews and runs this before the login policy.
-- The CRM page works without this file: prefs fall back to this browser,
-- the four rules below simply do not appear until this is applied,
-- and quote line items stay in crm_deals.custom until crm_quotes exists.
-- Scalar quote fields (description, price, quantity, vendor, vendor price,
-- freight, quote sent date, ship-to, rep, customer PO) already have columns
-- on crm_deals and are saved there either way.
--
-- Do not run 20261026160100_crm_login_rls.sql until the team can sign in.
-- This file leaves the existing allow-all policies on the current crm_* tables alone.

-- The live check only allows stage_enter, date_reached, stale_stage, no_contact.
-- The test CRM also had new-customer, setup-stale, new-vendor, and vendor-ready rules.
alter table public.crm_automation_rules drop constraint if exists crm_automation_rules_trigger_check;
alter table public.crm_automation_rules add constraint crm_automation_rules_trigger_check
  check (trigger = any (array[
    'stage_enter'::text,
    'date_reached'::text,
    'stale_stage'::text,
    'no_contact'::text,
    'new_customer'::text,
    'setup_stale'::text,
    'new_vendor'::text,
    'vendor_ready'::text
  ]));

insert into public.crm_automation_rules
  (name, trigger, stage, date_field, offset_days, company_list, notify_team, via, message, active)
select 'New customer setup', 'new_customer', null, null, array[0]::integer[], null, 'operations', 'both',
  'New customer: start setup for {company}. Send the setup packet and collect the signed new customer form and their W-9.', true
where not exists (select 1 from public.crm_automation_rules r where r.name = 'New customer setup');

insert into public.crm_automation_rules
  (name, trigger, stage, date_field, offset_days, company_list, notify_team, via, message, active)
select 'Setup still incomplete', 'setup_stale', null, null, array[3,7,14]::integer[], null, 'operations', 'both',
  '{company} setup is still missing: {missing}', true
where not exists (select 1 from public.crm_automation_rules r where r.name = 'Setup still incomplete');

insert into public.crm_automation_rules
  (name, trigger, stage, date_field, offset_days, company_list, notify_team, via, message, active)
select 'New vendor setup', 'new_vendor', null, null, array[0]::integer[], null, 'accounting', 'both',
  'New vendor: {company}. Send the vendor packet and collect the new vendor form, W-9 and signed NDA.', true
where not exists (select 1 from public.crm_automation_rules r where r.name = 'New vendor setup');

insert into public.crm_automation_rules
  (name, trigger, stage, date_field, offset_days, company_list, notify_team, via, message, active)
select 'Vendor ready for QuickBooks', 'vendor_ready', null, null, array[0]::integer[], null, 'accounting', 'both',
  '{company} sent back their vendor form and W-9. Verify their bank info by phone, then set them up in QuickBooks.', true
where not exists (select 1 from public.crm_automation_rules r where r.name = 'Vendor ready for QuickBooks');

-- Lets one cold-outreach row set grow into named sequences without a second table.
-- Existing rows become sequence_name 'Cold outreach', step_type 'email', approval on.
alter table public.crm_sequence_steps
  add column if not exists sequence_name text not null default 'Cold outreach',
  add column if not exists step_type text not null default 'email',
  add column if not exists requires_approval boolean not null default true;

alter table public.crm_sequence_steps drop constraint if exists crm_sequence_steps_step_type_check;
alter table public.crm_sequence_steps add constraint crm_sequence_steps_step_type_check
  check (step_type = any (array['email'::text, 'call'::text, 'text'::text]));

alter table public.crm_sequence_steps drop constraint if exists crm_sequence_steps_step_variant_key;
create unique index if not exists crm_sequence_steps_seq_step_variant_uidx
  on public.crm_sequence_steps (sequence_name, step, coalesce(variant, ''));

-- Quote header. Line items (several products per order) live in crm_deal_lines,
-- added in the following migration. Until these tables exist, the page stores the
-- quote document in crm_deals.custom -> _quote and still copies the first line's
-- price, quantity, vendor, freight, and description onto the deal columns.
create table if not exists public.crm_quotes (
  id bigint generated always as identity primary key,
  deal_id bigint not null references public.crm_deals (id) on delete cascade,
  company_id bigint references public.crm_companies (id) on delete set null,
  ship_to_id bigint references public.crm_ship_tos (id) on delete set null,
  contact_id bigint references public.crm_contacts (id) on delete set null,
  number text,
  quote_date date,
  valid_days integer default 30,
  status text not null default 'draft',
  terms text,
  sent_date date,
  customer_po text,
  rep text,
  freight numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_quotes_deal_key unique (deal_id),
  constraint crm_quotes_status_check check (status = any (array[
    'draft'::text, 'sent'::text, 'accepted'::text, 'declined'::text, 'revised'::text
  ]))
);

create index if not exists crm_quotes_company_idx on public.crm_quotes (company_id);

comment on table public.crm_quotes is
  'One quote header per deal. Products are crm_deal_lines. Vendor cost is never printed on the PDF.';

alter table public.crm_quotes enable row level security;

-- Per-user pipeline filters and collapsed board sections.
-- name 'default' + is_default: the filter that loads next time.
-- name '__board': {zones, stages} collapsed flags. Not a filter preset.
-- any other name: a saved preset. filter jsonb holds the criteria.
create table if not exists public.crm_user_prefs (
  id bigint generated always as identity primary key,
  team_member_id integer not null references public.crm_team (id) on delete cascade,
  view text not null default 'pipeline',
  name text not null default '',
  filter jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  constraint crm_user_prefs_view_check check (view = 'pipeline'),
  constraint crm_user_prefs_name_len check (char_length(name) between 1 and 80),
  constraint crm_user_prefs_member_view_name_key unique (team_member_id, view, name)
);

create unique index if not exists crm_user_prefs_one_default
  on public.crm_user_prefs (team_member_id, view)
  where is_default;

create index if not exists crm_user_prefs_member_idx
  on public.crm_user_prefs (team_member_id, view);

comment on table public.crm_user_prefs is
  'Per teammate pipeline filters, named presets, and collapsed stage or zone state.';

-- Born locked to signed-in crm_team members. Until this migration AND login work,
-- the page stores prefs in localStorage under the selected teammate.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create index if not exists crm_team_email_lower_idx on public.crm_team (lower(email));

create or replace function private.is_crm_team()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.crm_team t
    where t.active is true
      and lower(t.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function private.is_crm_team() from public, anon;
grant execute on function private.is_crm_team() to authenticated;

comment on function private.is_crm_team() is
  'True when the signed-in email matches an active crm_team row. Uses the JWT email, not user_metadata.';

revoke all on table public.crm_quotes from anon, public;
grant select, insert, update, delete on table public.crm_quotes to authenticated;
grant usage, select on sequence public.crm_quotes_id_seq to authenticated;

drop policy if exists crm_team_all on public.crm_quotes;
create policy crm_team_all on public.crm_quotes
  for all to authenticated
  using ((select private.is_crm_team()))
  with check ((select private.is_crm_team()));

alter table public.crm_user_prefs enable row level security;

drop policy if exists crm_team_all on public.crm_user_prefs;
create policy crm_team_all
  on public.crm_user_prefs
  for all
  to authenticated
  using ((select private.is_crm_team()))
  with check ((select private.is_crm_team()));

revoke all on table public.crm_user_prefs from anon, public;
grant select, insert, update, delete on table public.crm_user_prefs to authenticated;
grant usage, select on sequence public.crm_user_prefs_id_seq to authenticated;
