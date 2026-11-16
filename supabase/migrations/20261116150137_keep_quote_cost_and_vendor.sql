-- Stop a save from erasing a vendor cost or vendor already stored on a deal.
-- A blank field used to be written as null. That cleared crm_deal_lines.vendor_price
-- and crm_deals.vendor_price_per_unit, and it cleared vendor_id the same way.
-- This does not change any existing rows. Fill those back from the quote backup
-- with scripts/recover-crm-quote-cost.sql after review. Do not run that repair here.
-- GitHub Pages does not apply this file. Run it in the Supabase project on purpose.
-- Someone who cannot see cost still receives the quote with cost removed. Saving
-- that quote used to store the stripped copy and delete the backup. The save
-- below puts the previous cost and vendor back when the new copy is blank.

create or replace function private.preserve_line_money(old_lines jsonb, new_lines jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  i int;
  j int;
  n jsonb;
  o jsonb;
  cost text;
  vendor text;
begin
  if new_lines is null or jsonb_typeof(new_lines) <> 'array' then
    return case when jsonb_typeof(old_lines) = 'array' then old_lines else '[]'::jsonb end;
  end if;
  if old_lines is null or jsonb_typeof(old_lines) <> 'array' then
    return new_lines;
  end if;
  for i in 0 .. jsonb_array_length(new_lines) - 1 loop
    n := new_lines -> i;
    o := null;
    if coalesce(n->>'line_id', '') <> '' then
      for j in 0 .. jsonb_array_length(old_lines) - 1 loop
        if (old_lines -> j)->>'line_id' is not distinct from n->>'line_id' then
          o := old_lines -> j;
        end if;
      end loop;
    end if;
    if o is null and i < jsonb_array_length(old_lines) then
      o := old_lines -> i;
    end if;
    if o is not null then
      cost := n->>'cost';
      if cost is null or btrim(cost) = '' then
        if coalesce(o->>'cost', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then
          n := jsonb_set(n, '{cost}', o->'cost');
        end if;
      end if;
      vendor := n->>'vendor_id';
      if vendor is null or btrim(vendor) = '' then
        if coalesce(o->>'vendor_id', '') <> '' then
          n := jsonb_set(n, '{vendor_id}', o->'vendor_id');
        end if;
      end if;
      new_lines := jsonb_set(new_lines, array[i::text], n);
    end if;
  end loop;
  return new_lines;
end;
$$;

revoke all on function private.preserve_line_money(jsonb, jsonb) from public, anon, authenticated;

create or replace function private.keep_hidden_line_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.vendor_price is null and old.vendor_price is not null then
      new.vendor_price := old.vendor_price;
    end if;
    if new.vendor_id is null and old.vendor_id is not null then
      new.vendor_id := old.vendor_id;
    end if;
  end if;
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
  if tg_op = 'UPDATE' then
    if new.vendor_price_per_unit is null and old.vendor_price_per_unit is not null then
      new.vendor_price_per_unit := old.vendor_price_per_unit;
    end if;
    if new.vendor_id is null and old.vendor_id is not null then
      new.vendor_id := old.vendor_id;
    end if;
    if jsonb_typeof(old.custom) = 'object' and jsonb_typeof(new.custom) = 'object' then
      if jsonb_typeof(new.custom->'_quote'->'lines') = 'array'
         and jsonb_typeof(old.custom->'_quote'->'lines') = 'array' then
        new.custom := jsonb_set(
          new.custom,
          '{_quote,lines}',
          private.preserve_line_money(old.custom->'_quote'->'lines', new.custom->'_quote'->'lines')
        );
      end if;
      if jsonb_typeof(new.custom->'_order_lines') = 'array'
         and jsonb_typeof(old.custom->'_order_lines') = 'array' then
        new.custom := jsonb_set(
          new.custom,
          '{_order_lines}',
          private.preserve_line_money(old.custom->'_order_lines', new.custom->'_order_lines')
        );
      end if;
    end if;
  end if;
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

revoke all on function private.keep_hidden_line_cost() from public, anon;
revoke all on function private.keep_hidden_deal_cost() from public, anon;
grant execute on function private.keep_hidden_line_cost() to authenticated;
grant execute on function private.keep_hidden_deal_cost() to authenticated;
