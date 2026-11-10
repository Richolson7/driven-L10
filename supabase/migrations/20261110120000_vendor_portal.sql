-- Vendor portal schema the page reads and writes.
-- Safe to re-run. Does not drop tables, rename columns, or delete rows.
-- Run after 20261109190000_crm_vendors.sql and 20261109190200_crm_commissions_payments_qb.sql.
-- Owner/admin cost access is private.commission_sees_cost() (role full).
-- Setters are role own. They must not read vendor cost, price, terms, or margin.

do $$
begin
  if to_regclass('public.crm_vendors') is null then
    raise exception 'Apply 20261109190000_crm_vendors.sql first';
  end if;
  if to_regclass('public.crm_vendor_pos') is null or to_regprocedure('private.commission_sees_cost()') is null then
    raise exception 'Apply 20261109190200_crm_commissions_payments_qb.sql first';
  end if;
end $$;

create or replace function private.can_see_cost()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.commission_sees_cost();
$$;

comment on function private.can_see_cost() is
  'True only for commission role full (owner/admin). Setters are role own and do not see vendor cost.';

revoke all on function private.can_see_cost() from public, anon;
grant execute on function private.can_see_cost() to authenticated;

alter table public.crm_vendors
  add column if not exists company_id bigint references public.crm_companies (id) on delete set null;

alter table public.crm_vendors
  add column if not exists stage text not null default 'prospect';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_vendors_stage_check') then
    alter table public.crm_vendors
      add constraint crm_vendors_stage_check
      check (stage = any (array['prospect'::text, 'vetting'::text, 'approved'::text, 'active'::text, 'dormant'::text, 'do_not_use'::text]));
  end if;
end $$;

create index if not exists crm_vendors_company_idx on public.crm_vendors (company_id);
create index if not exists crm_vendors_stage_idx on public.crm_vendors (stage);

-- Rows created before stage existed: an active flag means Buying from.
update public.crm_vendors
set stage = 'active'
where active is true and stage = 'prospect';

alter table public.crm_activity add column if not exists source text;

alter table public.crm_deals
  add column if not exists vendor_id bigint references public.crm_companies (id) on delete set null;

alter table public.crm_vendor_pos
  add column if not exists promised_on date,
  add column if not exists received_on date;

comment on column public.crm_vendor_pos.promised_on is
  'Date the vendor promised. Compared with received_on for the scorecard. Null until someone records it.';
comment on column public.crm_vendor_pos.received_on is
  'Date the goods arrived. Late when this is after promised_on.';

create table if not exists public.crm_product_categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  crm_category text not null,
  aliases text[] not null default '{}',
  description text,
  active boolean not null default true,
  sort integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_product_categories_crm_category_check check (crm_category = any (array[
    'Stretch Wrap / Film'::text, 'Pallets'::text, 'Poly Bags / Tubing'::text, 'Shrink Products'::text,
    'Gaylords / Totes'::text, 'Tape'::text, 'Corner Boards'::text, 'Lidding / Laminate Film'::text,
    'Flexibles'::text, 'Ridgid'::text, 'MRO'::text, 'Freight'::text, 'Other'::text
  ]))
);

