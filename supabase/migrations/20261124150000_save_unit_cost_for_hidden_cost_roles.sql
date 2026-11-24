-- Let a cost role of own type a unit cost and have it stick.
-- private.commission_sees_cost() is true only for role full (Rich, Amber, Dan).
-- Annie (orders@), Patrick (logistics@), and Landon are role own, so it is false
-- for them. On every UPDATE, crm_deal_lines_keep_cost and crm_deals_keep_cost
-- copied OLD vendor cost and freight back. OLD was null, so a number they typed
-- was thrown away. Masked reads (crm_order_lines, crm_deals_safe) then looked blank.
-- The 16 Nov migration stopped a blank from erasing a cost already stored. It did
-- not stop this revert of a newly typed cost.
-- A typed number is now kept (write-only). A blank still keeps the stored number.
-- Rollup figures stay writeable only by refresh_deal_totals(), which sets crm.rollup.
-- Reading cost is unchanged and still limited to role full.
-- Where a numeric line cost is stripped on read, the line gains cost_set true so
-- the editor can show "Saved (hidden)". Incoming cost_set is ignored and recomputed.
-- This does not change any existing rows and does not repair lost costs.
-- keep_hidden_rfq_cost is unchanged.
-- GitHub Pages does not apply this file. Run it on purpose in Supabase project
-- igaylyhkssahczubiztb. That needs Rich's OK.

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
  raw jsonb;
  line jsonb;
begin
  if bag is null or jsonb_typeof(bag) <> 'object' then
    return bag;
  end if;
  if bag ? '_quote' and jsonb_typeof(bag -> '_quote') = 'object' then
    q := (bag -> '_quote') - 'freight';
    if jsonb_typeof(q -> 'lines') = 'array' then
      for i in 0 .. jsonb_array_length(q -> 'lines') - 1 loop
        raw := q -> 'lines' -> i;
        line := raw - 'cost' - 'freight' - 'cost_set';
        if jsonb_typeof(raw) = 'object'
           and coalesce(raw->>'cost', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then
          line := jsonb_set(line, '{cost_set}', 'true'::jsonb);
        end if;
        lines := lines || jsonb_build_array(line);
      end loop;
      q := jsonb_set(q, '{lines}', lines);
    end if;
    bag := jsonb_set(bag, '{_quote}', q);
  end if;
  if jsonb_typeof(bag -> '_order_lines') = 'array' then
    for i in 0 .. jsonb_array_length(bag -> '_order_lines') - 1 loop
      raw := bag -> '_order_lines' -> i;
      line := raw - 'cost' - 'freight' - 'cost_set';
      if jsonb_typeof(raw) = 'object'
         and coalesce(raw->>'cost', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then
        line := jsonb_set(line, '{cost_set}', 'true'::jsonb);
      end if;
      orders := orders || jsonb_build_array(line);
    end loop;
    bag := jsonb_set(bag, '{_order_lines}', orders);
  end if;
  return bag;
end;
$$;

revoke all on function private.strip_quote_cost(jsonb) from public, anon, authenticated;

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
  -- Role own may store a unit cost or freight they typed. A blank keeps the
  -- stored value. They still cannot read the number back.
  if tg_op = 'UPDATE' then
    new.vendor_price := coalesce(new.vendor_price, old.vendor_price);
    new.freight := coalesce(new.freight, old.freight);
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
    new.vendor_price_per_unit := coalesce(new.vendor_price_per_unit, old.vendor_price_per_unit);
    new.freight := coalesce(new.freight, old.freight);
    -- Only refresh_deal_totals() writes the rollup. Hidden roles keep the old figures.
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
