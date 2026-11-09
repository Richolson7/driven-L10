-- Commissions, invoice payment, and the QuickBooks-ready order/PO layer.
-- NOT applied to the live project. Does not call QuickBooks.
-- Depends on crm_vendors, crm_deals, crm_deal_lines, crm_companies, private.is_crm_team().

alter table public.crm_companies
  add column if not exists booked_by text,
  add column if not exists qb_customer_id text;

comment on column public.crm_companies.booked_by is
  'Setter who booked this customer (rep name, Annie or Patrick). Editable only by commission full-view users.';

alter table public.crm_vendors
  add column if not exists qb_vendor_id text;

create unique index if not exists crm_companies_qb_customer_uidx
  on public.crm_companies (qb_customer_id) where qb_customer_id is not null and qb_customer_id <> '';
create unique index if not exists crm_vendors_qb_vendor_uidx
  on public.crm_vendors (qb_vendor_id) where qb_vendor_id is not null and qb_vendor_id <> '';

alter table public.crm_deals
  add column if not exists vendor_po_number text,
  add column if not exists bill_url text;

alter table public.crm_deal_lines
  add column if not exists qb_invoice_id text,
  add column if not exists qb_item_id text;

comment on column public.crm_deals.paid_date is
  'Legacy order-log paid date. Commission paid-in-full is crm_order_payments.paid_in_full_at, not this column.';

-- Invoice payment. One row per deal (the order). Partial vs paid in full lives here.
create table if not exists public.crm_order_payments (
  id bigint generated always as identity primary key,
  deal_id bigint not null references public.crm_deals (id) on delete cascade,
  invoice_number text,
  qb_invoice_id text,
  invoice_total numeric,
  amount_paid numeric,
  balance_due numeric,
  paid_in_full_at date,
  payment_source text not null default 'manual',
  last_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint crm_order_payments_deal_uidx unique (deal_id),
  constraint crm_order_payments_source_check check (payment_source = any (array['manual'::text, 'quickbooks'::text])),
  constraint crm_order_payments_amount_paid_check check (amount_paid is null or amount_paid >= 0),
  constraint crm_order_payments_balance_check check (balance_due is null or balance_due >= 0)
);

create unique index if not exists crm_order_payments_qb_invoice_uidx
  on public.crm_order_payments (qb_invoice_id) where qb_invoice_id is not null and qb_invoice_id <> '';
create index if not exists crm_order_payments_invoice_number_idx
  on public.crm_order_payments (invoice_number);

create table if not exists public.crm_vendor_pos (
  id bigint generated always as identity primary key,
  qb_po_id text,
  po_number text,
  vendor_id bigint references public.crm_vendors (id) on delete set null,
  po_date date,
  status text not null default 'open',
  total numeric,
  deal_id bigint references public.crm_deals (id) on delete set null,
  ship_to text,
  last_synced_at timestamptz,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  constraint crm_vendor_pos_status_check check (status = any (array['open'::text, 'closed'::text])),
  constraint crm_vendor_pos_source_check check (source = any (array['manual'::text, 'quickbooks'::text]))
);

create unique index if not exists crm_vendor_pos_qb_uidx
  on public.crm_vendor_pos (qb_po_id) where qb_po_id is not null and qb_po_id <> '';
create index if not exists crm_vendor_pos_vendor_idx on public.crm_vendor_pos (vendor_id);
create index if not exists crm_vendor_pos_deal_idx on public.crm_vendor_pos (deal_id);

create table if not exists public.crm_vendor_po_lines (
  id bigint generated always as identity primary key,
  po_id bigint not null references public.crm_vendor_pos (id) on delete cascade,
  item text,
  category text,
  qty numeric,
  unit_cost numeric,
  amount numeric,
  deal_line_id bigint references public.crm_deal_lines (id) on delete set null
);

create index if not exists crm_vendor_po_lines_po_idx on public.crm_vendor_po_lines (po_id);
create index if not exists crm_vendor_po_lines_line_idx on public.crm_vendor_po_lines (deal_line_id);

create table if not exists public.crm_vendor_bills (
  id bigint generated always as identity primary key,
  qb_bill_id text,
  bill_number text,
  vendor_id bigint references public.crm_vendors (id) on delete set null,
  deal_id bigint references public.crm_deals (id) on delete set null,
  bill_date date,
  total numeric,
  balance_due numeric,
  paid_at date,
  bill_url text,
  source text not null default 'manual',
  last_synced_at timestamptz,
  constraint crm_vendor_bills_source_check check (source = any (array['manual'::text, 'quickbooks'::text]))
);

create unique index if not exists crm_vendor_bills_qb_uidx
  on public.crm_vendor_bills (qb_bill_id) where qb_bill_id is not null and qb_bill_id <> '';

