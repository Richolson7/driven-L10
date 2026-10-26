-- QuickBooks ids stored back on the deal. NOT applied. Nothing here calls QuickBooks.
-- qbo_doc_type is Estimate unless Rich chooses Invoice. QuickBooks Online has no Sales Orders.
-- The edge function qbo-sync-order stays off and in dry-run until Rich connects an Intuit app.

alter table public.crm_deals add column if not exists qbo_customer_id text;
alter table public.crm_deals add column if not exists qbo_doc_id text;
alter table public.crm_deals add column if not exists qbo_doc_type text;
alter table public.crm_deals add column if not exists qbo_synced_at timestamptz;

alter table public.crm_deals drop constraint if exists crm_deals_qbo_doc_type_check;
alter table public.crm_deals add constraint crm_deals_qbo_doc_type_check
  check (qbo_doc_type is null or qbo_doc_type = any (array['Estimate'::text, 'Invoice'::text]));

comment on column public.crm_deals.qbo_customer_id is 'QuickBooks Customer.Id after a name match. Empty until sync is approved.';
comment on column public.crm_deals.qbo_doc_id is 'QuickBooks Estimate or Invoice Id. Empty until sync is approved.';
comment on column public.crm_deals.qbo_doc_type is 'Estimate by default. Invoice if Rich chooses that instead. Not a Sales Order.';
