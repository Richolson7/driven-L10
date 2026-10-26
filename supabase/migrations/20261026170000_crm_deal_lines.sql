-- Order and quote line items. NOT applied to the live project.
-- Run after 20261026160000_crm_missing_rules_and_user_prefs.sql (needs private.is_crm_team()).
-- One row per product line, same grain as the KPI Order Log. Several lines share a deal
-- (one invoice). Revenue, vendor cost, overall cost, gross profit, and margin are not
-- columns: the Open Orders view calculates them.
-- product_id is filled in by the products migration, which adds the foreign key.
-- Until this table exists, the page keeps lines inside crm_deals.custom -> _quote.

create table if not exists public.crm_deal_lines (
  id bigint generated always as identity primary key,
  deal_id bigint not null references public.crm_deals (id) on delete cascade,
  product_id bigint,
  position integer not null default 0,
  line_date date,
  description text,
  invoice_number text,
  sales_rep text,
  category text,
  vendor_id bigint references public.crm_companies (id) on delete set null,
  quantity numeric,
  unit text,
  vendor_price numeric,
  freight numeric,
  sell_price numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_deal_lines_category_check check (
    category is null or category = any (array[
      'Stretch Wrap / Film'::text,
      'Pallets'::text,
      'Poly Bags / Tubing'::text,
      'Shrink Products'::text,
      'Gaylords / Totes'::text,
      'Tape'::text,
      'Corner Boards'::text,
      'Lidding / Laminate Film'::text,
      'Flexibles'::text,
      'Ridgid'::text,
      'MRO'::text,
      'Freight'::text,
      'Other'::text
    ])
  )
);

create index if not exists crm_deal_lines_deal_idx on public.crm_deal_lines (deal_id, position);
create index if not exists crm_deal_lines_vendor_idx on public.crm_deal_lines (vendor_id);
create index if not exists crm_deal_lines_product_idx on public.crm_deal_lines (product_id);
create index if not exists crm_deal_lines_invoice_idx on public.crm_deal_lines (invoice_number);

comment on table public.crm_deal_lines is
  'Quote lines and order lines. Vendor is a crm_companies row (kind vendor), not free text. Calculated money columns are not stored.';

alter table public.crm_deal_lines enable row level security;

revoke all on table public.crm_deal_lines from anon, public;
grant select, insert, update, delete on table public.crm_deal_lines to authenticated;
grant usage, select on sequence public.crm_deal_lines_id_seq to authenticated;

drop policy if exists crm_team_all on public.crm_deal_lines;
create policy crm_team_all on public.crm_deal_lines
  for all to authenticated
  using ((select private.is_crm_team()))
  with check ((select private.is_crm_team()));