insert into public.crm_product_categories (name, crm_category, aliases, sort)
select v.name, v.crm_category, v.aliases, v.sort
from (values
  ('Stretch wrap/film/hoods'::text, 'Stretch Wrap / Film'::text, array['Stretch film','Stretch wrap','Hand wrap','Machine wrap','Hooders','Cast film','Blown film']::text[], 10),
  ('Film rollstock (blown/cast/specialty)', 'Flexibles', array['Flexibles','Rollstock','Film'], 20),
  ('Pallets', 'Pallets', array['Wood pallets','Plastic pallets','Skids'], 30),
  ('Poly bags/tubing/sheeting', 'Poly Bags / Tubing', array['Poly bags','Poly tubing','Poly sheeting','Pallet covers','POR bags','Top sheeting'], 40),
  ('Bags/pouches', 'Poly Bags / Tubing', array['Pouches','Wicketed bags','Auto bags'], 50),
  ('Shrink', 'Shrink Products', array['Shrink film','Shrink tubing','Shrink sheeting','Shrink bundling'], 60),
  ('Shrink bags (barrier, food)', 'Shrink Products', array['Barrier bags','Vacuum bags','Meat bags','Cheese bags'], 70),
  ('Shrink bags (PE pallet)', 'Shrink Products', array['Pallet shrink bags','Gusseted covers'], 80),
  ('Gaylords & IBC totes', 'Gaylords / Totes', array['Gaylords','Totes','IBC totes'], 90),
  ('Tape', 'Tape', array['Packing tape','Carton sealing tape'], 100),
  ('Corner boards', 'Corner Boards', array['Edge protectors','Corner guards','Angleboard'], 110),
  ('Lidding and laminate film', 'Lidding / Laminate Film', array['Lidding','Laminate','Sealant web'], 120),
  ('Rigid (blow mold)', 'Ridgid', array['Rigid','Bottles','Containers'], 130),
  ('MRO', 'MRO', array['Gloves','Wipers','Jan San'], 140),
  ('Inbound freight (carrier)', 'Freight', array['Freight','Trucking','Carrier'], 150),
  ('Strapping', 'Other', array['Banding','Cord strap','Poly strapping','Steel strapping','Seals'], 160),
  ('Chipboard & slip sheets', 'Other', array['Slip sheets','Chip pads','Tier sheets','Chipboard'], 170),
  ('Corrugated', 'Other', array['Boxes','Cartons'], 180),
  ('Crates (custom)', 'Other', array['Crates'], 190),
  ('FIBC / bulk bags', 'Other', array['Bulk bags','Super sacks','FIBC'], 200),
  ('Labels', 'Other', array['Label stock'], 210),
  ('Paper (kraft/sheeting/rolls)', 'Other', array['Kraft paper','Paper rolls'], 220)
) as v(name, crm_category, aliases, sort)
where not exists (select 1 from public.crm_product_categories c where c.name = v.name);

alter table public.crm_products
  add column if not exists category_id bigint references public.crm_product_categories (id) on delete set null;
create index if not exists crm_products_category_id_idx on public.crm_products (category_id);

alter table public.crm_vendor_products
  add column if not exists product_id bigint references public.crm_products (id) on delete set null,
  add column if not exists preferred boolean not null default false;
create index if not exists crm_vendor_products_product_idx on public.crm_vendor_products (product_id);

create table if not exists public.crm_rfqs (
  id bigint generated always as identity primary key,
  deal_id bigint references public.crm_deals (id) on delete set null,
  deal_line_id bigint references public.crm_deal_lines (id) on delete set null,
  product_id bigint references public.crm_products (id) on delete set null,
  item text not null,
  category text,
  qty numeric,
  unit text,
  needed_by date,
  notes text,
  status text not null default 'open',
  awarded_vendor_company_id bigint references public.crm_companies (id) on delete set null,
  awarded_response_id bigint,
  awarded_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_rfqs_status_check check (status = any (array['open'::text, 'awarded'::text, 'closed'::text]))
);
create index if not exists crm_rfqs_deal_idx on public.crm_rfqs (deal_id);
create index if not exists crm_rfqs_line_idx on public.crm_rfqs (deal_line_id);
create index if not exists crm_rfqs_product_idx on public.crm_rfqs (product_id);
create index if not exists crm_rfqs_status_idx on public.crm_rfqs (status);

create table if not exists public.crm_rfq_vendors (
  id bigint generated always as identity primary key,
  rfq_id bigint not null references public.crm_rfqs (id) on delete cascade,
  vendor_company_id bigint references public.crm_companies (id) on delete set null,
  vendor_row_id bigint references public.crm_vendors (id) on delete set null,
  vendor_name text not null,
  rank integer,
  why text,
  status text not null default 'to_send',
  sent_to text,
  sent_at timestamptz,
  unit_cost numeric,
  freight numeric,
  moq text,
  lead_time text,
  valid_until date,
  note text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint crm_rfq_vendors_status_check check (status = any (array['to_send'::text, 'sent'::text, 'quoted'::text, 'declined'::text, 'no_response'::text]))
);
create index if not exists crm_rfq_vendors_rfq_idx on public.crm_rfq_vendors (rfq_id);
create index if not exists crm_rfq_vendors_vendor_idx on public.crm_rfq_vendors (vendor_company_id);
create index if not exists crm_rfq_vendors_row_idx on public.crm_rfq_vendors (vendor_row_id);

