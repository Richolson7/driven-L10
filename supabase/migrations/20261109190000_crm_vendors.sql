-- Driven supplier map. NOT applied to the live project.
-- Run after 20261105160000. Uses private.is_crm_team(), same as the other crm_* tables.
-- Scorecard rows are a separate table and are not seeded.

create table if not exists public.crm_vendors (
  id bigint generated always as identity primary key,
  source_row integer,
  category text,
  supplier text not null,
  status text,
  contact text,
  location text,
  miles_from_river_falls numeric,
  products_specs text,
  moq text,
  lead_time text,
  terms text,
  credit_limit text,
  hold_status text,
  last_price text,
  last_order_date date,
  share_2026 numeric,
  map_score numeric,
  source_link text,
  notes text,
  tier text,
  list_status text,
  quote_time text,
  capability_flags text,
  verify_flag text,
  additional_contacts text,
  merge_notes text,
  active boolean not null default false,
  verify_note text,
  verified_at timestamptz,
  verified_by text,
  directory_category text,
  core_products text,
  buy_summary text,
  quote_summary text,
  order_line_count integer,
  volume_amount numeric,
  volume_kind text,
  crm_note text,
  watch_label text,
  watch_tone text,
  company_side text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_vendors_source_row_uidx
  on public.crm_vendors (source_row) where source_row is not null;
create index if not exists crm_vendors_supplier_idx on public.crm_vendors (supplier);
create index if not exists crm_vendors_category_idx on public.crm_vendors (category);
create index if not exists crm_vendors_active_idx on public.crm_vendors (active);

comment on table public.crm_vendors is
  'Supplier map. map_score is the spreadsheet Score (0-5), not the values/speed/communication scorecard.';

create table if not exists public.crm_vendor_scores (
  id bigint generated always as identity primary key,
  vendor_id bigint not null references public.crm_vendors (id) on delete cascade,
  values_fit smallint,
  delivery_speed smallint,
  communication smallint,
  rated_by text,
  rated_at timestamptz not null default now(),
  notes text,
  constraint crm_vendor_scores_values_fit_check check (values_fit is null or values_fit between 1 and 5),
  constraint crm_vendor_scores_delivery_speed_check check (delivery_speed is null or delivery_speed between 1 and 5),
  constraint crm_vendor_scores_communication_check check (communication is null or communication between 1 and 5)
);

create index if not exists crm_vendor_scores_vendor_idx
  on public.crm_vendor_scores (vendor_id, rated_at desc);

comment on table public.crm_vendor_scores is
  'Latest row per vendor is the scorecard. Utilize only when all three scores are 4 or 5. Not seeded.';

create table if not exists public.crm_vendor_products (
  id bigint generated always as identity primary key,
  vendor_id bigint not null references public.crm_vendors (id) on delete cascade,
  category text,
  product text,
  specs text,
  moq text,
  lead_time text,
  last_price text,
  created_at timestamptz not null default now()
);

create index if not exists crm_vendor_products_vendor_idx on public.crm_vendor_products (vendor_id);

create table if not exists public.crm_vendor_customers (
  id bigint generated always as identity primary key,
  vendor_id bigint not null references public.crm_vendors (id) on delete cascade,
  company_id bigint references public.crm_companies (id) on delete set null,
  customer_name text not null,
  feeds text,
  created_at timestamptz not null default now()
);

create index if not exists crm_vendor_customers_vendor_idx on public.crm_vendor_customers (vendor_id);
create index if not exists crm_vendor_customers_company_idx on public.crm_vendor_customers (company_id);

create table if not exists public.crm_vendor_category_risk (
  id bigint generated always as identity primary key,
  category text not null,
  sources_2026 numeric,
  risk text,
  reason text,
  backups text,
  map_sources numeric,
  active_vendors numeric,
  active_list_only numeric,
  dormant_qb numeric,
  candidate_listed numeric,
  reference_rows numeric,
  verify_flagged numeric
);

create table if not exists public.crm_vendor_changes (
  id bigint generated always as identity primary key,
  changed_on date,
  supplier text,
  vendor_id bigint references public.crm_vendors (id) on delete set null,
  what_changed text,
  source text,
  created_at timestamptz not null default now()
);

create index if not exists crm_vendor_changes_vendor_idx on public.crm_vendor_changes (vendor_id);

create table if not exists public.crm_vendor_quotes (
  id bigint generated always as identity primary key,
  customer_name text,
  item text,
  vendor_name text,
  vendor_id bigint references public.crm_vendors (id) on delete set null,
  note text,
  note_tone text,
  created_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  if to_regprocedure('private.is_crm_team()') is null then
    raise exception 'Apply 20261026160000_crm_missing_rules_and_user_prefs.sql first';
  end if;
  foreach t in array array[
    'crm_vendors', 'crm_vendor_scores', 'crm_vendor_products', 'crm_vendor_customers',
    'crm_vendor_category_risk', 'crm_vendor_changes', 'crm_vendor_quotes'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('drop policy if exists crm_team_all on public.%I', t);
    execute format(
      'create policy crm_team_all on public.%I for all to authenticated using ((select private.is_crm_team())) with check ((select private.is_crm_team()))',
      t
    );
  end loop;
end $$;

do $$
declare
  s text;
begin
  foreach s in array array[
    'crm_vendors_id_seq', 'crm_vendor_scores_id_seq', 'crm_vendor_products_id_seq',
    'crm_vendor_customers_id_seq', 'crm_vendor_category_risk_id_seq',
    'crm_vendor_changes_id_seq', 'crm_vendor_quotes_id_seq'
  ]
  loop
    if to_regclass('public.' || s) is not null then
      execute format('revoke all on sequence public.%I from anon, public', s);
      execute format('grant usage, select on sequence public.%I to authenticated', s);
    end if;
  end loop;
end $$;
