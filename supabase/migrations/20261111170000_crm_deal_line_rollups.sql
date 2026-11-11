-- Several products on one deal. NOT applied to the live project.
-- Run after 20261109190200_crm_commissions_payments_qb.sql (crm_deals_safe, commission view, private.commission_sees_cost).
-- crm_deal_lines already holds one row per product. This file:
--   * stores the deal's rolled-up sale, cost, gross margin, and margin percent
--   * copies an older one-product deal (price and quantity on crm_deals, no lines)
--     into a single line so nothing is dropped
--   * keeps commission and the margin dashboards on those lines, with the deal
--     header used only when a won deal still has no lines
-- QuickBooks invoice margin stays on crm_v_order_margin (matched by deal_id).
-- This file does not call QuickBooks and does not replace that view.
-- Team-only RLS already covers crm_deals and crm_deal_lines (private.is_crm_team()).
-- No new table. anon gets nothing. Cost rollup columns are masked like vendor cost.

alter table public.crm_deals
  add column if not exists line_value numeric,
  add column if not exists line_cost numeric,
  add column if not exists gross_margin numeric,
  add column if not exists margin_pct numeric;

comment on column public.crm_deals.line_value is
  'Sum of line sell (quantity × sell price). Kept in step with crm_deal_lines.';
comment on column public.crm_deals.line_cost is
  'Sum of line cost (quantity × vendor price) plus freight once. Blank unit cost counts as 0, same as the pipeline card.';
comment on column public.crm_deals.gross_margin is
  'line_value minus line_cost, in dollars.';
comment on column public.crm_deals.margin_pct is
  'gross_margin / line_value. Null when the sale is 0. 0.25 means 25%.';

-- Setters can see the sale total. Cost, margin dollars, and margin percent stay masked.
revoke select (line_cost, gross_margin, margin_pct) on public.crm_deals from authenticated, anon, public;

create or replace function private.keep_hidden_deal_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The rollup trigger is the one writing these. A setter's own update must not wipe them.
  if current_setting('crm.rollup', true) = '1' then
    return new;
  end if;
  if private.commission_sees_cost() then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.vendor_price_per_unit := old.vendor_price_per_unit;
    new.freight := old.freight;
    new.line_cost := old.line_cost;
    new.gross_margin := old.gross_margin;
    new.margin_pct := old.margin_pct;
  end if;
  return new;
end;
$$;

revoke all on function private.keep_hidden_deal_cost() from public, anon;
grant execute on function private.keep_hidden_deal_cost() to authenticated;

drop view if exists public.crm_deals_safe;
create view public.crm_deals_safe
with (security_invoker = false) as
select (jsonb_populate_record(null::public.crm_deals, masked.j)).*
from (
  select case
    when private.commission_sees_cost() then to_jsonb(d)
    else to_jsonb(d) || jsonb_build_object(
      'vendor_price_per_unit', null,
      'freight', null,
      'line_cost', null,
      'gross_margin', null,
      'margin_pct', null,
      'custom', private.strip_quote_cost(d.custom)
    )
  end as j
  from public.crm_deals d
  where private.is_crm_team()
) masked;

grant select on public.crm_deals_safe to authenticated;
revoke all on public.crm_deals_safe from anon, public;