create table if not exists public.crm_vendor_portal_settings (
  id integer primary key,
  intro_video_url text,
  updated_at timestamptz not null default now(),
  constraint crm_vendor_portal_settings_one check (id = 1)
);
insert into public.crm_vendor_portal_settings (id, intro_video_url)
values (1, null)
on conflict (id) do nothing;
comment on table public.crm_vendor_portal_settings is
  'Optional replacement for assets/video/Driven_Vendor_Portal_Intro_v2.mp4. Null keeps the file that ships with the portal.';

-- Scores stay append-only. A new rating is a new row. The latest row is current.
create or replace function private.crm_vendor_scores_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Vendor scores are append-only. Save a new rating instead of changing an old one.';
end;
$$;

drop trigger if exists crm_vendor_scores_append_only on public.crm_vendor_scores;
create trigger crm_vendor_scores_append_only
  before update or delete on public.crm_vendor_scores
  for each row execute function private.crm_vendor_scores_append_only();

revoke update, delete on table public.crm_vendor_scores from authenticated, anon, public;

create or replace function private.keep_hidden_vendor_commercial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.commission_sees_cost() then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.terms := old.terms;
    new.last_price := old.last_price;
    new.credit_limit := old.credit_limit;
    new.volume_amount := old.volume_amount;
  else
    new.terms := null;
    new.last_price := null;
    new.credit_limit := null;
    new.volume_amount := null;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_vendors_keep_commercial on public.crm_vendors;
create trigger crm_vendors_keep_commercial
  before insert or update on public.crm_vendors
  for each row execute function private.keep_hidden_vendor_commercial();

create or replace function private.keep_hidden_vendor_product_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.commission_sees_cost() then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.last_price := old.last_price;
  else
    new.last_price := null;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_vendor_products_keep_price on public.crm_vendor_products;
create trigger crm_vendor_products_keep_price
  before insert or update on public.crm_vendor_products
  for each row execute function private.keep_hidden_vendor_product_price();

create or replace function private.keep_hidden_rfq_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.commission_sees_cost() then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.unit_cost := old.unit_cost;
    new.freight := old.freight;
  else
    new.unit_cost := null;
    new.freight := null;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_rfq_vendors_keep_cost on public.crm_rfq_vendors;
create trigger crm_rfq_vendors_keep_cost
  before insert or update on public.crm_rfq_vendors
  for each row execute function private.keep_hidden_rfq_cost();

revoke all on function private.keep_hidden_vendor_commercial() from public, anon;
revoke all on function private.keep_hidden_vendor_product_price() from public, anon;
revoke all on function private.keep_hidden_rfq_cost() from public, anon;
revoke all on function private.crm_vendor_scores_append_only() from public, anon;
grant execute on function private.keep_hidden_vendor_commercial() to authenticated;
grant execute on function private.keep_hidden_vendor_product_price() to authenticated;
grant execute on function private.keep_hidden_rfq_cost() to authenticated;
grant execute on function private.crm_vendor_scores_append_only() to authenticated;

-- Team can work quote requests. Prices on the response stay null unless role is full.
drop policy if exists crm_cost_viewers_all on public.crm_rfq_vendors;
drop policy if exists crm_team_all on public.crm_rfq_vendors;
create policy crm_team_all on public.crm_rfq_vendors
  for all to authenticated
  using ((select private.is_crm_team()))
  with check ((select private.is_crm_team()));

-- Purchase history. Owner of the view reads cost columns, then blanks them unless role is full.
create or replace view public.crm_v_purchase_history
with (security_invoker = false) as
select *
from (
  select 'order_line'::text as source,
    dl.id as source_id,
    coalesce(dl.line_date, d.created_at::date) as bought_on,
    dl.product_id,
    coalesce(p.name, dl.description) as item,
    coalesce(dl.category, p.category) as category,
    coalesce(dl.vendor_id, d.vendor_id) as vendor_company_id,
    vc.name as vendor_name,
    d.company_id as customer_id,
    c.name as customer_name,
    dl.quantity as qty,
    dl.unit,
    case when private.can_see_cost() then dl.vendor_price else null::numeric end as unit_cost,
    dl.sell_price,
    case when private.can_see_cost() then dl.freight else null::numeric end as freight,
    dl.deal_id,
    d.stage as deal_stage,
    d.vendor_po_number as po_number,
    dl.invoice_number,
    dl.qb_item_id,
    dl.qb_invoice_id,
    dl.vendor_id is null as line_vendor_missing
  from public.crm_deal_lines dl
  join public.crm_deals d on d.id = dl.deal_id
  left join public.crm_products p on p.id = dl.product_id
  left join public.crm_companies vc on vc.id = coalesce(dl.vendor_id, d.vendor_id)
  left join public.crm_companies c on c.id = d.company_id
  union all
  select 'vendor_po'::text,
    pl.id,
    po.po_date,
    null::bigint,
    pl.item,
    pl.category,
    sv.company_id,
    coalesce(vc.name, sv.supplier),
    d.company_id,
    c.name,
    pl.qty,
    null::text,
    case when private.can_see_cost() then pl.unit_cost else null::numeric end,
    null::numeric,
    null::numeric,
    po.deal_id,
    d.stage,
    po.po_number,
    null::text,
    null::text,
    null::text,
    false
  from public.crm_vendor_po_lines pl
  join public.crm_vendor_pos po on po.id = pl.po_id
  left join public.crm_vendors sv on sv.id = po.vendor_id
  left join public.crm_companies vc on vc.id = sv.company_id
  left join public.crm_deals d on d.id = po.deal_id
  left join public.crm_companies c on c.id = d.company_id
  where pl.deal_line_id is null
    and private.commission_role() = 'full'
) hist
where private.is_crm_team();

