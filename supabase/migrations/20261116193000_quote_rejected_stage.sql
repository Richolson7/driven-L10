-- Expired / Rejected, the stage after Quote Sent.
-- NOT applied by the CRM. GitHub Pages does not run this file.
-- Run it in the Supabase project on purpose, after review.
--
-- crm_deals.stage references crm_stages.key, so a deal cannot be saved
-- into quote_rejected until this row exists. The CRM still shows the
-- column before that, and it does not move any deals until the row is there.
-- This file does not update any existing deals.

update public.crm_stages
set position = position + 1
where position > (select position from public.crm_stages where key = 'quote_sent')
  and not exists (select 1 from public.crm_stages where key = 'quote_rejected');

insert into public.crm_stages (key, name, position, team, required_fields, active)
select 'quote_rejected', 'Expired / Rejected', s.position + 1, 'sales', '{}'::text[], true
from public.crm_stages s
where s.key = 'quote_sent'
  and not exists (select 1 from public.crm_stages where key = 'quote_rejected');

insert into public.crm_stages (key, name, position, team, required_fields, active)
select 'quote_rejected', 'Expired / Rejected', coalesce((select max(position) + 1 from public.crm_stages), 1), 'sales', '{}'::text[], true
where not exists (select 1 from public.crm_stages where key = 'quote_sent')
  and not exists (select 1 from public.crm_stages where key = 'quote_rejected');