create or replace function private.refresh_deal_totals(did bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sell numeric := 0;
  v_cost numeric := 0;
  v_lines integer := 0;
  v_freight numeric := 0;
  v_deal_freight numeric;
  v_price numeric;
  v_qty numeric;
  v_vendor numeric;
  v_vqty numeric;
  v_gm numeric;
  v_pct numeric;
  r record;
begin
  select freight, price_per_unit, quantity, vendor_price_per_unit, vendor_quantity
    into v_deal_freight, v_price, v_qty, v_vendor, v_vqty
  from public.crm_deals
  where id = did;
  if not found then
    return;
  end if;

  for r in
    select quantity, vendor_price, sell_price
    from public.crm_deal_lines
    where deal_id = did
  loop
    v_lines := v_lines + 1;
    if r.quantity is not null then
      v_sell := v_sell + round(coalesce(r.sell_price, 0) * r.quantity, 2);
      v_cost := v_cost + round(coalesce(r.vendor_price, 0) * r.quantity, 2);
    end if;
  end loop;

  if v_lines = 0 then
    if v_qty is not null then
      v_sell := round(coalesce(v_price, 0) * v_qty, 2);
    end if;
    if coalesce(v_vqty, v_qty) is not null then
      v_cost := round(coalesce(v_vendor, 0) * coalesce(v_vqty, v_qty), 2);
    end if;
  end if;

  if v_deal_freight is not null then
    v_freight := v_deal_freight;
  else
    select coalesce(sum(freight), 0)
      into v_freight
    from public.crm_deal_lines
    where deal_id = did
      and freight is not null;
  end if;

  v_sell := round(coalesce(v_sell, 0), 2);
  v_cost := round(coalesce(v_cost, 0) + coalesce(v_freight, 0), 2);
  v_gm := round(v_sell - v_cost, 2);
  v_pct := case when v_sell = 0 then null else round(v_gm / v_sell, 6) end;

  perform set_config('crm.rollup', '1', true);
  update public.crm_deals
     set line_value = v_sell,
         line_cost = v_cost,
         gross_margin = v_gm,
         margin_pct = v_pct
   where id = did;
end;
$$;

create or replace function private.refresh_deal_totals_from_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_deal_totals(coalesce(new.deal_id, old.deal_id));
  return null;
end;
$$;

create or replace function private.refresh_deal_totals_from_deal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('crm.rollup', true) = '1' then
    return null;
  end if;
  perform private.refresh_deal_totals(new.id);
  return null;
end;
$$;

revoke all on function private.refresh_deal_totals(bigint) from public, anon, authenticated;
revoke all on function private.refresh_deal_totals_from_line() from public, anon;
revoke all on function private.refresh_deal_totals_from_deal() from public, anon;
grant execute on function private.refresh_deal_totals_from_line() to authenticated;
grant execute on function private.refresh_deal_totals_from_deal() to authenticated;

drop trigger if exists crm_deal_lines_rollup on public.crm_deal_lines;
create trigger crm_deal_lines_rollup
  after insert or update or delete on public.crm_deal_lines
  for each row execute function private.refresh_deal_totals_from_line();

drop trigger if exists crm_deals_rollup on public.crm_deals;
create trigger crm_deals_rollup
  after update of price_per_unit, quantity, vendor_price_per_unit, vendor_quantity, freight
  on public.crm_deals
  for each row execute function private.refresh_deal_totals_from_deal();

-- One line for each deal that still has its price only on the header.
insert into public.crm_deal_lines (
  deal_id, position, description, quantity, unit, vendor_id, vendor_price, sell_price, freight, sales_rep, line_date
)
select d.id, 0, d.description, d.quantity, 'each', d.vendor_id, d.vendor_price_per_unit, d.price_per_unit,
       d.freight, nullif(d.sales_rep, ''), coalesce(d.quote_sent_date, d.created_at::date)
from public.crm_deals d
where not exists (select 1 from public.crm_deal_lines l where l.deal_id = d.id)
  and (d.price_per_unit is not null or d.vendor_price_per_unit is not null or d.quantity is not null);

do $$
declare r record;
begin
  for r in select id from public.crm_deals loop
    perform private.refresh_deal_totals(r.id);
  end loop;
end $$;

-- Commission reads every line. A won deal with no lines yet still uses its header
-- so the old single-product orders are not dropped. Freight on the deal is included
-- when no line has its own freight, so it is not added twice.
create or replace view public.crm_commission_lines
with (security_invoker = false) as
with won as (
  select d.id, d.company_id, d.sales_rep, d.description, d.customer_po_number,
         d.stage, d.est_ship_date, d.est_delivery_date,
         d.price_per_unit, d.quantity, d.vendor_price_per_unit, d.vendor_quantity, d.freight,
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
lines as (
  select l.deal_id,
    sum(case when l.sell_price is null or l.quantity is null then null else round(l.sell_price * l.quantity, 2) end) as invoice_amount,
    sum(case when l.vendor_price is null or l.quantity is null then null else round(l.vendor_price * l.quantity, 2) end) as vendor_cost,
    sum(case
          when l.sell_price is null or l.quantity is null then null
          when l.vendor_price is null or l.quantity is null then null
          else round(round(l.sell_price * l.quantity, 2) - (round(l.vendor_price * l.quantity, 2) + coalesce(l.freight, 0)), 2)
        end) as gross_margin,
    bool_or(l.freight is not null) as any_freight,
    min(l.invoice_number) filter (where coalesce(l.invoice_number, '') <> '') as invoice_number,
    (array_agg(l.sales_rep order by l.position) filter (where coalesce(btrim(l.sales_rep), '') <> ''))[1] as line_rep
  from public.crm_deal_lines l
  group by l.deal_id
),
money as (
  select d.id as deal_id,
    case
      when lc.deal_id is not null then lc.invoice_amount
      when d.price_per_unit is null or d.quantity is null then null
      else round(d.price_per_unit * d.quantity, 2)
    end as invoice_amount,
    case
      when lc.deal_id is not null then lc.vendor_cost
      when d.vendor_price_per_unit is null or coalesce(d.vendor_quantity, d.quantity) is null then null
      else round(d.vendor_price_per_unit * coalesce(d.vendor_quantity, d.quantity), 2)
    end as vendor_cost,
    case
      when lc.deal_id is not null and lc.gross_margin is not null then
        round(lc.gross_margin - case when lc.any_freight then 0 else coalesce(d.freight, 0) end, 2)
      when lc.deal_id is not null then null
      when d.price_per_unit is null or d.quantity is null or d.vendor_price_per_unit is null then null
      else round(
        round(d.price_per_unit * d.quantity, 2)
        - (round(d.vendor_price_per_unit * coalesce(d.vendor_quantity, d.quantity), 2) + coalesce(d.freight, 0)),
        2)
    end as gross_margin,
    lc.invoice_number,
    lc.line_rep
  from public.crm_deals d
  left join lines lc on lc.deal_id = d.id
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
  'One commission row per won order and plan. Sale and gross margin sum crm_deal_lines. A deal with no lines uses its header price and quantity. A line with no vendor price does not invent a cost. Payable only when the invoice is paid in full.';
