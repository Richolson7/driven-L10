-- Product catalog shared with QuickBooks Items. NOT applied.
-- Run after 20261026170000_crm_deal_lines.sql.
-- The import edge function only reads QuickBooks, and only when its flag is on.
-- It is off by default and is not deployed from this pull request.

create table if not exists public.crm_products (
  id bigint generated always as identity primary key,
  qbo_item_id text,
  sku text,
  name text not null,
  description text,
  category text,
  unit text,
  default_price numeric,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_products_category_check check (
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

create unique index if not exists crm_products_qbo_item_uidx
  on public.crm_products (qbo_item_id)
  where qbo_item_id is not null and qbo_item_id <> '';

create unique index if not exists crm_products_sku_uidx
  on public.crm_products (sku)
  where sku is not null and sku <> '';

create index if not exists crm_products_name_idx on public.crm_products (name);

comment on table public.crm_products is
  'Catalog mirrored from QuickBooks Items. Quote and order lines should pick from here so names and part numbers match.';

alter table public.crm_deal_lines
  drop constraint if exists crm_deal_lines_product_fk;
alter table public.crm_deal_lines
  add constraint crm_deal_lines_product_fk
  foreign key (product_id) references public.crm_products (id) on delete set null;

alter table public.crm_products enable row level security;

revoke all on table public.crm_products from anon, public;
grant select, insert, update, delete on table public.crm_products to authenticated;
grant usage, select on sequence public.crm_products_id_seq to authenticated;

drop policy if exists crm_team_all on public.crm_products;
create policy crm_team_all on public.crm_products
  for all to authenticated
  using ((select private.is_crm_team()))
  with check ((select private.is_crm_team()));