create table if not exists public.crm_qb_unmatched (
  id bigint generated always as identity primary key,
  entity text not null,
  qb_id text,
  external_number text,
  name text,
  payload jsonb not null default '{}'::jsonb,
  reason text not null,
  linked_vendor_id bigint references public.crm_vendors (id) on delete set null,
  linked_company_id bigint references public.crm_companies (id) on delete set null,
  linked_deal_id bigint references public.crm_deals (id) on delete set null,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_qb_sync_state (
  id integer primary key default 1,
  connected boolean not null default false,
  last_synced_at timestamptz,
  note text,
  constraint crm_qb_sync_state_one check (id = 1)
);

insert into public.crm_qb_sync_state (id, connected, note)
values (1, false, 'QuickBooks sync is not connected.')
on conflict (id) do nothing;

-- Commission access. role full sees every rep. role own sees only rep_name.
create table if not exists public.crm_commission_access (
  email text primary key,
  role text not null,
  rep_name text,
  active boolean not null default true,
  constraint crm_commission_access_role_check check (role = any (array['full'::text, 'own'::text])),
  constraint crm_commission_access_own_rep_check check (role <> 'own' or (rep_name is not null and btrim(rep_name) <> ''))
);

insert into public.crm_commission_access (email, role, rep_name) values
  ('amber@drivensol.com', 'full', null),
  ('drdanyoung79@gmail.com', 'full', null),
  ('rich@drivensol.com', 'full', 'Rich'),
  ('landon@drivensol.com', 'own', 'Landon'),
  ('orders@drivensol.com', 'own', 'Annie'),
  ('logistics@drivensol.com', 'own', 'Patrick')
on conflict (email) do update
  set role = excluded.role, rep_name = excluded.rep_name, active = true;

create table if not exists public.crm_commission_rates (
  id bigint generated always as identity primary key,
  rep text not null,
  plan text not null,
  basis text not null default 'gross_margin',
  rate numeric,
  effective_from date not null,
  effective_to date,
  notes text,
  created_at timestamptz not null default now(),
  constraint crm_commission_rates_plan_check check (plan = any (array['flat'::text, 'setter_tier'::text])),
  constraint crm_commission_rates_basis_check check (basis = 'gross_margin'),
  constraint crm_commission_rates_rate_check check (rate is null or (rate >= 0 and rate <= 1))
);

create index if not exists crm_commission_rates_rep_idx
  on public.crm_commission_rates (lower(rep), effective_from desc);

insert into public.crm_commission_rates (rep, plan, basis, rate, effective_from, notes)
select v.rep, v.plan, 'gross_margin', v.rate, date '2000-01-01', v.notes
from (values
  ('Landon'::text, 'flat'::text, 0.30::numeric, 'Flat 30% of gross margin on orders he owns. Editable by full-view users.'::text),
  ('Rich', 'flat', 0.20, 'Flat 20% of gross margin on orders he closes or owns as rep.'),
  ('Annie', 'setter_tier', null, 'Setter tiers on gross margin by invoice amount.'),
  ('Patrick', 'setter_tier', null, 'Setter tiers on gross margin by invoice amount.')
) as v(rep, plan, rate, notes)
where not exists (select 1 from public.crm_commission_rates r where lower(r.rep) = lower(v.rep) and r.plan = v.plan);

-- Boundaries: invoice < 10000 = 5%; 10000 through 50000 inclusive = 7.5%; invoice > 50000 = 10%.
create table if not exists public.crm_commission_setter_tiers (
  id bigint generated always as identity primary key,
  min_invoice numeric,
  max_invoice numeric,
  min_inclusive boolean not null default false,
  max_inclusive boolean not null default false,
  rate numeric not null,
  sort integer not null,
  constraint crm_commission_setter_tiers_rate_check check (rate >= 0 and rate <= 1)
);

insert into public.crm_commission_setter_tiers (min_invoice, max_invoice, min_inclusive, max_inclusive, rate, sort)
select * from (values
  (null::numeric, 10000::numeric, false, false, 0.05::numeric, 1),
  (10000::numeric, 50000::numeric, true, true, 0.075::numeric, 2),
  (50000::numeric, null::numeric, false, false, 0.10::numeric, 3)
) as v(min_invoice, max_invoice, min_inclusive, max_inclusive, rate, sort)
where not exists (select 1 from public.crm_commission_setter_tiers);

create table if not exists public.crm_commission_marks (
  id bigint generated always as identity primary key,
  kind text not null,
  deal_id bigint not null references public.crm_deals (id) on delete cascade,
  rep text not null,
  status text not null default 'paid',
  paid_on date,
  pay_period date,
  marked_by text,
  marked_at timestamptz not null default now(),
  constraint crm_commission_marks_kind_check check (kind = any (array['closer'::text, 'setter'::text])),
  constraint crm_commission_marks_status_check check (status = 'paid'),
  constraint crm_commission_marks_uidx unique (kind, deal_id, rep)
);

create table if not exists public.crm_commission_adjustments (
  id bigint generated always as identity primary key,
  rep text not null,
  pay_period text not null,
  deal_id bigint references public.crm_deals (id) on delete set null,
  kind text not null,
  amount numeric not null,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  constraint crm_commission_adjustments_kind_check check (kind = any (array['adjustment'::text, 'clawback'::text]))
);

create index if not exists crm_commission_adjustments_rep_idx
  on public.crm_commission_adjustments (lower(rep), pay_period);

-- Stored disabled. The app must not calculate or display bonus dollars while active is false.
create table if not exists public.crm_commission_bonus_rules (
  id bigint generated always as identity primary key,
  code text not null unique,
  name text not null,
  active boolean not null default false,
  dollars_per_call numeric,
  daily_call_threshold integer,
  daily_cap numeric,
  weekly_kicker numeric,
  kicker_min_calls integer,
  notes text not null,
  created_at timestamptz not null default now()
);

insert into public.crm_commission_bonus_rules (
  code, name, active, dollars_per_call, daily_call_threshold, daily_cap, weekly_kicker, kicker_min_calls, notes
)
select
  'setter_call_volume',
  'Setter call-volume bonus',
  false,
  2, 20, 30, 50, 20,
  'Pending Dan''s approval. Calls are already logged on crm_activity (kind = call, by_user). This rule is disabled, so those calls are not counted and no bonus is calculated.'
where not exists (select 1 from public.crm_commission_bonus_rules where code = 'setter_call_volume');

-- JWT helpers. security definer, private schema, email from auth.jwt() not user_metadata.
create or replace function private.commission_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.role
  from public.crm_commission_access a
  where a.active is true
    and lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;

create or replace function private.commission_rep()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.rep_name
  from public.crm_commission_access a
  where a.active is true
    and lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;

create or replace function private.commission_sees_cost()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.commission_role() = 'full';
$$;

revoke all on function private.commission_role() from public, anon;
revoke all on function private.commission_rep() from public, anon;
revoke all on function private.commission_sees_cost() from public, anon;
grant execute on function private.commission_role() to authenticated;
grant execute on function private.commission_rep() to authenticated;
grant execute on function private.commission_sees_cost() to authenticated;

create or replace function private.strip_quote_cost(bag jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  q jsonb;
  lines jsonb := '[]'::jsonb;
  orders jsonb := '[]'::jsonb;
  i int;
  line jsonb;
begin
  if bag is null or jsonb_typeof(bag) <> 'object' then
    return bag;
  end if;
  if bag ? '_quote' and jsonb_typeof(bag -> '_quote') = 'object' then
    q := (bag -> '_quote') - 'freight';
    if jsonb_typeof(q -> 'lines') = 'array' then
      for i in 0 .. jsonb_array_length(q -> 'lines') - 1 loop
        line := (q -> 'lines' -> i) - 'cost' - 'freight';
        lines := lines || jsonb_build_array(line);
      end loop;
      q := jsonb_set(q, '{lines}', lines);
    end if;
    bag := jsonb_set(bag, '{_quote}', q);
  end if;
  if jsonb_typeof(bag -> '_order_lines') = 'array' then
    for i in 0 .. jsonb_array_length(bag -> '_order_lines') - 1 loop
      line := (bag -> '_order_lines' -> i) - 'cost' - 'freight';
      orders := orders || jsonb_build_array(line);
    end loop;
    bag := jsonb_set(bag, '{_order_lines}', orders);
  end if;
  return bag;
end;
$$;

revoke all on function private.strip_quote_cost(jsonb) from public, anon, authenticated;

create or replace function private.next_payroll(p date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when p is null then null::date
    when extract(day from p)::int < 15 then (date_trunc('month', p)::date + 14)
    when p < (date_trunc('month', p) + interval '1 month - 1 day')::date
      then (date_trunc('month', p) + interval '1 month - 1 day')::date
    else (date_trunc('month', p)::date + interval '1 month')::date + 14
  end;
$$;

revoke all on function private.next_payroll(date) from public, anon;
grant execute on function private.next_payroll(date) to authenticated;

create or replace function private.guard_company_booked_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.booked_by is not distinct from old.booked_by then
    return new;
  end if;
  if new.booked_by is null or btrim(new.booked_by) = '' then
    if tg_op = 'UPDATE' and old.booked_by is not null and coalesce(private.commission_role(), '') <> 'full' then
      raise exception 'Only commission full-view users can change who booked a customer';
    end if;
    return new;
  end if;
  if coalesce(private.commission_role(), '') <> 'full' then
    raise exception 'Only commission full-view users can set who booked a customer';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_company_booked_by() from public, anon;
grant execute on function private.guard_company_booked_by() to authenticated;

drop trigger if exists crm_companies_booked_by on public.crm_companies;
create trigger crm_companies_booked_by
  before insert or update of booked_by on public.crm_companies
  for each row execute function private.guard_company_booked_by();

-- Reads of order cost go through these views. Direct column select is revoked below.
create or replace view public.crm_deals_safe
with (security_invoker = false) as
select (jsonb_populate_record(null::public.crm_deals, masked.j)).*
from (
  select case
    when private.commission_sees_cost() then to_jsonb(d)
    else to_jsonb(d) || jsonb_build_object(
      'vendor_price_per_unit', null,
      'freight', null,
      'custom', private.strip_quote_cost(d.custom)
    )
  end as j
  from public.crm_deals d
  where private.is_crm_team()
) masked;

create or replace view public.crm_order_lines
with (security_invoker = false) as
select (jsonb_populate_record(null::public.crm_deal_lines, masked.j)).*
from (
  select case
    when private.commission_sees_cost() then to_jsonb(l)
    else to_jsonb(l) || jsonb_build_object('vendor_price', null, 'freight', null)
  end as j
  from public.crm_deal_lines l
  where private.is_crm_team()
) masked;

grant select on public.crm_deals_safe to authenticated;
grant select on public.crm_order_lines to authenticated;
revoke all on public.crm_deals_safe from anon, public;
revoke all on public.crm_order_lines from anon, public;

revoke select (vendor_price_per_unit, freight) on public.crm_deals from authenticated, anon, public;
revoke select (vendor_price, freight) on public.crm_deal_lines from authenticated, anon, public;

-- A masked screen sends nulls. Keep the stored cost unless the caller is full-view.
create or replace function private.keep_hidden_line_cost()
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
    new.vendor_price := old.vendor_price;
    new.freight := old.freight;
  end if;
  return new;
end;
$$;

create or replace function private.keep_hidden_deal_cost()
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
    new.vendor_price_per_unit := old.vendor_price_per_unit;
    new.freight := old.freight;
  end if;
  return new;
end;
$$;

revoke all on function private.keep_hidden_line_cost() from public, anon;
revoke all on function private.keep_hidden_deal_cost() from public, anon;
grant execute on function private.keep_hidden_line_cost() to authenticated;
grant execute on function private.keep_hidden_deal_cost() to authenticated;

drop trigger if exists crm_deal_lines_keep_cost on public.crm_deal_lines;
create trigger crm_deal_lines_keep_cost
  before update on public.crm_deal_lines
  for each row execute function private.keep_hidden_line_cost();

drop trigger if exists crm_deals_keep_cost on public.crm_deals;
create trigger crm_deals_keep_cost
  before update on public.crm_deals
  for each row execute function private.keep_hidden_deal_cost();

comment on view public.crm_order_lines is
  'Order log lines. vendor_price and freight are null unless the JWT email is a commission full-view user.';

-- PO headers without money. Team can read this. Costs stay on the base table (full only).
create or replace view public.crm_vendor_pos_open
with (security_invoker = false) as
select p.id, p.qb_po_id, p.po_number, p.vendor_id, v.supplier as vendor_name,
       p.po_date, p.status, p.deal_id, p.ship_to, p.source, p.last_synced_at
from public.crm_vendor_pos p
left join public.crm_vendors v on v.id = p.vendor_id
where private.is_crm_team();

grant select on public.crm_vendor_pos_open to authenticated;
revoke all on public.crm_vendor_pos_open from anon, public;

-- Won-order money, used by commission and rollups. Definer so the mask can still compute GM.
create or replace view public.crm_commission_lines
with (security_invoker = false) as
with won as (
  select d.id, d.company_id, d.sales_rep, d.description, d.customer_po_number,
         d.stage, d.est_ship_date, d.est_delivery_date,
         coalesce(nullif(d.custom ->> '_won_at', ''), d.stage_changed_at::date::text)::date as close_date
  from public.crm_deals d
  where d.stage = any (array['customer_po','driven_po','shipped','delivered','invoice_sent','paid'])
    and coalesce(d.custom ->> '_status', 'open') <> 'lost'
    and private.is_crm_team()
),
firsts as (
  select company_id, min(close_date) as first_close
  from won
  where company_id is not null and close_date is not null
  group by company_id
),
money as (
  select l.deal_id,
    sum(case when l.sell_price is null or l.quantity is null then null else round(l.sell_price * l.quantity, 2) end) as invoice_amount,
    sum(case when l.vendor_price is null or l.quantity is null then null else round(l.vendor_price * l.quantity, 2) end) as vendor_cost,
    sum(case
          when l.sell_price is null or l.quantity is null then null
          when l.vendor_price is null or l.quantity is null then null
          else round(round(l.sell_price * l.quantity, 2) - (round(l.vendor_price * l.quantity, 2) + coalesce(l.freight, 0)), 2)
        end) as gross_margin,
    min(l.invoice_number) filter (where coalesce(l.invoice_number, '') <> '') as invoice_number,
    (array_agg(l.sales_rep order by l.position) filter (where coalesce(btrim(l.sales_rep), '') <> ''))[1] as line_rep
  from public.crm_deal_lines l
  group by l.deal_id
),
base as (
  select 'closer'::text as kind,
         coalesce(nullif(btrim(w.sales_rep), ''), nullif(btrim(m.line_rep), '')) as rep,
         w.id as deal_id, w.company_id, co.name as customer, w.description, w.customer_po_number,
         m.invoice_number, m.invoice_amount as sale, m.vendor_cost, m.gross_margin, w.close_date,
         flat.rate as rate,
         case when flat.rate is not null then 'flat' else null end as plan
  from won w
  left join money m on m.deal_id = w.id
  left join public.crm_companies co on co.id = w.company_id
  left join lateral (
    select r.rate
    from public.crm_commission_rates r
    where r.plan = 'flat'
      and lower(r.rep) = lower(coalesce(nullif(btrim(w.sales_rep), ''), nullif(btrim(m.line_rep), '')))
      and r.effective_from <= coalesce(w.close_date, current_date)
      and (r.effective_to is null or r.effective_to >= coalesce(w.close_date, current_date))
    order by r.effective_from desc
    limit 1
  ) flat on true
  union all
  select 'setter'::text,
         c.booked_by,
         w.id, w.company_id, co.name, w.description, w.customer_po_number,
         m.invoice_number, m.invoice_amount, m.vendor_cost, m.gross_margin, w.close_date,
         tier.rate,
         'setter_tier'
  from won w
  join firsts f on f.company_id = w.company_id
  join public.crm_companies c on c.id = w.company_id
  join public.crm_companies co on co.id = w.company_id
  join public.crm_commission_rates sr
    on sr.plan = 'setter_tier' and lower(sr.rep) = lower(c.booked_by)
  left join money m on m.deal_id = w.id
  left join lateral (
    select t.rate
    from public.crm_commission_setter_tiers t
    where (t.min_invoice is null or (t.min_inclusive and m.invoice_amount >= t.min_invoice) or (not t.min_inclusive and m.invoice_amount > t.min_invoice))
      and (t.max_invoice is null or (t.max_inclusive and m.invoice_amount <= t.max_invoice) or (not t.max_inclusive and m.invoice_amount < t.max_invoice))
    order by t.sort
    limit 1
  ) tier on true
  where c.booked_by is not null
    and w.close_date is not null
    and w.close_date >= f.first_close
    and w.close_date <= (f.first_close + interval '6 months')::date
)
select
  b.kind,
  b.rep,
  b.deal_id,
  b.company_id,
  b.customer,
  b.description,
  b.customer_po_number,
  b.invoice_number,
  b.sale,
  case when private.commission_sees_cost() then b.vendor_cost else null end as vendor_cost,
  b.gross_margin,
  b.close_date,
  b.rate,
  b.plan,
  case
    when b.rate is null or b.gross_margin is null then null
    else round(b.gross_margin * b.rate, 2)
  end as commission,
  case
    when mk.status = 'paid' then 'Paid'
    when pay.paid_in_full_at is not null then 'Payable'
    else 'Earned, awaiting full payment'
  end as pay_status,
  pay.paid_in_full_at,
  pay.payment_source,
  pay.amount_paid,
  pay.balance_due,
  case
    when mk.pay_period is not null then mk.pay_period
    when pay.paid_in_full_at is not null then private.next_payroll(pay.paid_in_full_at)
    else null
  end as pay_period,
  mk.paid_on as commission_paid_on
from base b
left join public.crm_order_payments pay on pay.deal_id = b.deal_id
left join public.crm_commission_marks mk
  on mk.deal_id = b.deal_id and mk.kind = b.kind and lower(mk.rep) = lower(b.rep)
where private.commission_role() = 'full'
   or (private.commission_role() = 'own' and lower(b.rep) = lower(coalesce(private.commission_rep(), '')));

grant select on public.crm_commission_lines to authenticated;
revoke all on public.crm_commission_lines from anon, public;

comment on view public.crm_commission_lines is
  'One commission row per won order and plan. Payable only when crm_order_payments.paid_in_full_at is set. vendor_cost is null unless full-view. Own-only rows are limited to that rep.';

-- Chandler KPI rollups. Full-view only. Zero rows for everyone else.
create or replace view public.crm_revenue_by_category
with (security_invoker = false) as
select
  case l.category
    when 'Pallets' then 'Pallets'
    when 'Ridgid' then 'Rigid'
    when 'Flexibles' then 'Flexible'
    when 'Stretch Wrap / Film' then 'Flexible'
    when 'Poly Bags / Tubing' then 'Flexible'
    when 'Shrink Products' then 'Flexible'
    when 'Lidding / Laminate Film' then 'Flexible'
    else coalesce(nullif(l.category, ''), 'Other')
  end as sheet_group,
  coalesce(nullif(l.category, ''), 'Other') as category,
  count(*) as lines,
  sum(case when l.sell_price is null or l.quantity is null then null else round(l.sell_price * l.quantity, 2) end) as revenue,
  sum(case
        when l.sell_price is null or l.quantity is null or l.vendor_price is null then null
        else round(round(l.sell_price * l.quantity, 2) - (round(l.vendor_price * l.quantity, 2) + coalesce(l.freight, 0)), 2)
      end) as gross_profit
from public.crm_deal_lines l
join public.crm_deals d on d.id = l.deal_id
where private.commission_sees_cost()
  and d.stage = any (array['customer_po','driven_po','shipped','delivered','invoice_sent','paid'])
  and coalesce(d.custom ->> '_status', 'open') <> 'lost'
group by 1, 2;

create or replace view public.crm_margin_by_customer
with (security_invoker = false) as
select
  co.name as customer,
  d.company_id,
  count(distinct l.description) as products,
  count(*) as lines,
  sum(case when l.sell_price is null or l.quantity is null then null else round(l.sell_price * l.quantity, 2) end) as revenue,
  sum(case
        when l.sell_price is null or l.quantity is null or l.vendor_price is null then null
        else round(round(l.sell_price * l.quantity, 2) - (round(l.vendor_price * l.quantity, 2) + coalesce(l.freight, 0)), 2)
      end) as gross_profit,
  min(case
        when l.sell_price is null or l.quantity is null or l.sell_price = 0 or l.vendor_price is null then null
        else (l.sell_price * l.quantity - (l.vendor_price * l.quantity + coalesce(l.freight, 0))) / nullif(l.sell_price * l.quantity, 0)
      end) as min_margin,
  max(case
        when l.sell_price is null or l.quantity is null or l.sell_price = 0 or l.vendor_price is null then null
        else (l.sell_price * l.quantity - (l.vendor_price * l.quantity + coalesce(l.freight, 0))) / nullif(l.sell_price * l.quantity, 0)
      end) as max_margin
from public.crm_deal_lines l
join public.crm_deals d on d.id = l.deal_id
left join public.crm_companies co on co.id = d.company_id
where private.commission_sees_cost()
  and d.stage = any (array['customer_po','driven_po','shipped','delivered','invoice_sent','paid'])
  and coalesce(d.custom ->> '_status', 'open') <> 'lost'
group by co.name, d.company_id;

create or replace view public.crm_margin_by_product
with (security_invoker = false) as
select
  l.description as product,
  co.name as customer,
  ven.name as vendor,
  l.sell_price,
  l.sales_rep,
  l.category,
  case
    when l.sell_price is null or l.quantity is null or l.sell_price = 0 or l.vendor_price is null then null
    else round((l.sell_price * l.quantity - (l.vendor_price * l.quantity + coalesce(l.freight, 0))) / nullif(l.sell_price * l.quantity, 0), 4)
  end as margin,
  case when l.sell_price is null or l.quantity is null then null else round(l.sell_price * l.quantity, 2) end as revenue
from public.crm_deal_lines l
join public.crm_deals d on d.id = l.deal_id
left join public.crm_companies co on co.id = d.company_id
left join public.crm_companies ven on ven.id = l.vendor_id
where private.commission_sees_cost()
  and d.stage = any (array['customer_po','driven_po','shipped','delivered','invoice_sent','paid'])
  and coalesce(d.custom ->> '_status', 'open') <> 'lost';

grant select on public.crm_revenue_by_category to authenticated;
grant select on public.crm_margin_by_customer to authenticated;
grant select on public.crm_margin_by_product to authenticated;
revoke all on public.crm_revenue_by_category from anon, public;
revoke all on public.crm_margin_by_customer from anon, public;
revoke all on public.crm_margin_by_product from anon, public;

-- Customers served: no costs. PO link when the line is linked, else the order-log vendor name.
create or replace view public.crm_customers_served
with (security_invoker = false) as
select v.id as vendor_id, v.supplier as vendor_name, d.company_id, co.name as customer_name,
       l.category, coalesce(p.ship_to, d.customer_po_number) as location,
       max(coalesce(l.line_date, d.stage_changed_at::date)) as last_buy,
       'order log'::text as link_source
from public.crm_deal_lines l
join public.crm_deals d on d.id = l.deal_id
left join public.crm_companies co on co.id = d.company_id
left join public.crm_companies vc on vc.id = l.vendor_id
join public.crm_vendors v on lower(v.supplier) = lower(vc.name)
left join public.crm_vendor_po_lines pl on pl.deal_line_id = l.id
left join public.crm_vendor_pos p on p.id = pl.po_id
where private.is_crm_team()
  and d.stage = any (array['customer_po','driven_po','shipped','delivered','invoice_sent','paid'])
  and coalesce(d.custom ->> '_status', 'open') <> 'lost'
group by v.id, v.supplier, d.company_id, co.name, l.category, coalesce(p.ship_to, d.customer_po_number);

grant select on public.crm_customers_served to authenticated;
revoke all on public.crm_customers_served from anon, public;

create or replace function private.guard_commission_mark()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(private.commission_role(), '') <> 'full' then
    raise exception 'Only commission full-view users can mark a commission Paid';
  end if;
  if not exists (
    select 1 from public.crm_order_payments p
    where p.deal_id = new.deal_id and p.paid_in_full_at is not null
  ) then
    raise exception 'Only a Payable commission can be marked Paid. The invoice is not paid in full.';
  end if;
  if new.pay_period is null then
    new.pay_period := private.next_payroll((
      select p.paid_in_full_at from public.crm_order_payments p where p.deal_id = new.deal_id
    ));
  end if;
  new.status := 'paid';
  return new;
end;
$$;

revoke all on function private.guard_commission_mark() from public, anon;
grant execute on function private.guard_commission_mark() to authenticated;

drop trigger if exists crm_commission_marks_guard on public.crm_commission_marks;
create trigger crm_commission_marks_guard
  before insert or update on public.crm_commission_marks
  for each row execute function private.guard_commission_mark();

create or replace function private.qb_service_only()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'QuickBooks sync is service-role only';
  end if;
end;
$$;

revoke all on function private.qb_service_only() from public, anon, authenticated;

create or replace function private.qb_touch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.crm_qb_sync_state
  set last_synced_at = now()
  where id = 1;
end;
$$;

revoke all on function private.qb_touch() from public, anon, authenticated;

create or replace function public.crm_qb_upsert_customer(p_qb_id text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
  cid bigint;
begin
  perform private.qb_service_only();
  if coalesce(p_qb_id, '') <> '' then
    select id into cid from public.crm_companies where qb_customer_id = p_qb_id limit 1;
  end if;
  if cid is null and coalesce(p_name, '') <> '' then
    select count(*) into n from public.crm_companies
    where lower(name) = lower(p_name) and kind is distinct from 'vendor';
    if n = 1 then
      select id into cid from public.crm_companies
      where lower(name) = lower(p_name) and kind is distinct from 'vendor';
    elsif n > 1 then
      insert into public.crm_qb_unmatched (entity, qb_id, name, reason, payload)
      values ('customer', p_qb_id, p_name, 'More than one company has this name', jsonb_build_object('name', p_name));
      return jsonb_build_object('matched', false, 'reason', 'ambiguous name');
    end if;
  end if;
  if cid is null then
    insert into public.crm_qb_unmatched (entity, qb_id, name, reason, payload)
    values ('customer', p_qb_id, p_name, 'No company matched', jsonb_build_object('name', p_name));
    return jsonb_build_object('matched', false, 'reason', 'unmatched');
  end if;
  update public.crm_companies set qb_customer_id = p_qb_id where id = cid and coalesce(p_qb_id, '') <> '';
  perform private.qb_touch();
  return jsonb_build_object('matched', true, 'company_id', cid);
end;
$$;

create or replace function public.crm_qb_upsert_vendor(p_qb_id text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
  vid bigint;
begin
  perform private.qb_service_only();
  if coalesce(p_qb_id, '') <> '' then
    select id into vid from public.crm_vendors where qb_vendor_id = p_qb_id limit 1;
  end if;
  if vid is null and coalesce(p_name, '') <> '' then
    select count(distinct supplier) into n from public.crm_vendors where lower(supplier) = lower(p_name);
    if n = 1 then
      select min(id) into vid from public.crm_vendors where lower(supplier) = lower(p_name);
    elsif n > 1 then
      insert into public.crm_qb_unmatched (entity, qb_id, name, reason)
      values ('vendor', p_qb_id, p_name, 'More than one supplier name matched');
      return jsonb_build_object('matched', false, 'reason', 'ambiguous name');
    end if;
  end if;
  if vid is null then
    insert into public.crm_qb_unmatched (entity, qb_id, name, reason)
    values ('vendor', p_qb_id, p_name, 'No supplier matched');
    return jsonb_build_object('matched', false, 'reason', 'unmatched');
  end if;
  update public.crm_vendors set qb_vendor_id = p_qb_id where lower(supplier) = lower((select supplier from public.crm_vendors where id = vid))
    and coalesce(p_qb_id, '') <> '';
  perform private.qb_touch();
  return jsonb_build_object('matched', true, 'vendor_id', vid);
end;
$$;

create or replace function public.crm_qb_upsert_invoice(
  p_qb_invoice_id text, p_invoice_number text, p_total numeric, p_balance numeric, p_paid_date date
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  did bigint;
  n int;
  paid date;
  amt numeric;
begin
  perform private.qb_service_only();
  if coalesce(p_qb_invoice_id, '') <> '' then
    select deal_id into did from public.crm_order_payments where qb_invoice_id = p_qb_invoice_id limit 1;
  end if;
  if did is null and coalesce(p_invoice_number, '') <> '' then
    select deal_id into did from public.crm_order_payments where invoice_number = p_invoice_number limit 1;
  end if;
  if did is null and coalesce(p_invoice_number, '') <> '' then
    select count(distinct deal_id) into n from public.crm_deal_lines where invoice_number = p_invoice_number;
    if n = 1 then
      select distinct deal_id into did from public.crm_deal_lines where invoice_number = p_invoice_number;
    end if;
  end if;
  if did is null then
    insert into public.crm_qb_unmatched (entity, qb_id, external_number, reason, payload)
    values ('invoice', p_qb_invoice_id, p_invoice_number, 'No order matched this invoice',
            jsonb_build_object('total', p_total, 'balance', p_balance, 'paid_date', p_paid_date));
    return jsonb_build_object('matched', false);
  end if;
  amt := case when p_total is not null and p_balance is not null then greatest(p_total - p_balance, 0) else null end;
  paid := case when p_balance is not null and p_balance <= 0 then coalesce(p_paid_date, current_date) else null end;
  insert into public.crm_order_payments (
    deal_id, invoice_number, qb_invoice_id, invoice_total, amount_paid, balance_due, paid_in_full_at, payment_source, last_synced_at
  ) values (
    did, nullif(p_invoice_number, ''), nullif(p_qb_invoice_id, ''), p_total, amt, p_balance, paid, 'quickbooks', now()
  )
  on conflict (deal_id) do update set
    invoice_number = coalesce(excluded.invoice_number, crm_order_payments.invoice_number),
    qb_invoice_id = coalesce(excluded.qb_invoice_id, crm_order_payments.qb_invoice_id),
    invoice_total = excluded.invoice_total,
    amount_paid = excluded.amount_paid,
    balance_due = excluded.balance_due,
    paid_in_full_at = excluded.paid_in_full_at,
    payment_source = 'quickbooks',
    last_synced_at = now(),
    updated_at = now();
  if coalesce(p_qb_invoice_id, '') <> '' then
    update public.crm_deal_lines set qb_invoice_id = p_qb_invoice_id
    where deal_id = did and (invoice_number = p_invoice_number or coalesce(p_invoice_number, '') = '');
  end if;
  perform private.qb_touch();
  return jsonb_build_object('matched', true, 'deal_id', did, 'paid_in_full_at', paid);
end;
$$;

create or replace function public.crm_qb_upsert_purchase_order(
  p_qb_po_id text, p_po_number text, p_qb_vendor_id text, p_vendor_name text,
  p_po_date date, p_status text, p_total numeric, p_ship_to text, p_lines jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  vid bigint;
  pid bigint;
  n int;
  st text;
  line jsonb;
begin
  perform private.qb_service_only();
  if coalesce(p_qb_vendor_id, '') <> '' then
    select id into vid from public.crm_vendors where qb_vendor_id = p_qb_vendor_id limit 1;
  end if;
  if vid is null and coalesce(p_vendor_name, '') <> '' then
    select count(distinct supplier) into n from public.crm_vendors where lower(supplier) = lower(p_vendor_name);
    if n = 1 then
      select min(id) into vid from public.crm_vendors where lower(supplier) = lower(p_vendor_name);
    end if;
  end if;
  if vid is null then
    insert into public.crm_qb_unmatched (entity, qb_id, external_number, name, reason, payload)
    values ('purchase_order', p_qb_po_id, p_po_number, p_vendor_name, 'Vendor was not matched',
            jsonb_build_object('total', p_total, 'lines', p_lines));
    return jsonb_build_object('matched', false);
  end if;
  st := case when lower(coalesce(p_status, '')) in ('closed', 'paid') then 'closed' else 'open' end;
  if coalesce(p_qb_po_id, '') <> '' then
    select id into pid from public.crm_vendor_pos where qb_po_id = p_qb_po_id limit 1;
  end if;
  if pid is null and coalesce(p_po_number, '') <> '' then
    select id into pid from public.crm_vendor_pos where po_number = p_po_number and vendor_id = vid limit 1;
  end if;
  if pid is null then
    insert into public.crm_vendor_pos (qb_po_id, po_number, vendor_id, po_date, status, total, ship_to, source, last_synced_at)
    values (nullif(p_qb_po_id, ''), nullif(p_po_number, ''), vid, p_po_date, st, p_total, p_ship_to, 'quickbooks', now())
    returning id into pid;
  else
    update public.crm_vendor_pos set
      po_number = coalesce(nullif(p_po_number, ''), po_number),
      vendor_id = vid, po_date = p_po_date, status = st, total = p_total, ship_to = p_ship_to,
      source = 'quickbooks', last_synced_at = now(), qb_po_id = coalesce(nullif(p_qb_po_id, ''), qb_po_id)
    where id = pid;
  end if;
  delete from public.crm_vendor_po_lines where po_id = pid;
  if jsonb_typeof(p_lines) = 'array' then
    for line in select value from jsonb_array_elements(p_lines) loop
      insert into public.crm_vendor_po_lines (po_id, item, category, qty, unit_cost, amount)
      values (
        pid, line ->> 'item', line ->> 'category',
        nullif(line ->> 'qty', '')::numeric,
        nullif(line ->> 'unit_cost', '')::numeric,
        nullif(line ->> 'amount', '')::numeric
      );
    end loop;
  end if;
  perform private.qb_touch();
  return jsonb_build_object('matched', true, 'po_id', pid, 'vendor_id', vid);
end;
$$;

create or replace function public.crm_qb_upsert_bill(
  p_qb_bill_id text, p_bill_number text, p_qb_vendor_id text, p_vendor_name text,
  p_bill_date date, p_total numeric, p_balance numeric, p_paid_date date, p_url text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  vid bigint;
  bid bigint;
  n int;
  paid date;
begin
  perform private.qb_service_only();
  if coalesce(p_qb_vendor_id, '') <> '' then
    select id into vid from public.crm_vendors where qb_vendor_id = p_qb_vendor_id limit 1;
  end if;
  if vid is null and coalesce(p_vendor_name, '') <> '' then
    select count(distinct supplier) into n from public.crm_vendors where lower(supplier) = lower(p_vendor_name);
    if n = 1 then
      select min(id) into vid from public.crm_vendors where lower(supplier) = lower(p_vendor_name);
    end if;
  end if;
  if vid is null then
    insert into public.crm_qb_unmatched (entity, qb_id, external_number, name, reason, payload)
    values ('bill', p_qb_bill_id, p_bill_number, p_vendor_name, 'Vendor was not matched',
            jsonb_build_object('total', p_total, 'balance', p_balance));
    return jsonb_build_object('matched', false);
  end if;
  paid := case when p_balance is not null and p_balance <= 0 then coalesce(p_paid_date, current_date) else null end;
  if coalesce(p_qb_bill_id, '') <> '' then
    select id into bid from public.crm_vendor_bills where qb_bill_id = p_qb_bill_id limit 1;
  end if;
  if bid is null then
    insert into public.crm_vendor_bills (qb_bill_id, bill_number, vendor_id, bill_date, total, balance_due, paid_at, bill_url, source, last_synced_at)
    values (nullif(p_qb_bill_id, ''), nullif(p_bill_number, ''), vid, p_bill_date, p_total, p_balance, paid, nullif(p_url, ''), 'quickbooks', now())
    returning id into bid;
  else
    update public.crm_vendor_bills set
      bill_number = coalesce(nullif(p_bill_number, ''), bill_number),
      vendor_id = vid, bill_date = p_bill_date, total = p_total, balance_due = p_balance,
      paid_at = paid, bill_url = coalesce(nullif(p_url, ''), bill_url),
      source = 'quickbooks', last_synced_at = now()
    where id = bid;
  end if;
  perform private.qb_touch();
  return jsonb_build_object('matched', true, 'bill_id', bid);
end;
$$;

revoke all on function public.crm_qb_upsert_customer(text, text) from public, anon, authenticated;
revoke all on function public.crm_qb_upsert_vendor(text, text) from public, anon, authenticated;
revoke all on function public.crm_qb_upsert_invoice(text, text, numeric, numeric, date) from public, anon, authenticated;
revoke all on function public.crm_qb_upsert_purchase_order(text, text, text, text, date, text, numeric, text, jsonb) from public, anon, authenticated;
revoke all on function public.crm_qb_upsert_bill(text, text, text, text, date, numeric, numeric, date, text) from public, anon, authenticated;
grant execute on function public.crm_qb_upsert_customer(text, text) to service_role;
grant execute on function public.crm_qb_upsert_vendor(text, text) to service_role;
grant execute on function public.crm_qb_upsert_invoice(text, text, numeric, numeric, date) to service_role;
grant execute on function public.crm_qb_upsert_purchase_order(text, text, text, text, date, text, numeric, text, jsonb) to service_role;
grant execute on function public.crm_qb_upsert_bill(text, text, text, text, date, numeric, numeric, date, text) to service_role;

-- RLS
alter table public.crm_order_payments enable row level security;
alter table public.crm_vendor_pos enable row level security;
alter table public.crm_vendor_po_lines enable row level security;
alter table public.crm_vendor_bills enable row level security;
alter table public.crm_qb_unmatched enable row level security;
alter table public.crm_qb_sync_state enable row level security;
alter table public.crm_commission_access enable row level security;
alter table public.crm_commission_rates enable row level security;
alter table public.crm_commission_setter_tiers enable row level security;
alter table public.crm_commission_marks enable row level security;
alter table public.crm_commission_adjustments enable row level security;
alter table public.crm_commission_bonus_rules enable row level security;

revoke all on table public.crm_order_payments from anon, public;
revoke all on table public.crm_vendor_pos from anon, public;
revoke all on table public.crm_vendor_po_lines from anon, public;
revoke all on table public.crm_vendor_bills from anon, public;
revoke all on table public.crm_qb_unmatched from anon, public;
revoke all on table public.crm_qb_sync_state from anon, public;
revoke all on table public.crm_commission_access from anon, public;
revoke all on table public.crm_commission_rates from anon, public;
revoke all on table public.crm_commission_setter_tiers from anon, public;
revoke all on table public.crm_commission_marks from anon, public;
revoke all on table public.crm_commission_adjustments from anon, public;
revoke all on table public.crm_commission_bonus_rules from anon, public;

grant select, insert, update, delete on public.crm_order_payments to authenticated;
grant select on public.crm_vendor_pos to authenticated;
grant select on public.crm_vendor_po_lines to authenticated;
grant select on public.crm_vendor_bills to authenticated;
grant select, update on public.crm_qb_unmatched to authenticated;
grant select on public.crm_qb_sync_state to authenticated;
grant select on public.crm_commission_access to authenticated;
grant select, insert, update, delete on public.crm_commission_rates to authenticated;
grant select, update on public.crm_commission_setter_tiers to authenticated;
grant select, insert, delete on public.crm_commission_marks to authenticated;
grant select, insert, delete on public.crm_commission_adjustments to authenticated;
grant select on public.crm_commission_bonus_rules to authenticated;

-- Full users may insert manual POs. Own-only select is denied by the policy below.
grant insert, update, delete on public.crm_vendor_pos to authenticated;
grant insert, update, delete on public.crm_vendor_po_lines to authenticated;
grant insert, update, delete on public.crm_vendor_bills to authenticated;

do $$
declare s text;
begin
  foreach s in array array[
    'crm_order_payments_id_seq','crm_vendor_pos_id_seq','crm_vendor_po_lines_id_seq','crm_vendor_bills_id_seq',
    'crm_qb_unmatched_id_seq','crm_commission_rates_id_seq','crm_commission_setter_tiers_id_seq',
    'crm_commission_marks_id_seq','crm_commission_adjustments_id_seq','crm_commission_bonus_rules_id_seq'
  ] loop
    if to_regclass('public.' || s) is not null then
      execute format('grant usage, select on sequence public.%I to authenticated', s);
    end if;
  end loop;
end $$;

drop policy if exists pay_read on public.crm_order_payments;
create policy pay_read on public.crm_order_payments for select to authenticated
  using ((select private.is_crm_team()));
drop policy if exists pay_write on public.crm_order_payments;
create policy pay_write on public.crm_order_payments for all to authenticated
  using ((select private.commission_role()) = 'full')
  with check ((select private.commission_role()) = 'full');

-- PO and bill rows, including costs, are full-view only.
drop policy if exists po_full on public.crm_vendor_pos;
create policy po_full on public.crm_vendor_pos for all to authenticated
  using ((select private.commission_role()) = 'full')
  with check ((select private.commission_role()) = 'full');
drop policy if exists pol_full on public.crm_vendor_po_lines;
create policy pol_full on public.crm_vendor_po_lines for all to authenticated
  using ((select private.commission_role()) = 'full')
  with check ((select private.commission_role()) = 'full');
drop policy if exists bill_full on public.crm_vendor_bills;
create policy bill_full on public.crm_vendor_bills for all to authenticated
  using ((select private.commission_role()) = 'full')
  with check ((select private.commission_role()) = 'full');

drop policy if exists un_full on public.crm_qb_unmatched;
create policy un_full on public.crm_qb_unmatched for select to authenticated
  using ((select private.commission_role()) = 'full');
drop policy if exists un_full_upd on public.crm_qb_unmatched;
create policy un_full_upd on public.crm_qb_unmatched for update to authenticated
  using ((select private.commission_role()) = 'full')
  with check ((select private.commission_role()) = 'full');

drop policy if exists sync_read on public.crm_qb_sync_state;
create policy sync_read on public.crm_qb_sync_state for select to authenticated
  using ((select private.is_crm_team()));

drop policy if exists acc_read on public.crm_commission_access;
create policy acc_read on public.crm_commission_access for select to authenticated
  using (
    (select private.commission_role()) = 'full'
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists rate_read on public.crm_commission_rates;
create policy rate_read on public.crm_commission_rates for select to authenticated
  using (
    (select private.commission_role()) = 'full'
    or lower(rep) = lower(coalesce((select private.commission_rep()), ''))
  );
drop policy if exists rate_write on public.crm_commission_rates;
create policy rate_write on public.crm_commission_rates for all to authenticated
  using ((select private.commission_role()) = 'full')
  with check ((select private.commission_role()) = 'full');

drop policy if exists tier_read on public.crm_commission_setter_tiers;
create policy tier_read on public.crm_commission_setter_tiers for select to authenticated
  using (
    (select private.commission_role()) = 'full'
    or exists (
      select 1 from public.crm_commission_rates r
      where r.plan = 'setter_tier'
        and lower(r.rep) = lower(coalesce((select private.commission_rep()), ''))
    )
  );
drop policy if exists tier_write on public.crm_commission_setter_tiers;
create policy tier_write on public.crm_commission_setter_tiers for update to authenticated
  using ((select private.commission_role()) = 'full')
  with check ((select private.commission_role()) = 'full');

drop policy if exists mark_read on public.crm_commission_marks;
create policy mark_read on public.crm_commission_marks for select to authenticated
  using (
    (select private.commission_role()) = 'full'
    or lower(rep) = lower(coalesce((select private.commission_rep()), ''))
  );
drop policy if exists mark_write on public.crm_commission_marks;
create policy mark_write on public.crm_commission_marks for insert to authenticated
  with check ((select private.commission_role()) = 'full');
drop policy if exists mark_del on public.crm_commission_marks;
create policy mark_del on public.crm_commission_marks for delete to authenticated
  using ((select private.commission_role()) = 'full');

drop policy if exists adj_read on public.crm_commission_adjustments;
create policy adj_read on public.crm_commission_adjustments for select to authenticated
  using (
    (select private.commission_role()) = 'full'
    or lower(rep) = lower(coalesce((select private.commission_rep()), ''))
  );
drop policy if exists adj_write on public.crm_commission_adjustments;
create policy adj_write on public.crm_commission_adjustments for insert to authenticated
  with check ((select private.commission_role()) = 'full');
drop policy if exists adj_del on public.crm_commission_adjustments;
create policy adj_del on public.crm_commission_adjustments for delete to authenticated
  using ((select private.commission_role()) = 'full');

drop policy if exists bonus_full on public.crm_commission_bonus_rules;
create policy bonus_full on public.crm_commission_bonus_rules for select to authenticated
  using ((select private.commission_role()) = 'full');