create or replace view public.crm_v_vendor_summary
with (security_invoker = true) as
with hist as (
  select vendor_company_id,
    max(bought_on) filter (where source = 'vendor_po' or deal_stage = any (array['customer_po','driven_po','shipped','delivered','invoice_sent','paid'])) as last_order_date,
    max(bought_on) filter (where source = 'order_line' and coalesce(deal_stage, '') <> all (array['customer_po','driven_po','shipped','delivered','invoice_sent','paid'])) as last_quote_date,
    count(*) as lines_bought,
    count(distinct customer_id) as customers_fed,
    sum(unit_cost * qty) as spend,
    sum(sell_price * qty) as sales,
    sum((sell_price - unit_cost) * qty) as gp
  from public.crm_v_purchase_history
  group by vendor_company_id
)
select c.id as company_id,
  c.name as vendor,
  c.owner,
  c.last_contact_at,
  c.qb_customer_id,
  h.last_order_date,
  h.last_quote_date,
  coalesce(h.lines_bought, 0) as lines_bought,
  coalesce(h.customers_fed, 0) as customers_fed,
  case when private.commission_sees_cost() then h.spend else null::numeric end as spend,
  h.sales,
  case when private.commission_sees_cost() then h.gp else null::numeric end as gross_profit,
  (select count(*) from public.crm_contacts ct where ct.company_id = c.id) as contacts,
  (select max(a.at) from public.crm_activity a where a.company_id = c.id) as last_activity_at,
  (select count(*) from public.crm_tasks t where t.company_id = c.id and not t.done) as open_tasks,
  (select min(t.due) from public.crm_tasks t where t.company_id = c.id and not t.done) as next_due,
  (select count(*) from public.crm_vendor_pos po join public.crm_vendors sv on sv.id = po.vendor_id where sv.company_id = c.id and lower(coalesce(po.status, '')) <> 'closed') as open_pos,
  case when private.commission_sees_cost() then (
    select coalesce(sum(b.balance_due), 0) from public.crm_vendor_bills b join public.crm_vendors sv on sv.id = b.vendor_id where sv.company_id = c.id
  ) else null::numeric end as bills_due,
  (select count(*) from public.crm_vendors sv where sv.company_id = c.id) as supplier_rows
from public.crm_companies c
left join hist h on h.vendor_company_id = c.id
where c.kind = 'vendor' and coalesce(trim(c.name), '') <> '';

create or replace view public.crm_v_product_last_buy
with (security_invoker = true) as
with h as (
  select *, lower(trim(item)) as item_key
  from public.crm_v_purchase_history
  where item is not null
), counts as (
  select item_key, count(*) as times_bought, count(distinct vendor_company_id) as vendors_used, min(bought_on) as first_bought_on
  from h
  group by item_key
)
select distinct on (h.item_key)
  h.item_key, h.item, h.category, h.product_id, h.bought_on as last_bought_on,
  h.vendor_company_id as last_vendor_company_id, h.vendor_name as last_vendor,
  h.unit_cost as last_unit_cost, h.sell_price as last_sell_price, h.qty as last_qty, h.unit,
  h.customer_id as last_customer_id, h.customer_name as last_customer, h.deal_id as last_deal_id,
  h.po_number as last_po_number, k.times_bought, k.vendors_used, k.first_bought_on
