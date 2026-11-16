-- Review only. This file does not change data when you run it.
-- The repair statements are inside a comment at the bottom. Do not paste
-- them into production until the SELECT results have been checked.
--
-- What happened
-- On 16 Nov 2026 the CRM was blanking vendor cost on quotes. The quote
-- editor saves every line on any edit. A blank unit cost was sent as null,
-- and a blank vendor was sent as null. The deal header did the same for
-- vendor_price_per_unit and vendor_id. Loading a deal copied a blank header
-- back onto the first line, so the next save erased the quote backup too.
-- A blank was also stored as 0 on some won-deal snapshots (_order_lines).
--
-- Where the numbers still are
-- crm_deals.custom -> '_quote' -> 'lines' still has cost and vendor_id for
-- the deals whose line column was cleared. Read on 16 Nov 2026:
--   19 deals, 19 lines, 12 quote headers.
--   6 deals / 7 lines have a quote cost and a null crm_deal_lines.vendor_price.
--   Deal 14 (Machine wrap, cost 34.50, vendor 151) has no line row left
--   (the quote still points at line id 28).
--   Vendors are still on the line for the other five deals. Deal 15 never
--   had a vendor in the quote.
--   Deals 3 and 19 are empty quotes. They are not part of this repair.
-- There is no deal audit or history table. Customer quote PDFs do not
-- include cost or vendor. Do not restore from custom._order_lines when
-- that cost is 0: deal 13's snapshot says 0 and the live cost is 2.87.
--
-- This script does not touch fin_config, dashboard_data, fin_weekly_log,
-- or fin_log_history.

-- Deals whose quote backup still has a cost the line column lost.
select d.id as deal_id,
       d.description,
       d.stage,
       d.vendor_id as header_vendor,
       d.vendor_price_per_unit as header_cost,
       l.id as line_id,
       l.vendor_id as line_vendor,
       l.vendor_price as line_cost,
       q.ord as quote_line,
       q.line->>'line_id' as quote_line_id,
       q.line->>'desc' as quote_desc,
       case
         when coalesce(q.line->>'cost', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
           then (q.line->>'cost')::numeric
         else null
       end as restore_cost,
       case
         when coalesce(q.line->>'vendor_id', '') ~ '^[0-9]+$'
           then (q.line->>'vendor_id')::bigint
         else null
       end as restore_vendor
from public.crm_deals d
cross join lateral jsonb_array_elements(coalesce(d.custom->'_quote'->'lines', '[]'::jsonb))
  with ordinality q(line, ord)
left join public.crm_deal_lines l
  on l.deal_id = d.id
 and l.id::text = q.line->>'line_id'
where (
    coalesce(q.line->>'cost', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
    and (l.id is null or l.vendor_price is null)
  )
  or (
    coalesce(q.line->>'vendor_id', '') ~ '^[0-9]+$'
    and l.id is not null
    and l.vendor_id is null
  )
order by d.id, q.ord;

-- How many deals and lines the repair would touch. Empty quotes are excluded.
select count(distinct d.id) as deals_with_backup_cost,
       count(*) filter (where l.id is not null and l.vendor_price is null) as lines_to_fill,
       count(*) filter (where l.id is null) as missing_line_rows
from public.crm_deals d
cross join lateral jsonb_array_elements(coalesce(d.custom->'_quote'->'lines', '[]'::jsonb))
  with ordinality q(line, ord)
left join public.crm_deal_lines l
  on l.deal_id = d.id
 and l.id::text = q.line->>'line_id'
where coalesce(q.line->>'cost', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
  and (l.id is null or l.vendor_price is null);

-- Snapshots that say 0 while the line still has a real cost. Do not use these.
select d.id as deal_id,
       d.vendor_price_per_unit as header_cost,
       o.ord,
       o.line->>'cost' as snapshot_cost,
       o.line->>'vendor_id' as snapshot_vendor
from public.crm_deals d
cross join lateral jsonb_array_elements(coalesce(d.custom->'_order_lines', '[]'::jsonb))
  with ordinality o(line, ord)
where coalesce(o.line->>'cost', '') in ('0', '0.0', '0.00')
   or (d.vendor_price_per_unit is not null and coalesce(o.line->>'cost', '') = '');

-- ===========================================================================
-- REPAIR. Commented out on purpose. Read the SELECT above first.
-- It only fills nulls. It does not overwrite a cost or vendor that is set.
-- Wrap it in a transaction and ROLLBACK if the row count looks wrong.
--
-- begin;
--
-- update public.crm_deal_lines l
--    set vendor_price = src.restore_cost,
--        updated_at = now()
--   from (
--     select l2.id as line_id,
--            (q.line->>'cost')::numeric as restore_cost
--       from public.crm_deals d
--       cross join lateral jsonb_array_elements(d.custom->'_quote'->'lines')
--         with ordinality q(line, ord)
--       join public.crm_deal_lines l2
--         on l2.deal_id = d.id
--        and l2.id::text = q.line->>'line_id'
--      where l2.vendor_price is null
--        and coalesce(q.line->>'cost', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
--   ) src
--  where l.id = src.line_id
--    and l.vendor_price is null;
--
-- update public.crm_deal_lines l
--    set vendor_id = src.restore_vendor,
--        updated_at = now()
--   from (
--     select l2.id as line_id,
--            (q.line->>'vendor_id')::bigint as restore_vendor
--       from public.crm_deals d
--       cross join lateral jsonb_array_elements(d.custom->'_quote'->'lines')
--         with ordinality q(line, ord)
--       join public.crm_deal_lines l2
--         on l2.deal_id = d.id
--        and l2.id::text = q.line->>'line_id'
--      where l2.vendor_id is null
--        and coalesce(q.line->>'vendor_id', '') ~ '^[0-9]+$'
--   ) src
--  where l.id = src.line_id
--    and l.vendor_id is null;
--
-- update public.crm_deals d
--    set vendor_price_per_unit = (d.custom->'_quote'->'lines'->0->>'cost')::numeric
--  where d.vendor_price_per_unit is null
--    and coalesce(d.custom->'_quote'->'lines'->0->>'cost', '') ~ '^-?[0-9]+(\.[0-9]+)?$';
--
-- update public.crm_deals d
--    set vendor_id = (d.custom->'_quote'->'lines'->0->>'vendor_id')::bigint
--  where d.vendor_id is null
--    and coalesce(d.custom->'_quote'->'lines'->0->>'vendor_id', '') ~ '^[0-9]+$';
--
-- -- Deal 14's line was deleted. Insert one row from the quote backup
-- -- only when that deal still has no lines.
-- insert into public.crm_deal_lines (
--   deal_id, position, description, quantity, unit, vendor_id, vendor_price,
--   sell_price, sales_rep, line_date, invoice_number, qb_item_id, category
-- )
-- select d.id,
--        q.ord - 1,
--        q.line->>'desc',
--        case when coalesce(q.line->>'qty', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
--             then (q.line->>'qty')::numeric else null end,
--        nullif(q.line->>'unit', ''),
--        case when coalesce(q.line->>'vendor_id', '') ~ '^[0-9]+$'
--             then (q.line->>'vendor_id')::bigint else null end,
--        (q.line->>'cost')::numeric,
--        case when coalesce(q.line->>'price', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
--             then (q.line->>'price')::numeric else null end,
--        nullif(q.line->>'sales_rep', ''),
--        case when coalesce(q.line->>'line_date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
--             then (q.line->>'line_date')::date else null end,
--        nullif(q.line->>'invoice_number', ''),
--        nullif(q.line->>'qb_item_id', ''),
--        nullif(q.line->>'category', '')
--   from public.crm_deals d
--   cross join lateral jsonb_array_elements(d.custom->'_quote'->'lines')
--     with ordinality q(line, ord)
--  where coalesce(q.line->>'cost', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
--    and not exists (
--      select 1 from public.crm_deal_lines existing where existing.deal_id = d.id
--    );
--
-- -- Check the counts, then either:
-- -- rollback;
-- -- or, only after review:
-- -- commit;
-- ===========================================================================