from h
join counts k on k.item_key = h.item_key
order by h.item_key, h.bought_on desc nulls last, h.source_id desc;

create or replace view public.crm_vendors_visible
with (security_invoker = false) as
select (jsonb_populate_record(null::public.crm_vendors, masked.j)).*
from (
  select case
    when private.commission_sees_cost() then to_jsonb(v)
    else to_jsonb(v) || jsonb_build_object('terms', null, 'last_price', null, 'credit_limit', null, 'volume_amount', null)
  end as j
  from public.crm_vendors v
  where private.is_crm_team()
) masked;

create or replace view public.crm_vendor_products_visible
with (security_invoker = false) as
select (jsonb_populate_record(null::public.crm_vendor_products, masked.j)).*
from (
  select case
    when private.commission_sees_cost() then to_jsonb(p)
    else to_jsonb(p) || jsonb_build_object('last_price', null)
  end as j
  from public.crm_vendor_products p
  where private.is_crm_team()
) masked;

create or replace view public.crm_rfq_vendors_visible
with (security_invoker = false) as
select (jsonb_populate_record(null::public.crm_rfq_vendors, masked.j)).*
from (
  select case
    when private.commission_sees_cost() then to_jsonb(r)
    else to_jsonb(r) || jsonb_build_object('unit_cost', null, 'freight', null)
  end as j
  from public.crm_rfq_vendors r
  where private.is_crm_team()
) masked;

grant select on public.crm_v_purchase_history, public.crm_v_vendor_summary, public.crm_v_product_last_buy,
  public.crm_vendors_visible, public.crm_vendor_products_visible, public.crm_rfq_vendors_visible
  to authenticated;
revoke all on public.crm_v_purchase_history, public.crm_v_vendor_summary, public.crm_v_product_last_buy,
  public.crm_vendors_visible, public.crm_vendor_products_visible, public.crm_rfq_vendors_visible
  from anon, public;

revoke select (terms, last_price, credit_limit, volume_amount) on public.crm_vendors from authenticated, anon, public;
revoke select (last_price) on public.crm_vendor_products from authenticated, anon, public;
revoke select (unit_cost, freight) on public.crm_rfq_vendors from authenticated, anon, public;
revoke select (vendor_price, freight) on public.crm_deal_lines from authenticated, anon, public;
revoke select (vendor_price_per_unit, freight) on public.crm_deals from authenticated, anon, public;
revoke select (unit_cost, amount) on public.crm_vendor_po_lines from authenticated, anon, public;
revoke select (total) on public.crm_vendor_pos from authenticated, anon, public;

-- Order-cost views are security invoker false and still read those columns as the owner.

do $$
declare
  t text;
begin
  foreach t in array array['crm_product_categories', 'crm_rfqs', 'crm_rfq_vendors', 'crm_vendor_portal_settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    if t <> 'crm_vendor_portal_settings' then
      execute format('drop policy if exists crm_team_all on public.%I', t);
      execute format(
        'create policy crm_team_all on public.%I for all to authenticated using ((select private.is_crm_team())) with check ((select private.is_crm_team()))',
        t
      );
    end if;
  end loop;
end $$;

revoke delete on table public.crm_vendor_portal_settings from authenticated;
drop policy if exists crm_team_read on public.crm_vendor_portal_settings;
drop policy if exists crm_full_insert on public.crm_vendor_portal_settings;
drop policy if exists crm_full_update on public.crm_vendor_portal_settings;
create policy crm_team_read on public.crm_vendor_portal_settings
  for select to authenticated
  using ((select private.is_crm_team()));
create policy crm_full_insert on public.crm_vendor_portal_settings
  for insert to authenticated
  with check ((select private.commission_sees_cost()));
create policy crm_full_update on public.crm_vendor_portal_settings
  for update to authenticated
  using ((select private.commission_sees_cost()))
  with check ((select private.commission_sees_cost()));

do $$
declare
  s text;
begin
  foreach s in array array['crm_product_categories_id_seq', 'crm_rfqs_id_seq', 'crm_rfq_vendors_id_seq']
  loop
    if to_regclass('public.' || s) is not null then
      execute format('revoke all on sequence public.%I from anon, public', s);
      execute format('grant usage, select on sequence public.%I to authenticated', s);
    end if;
  end loop;
end $$;
