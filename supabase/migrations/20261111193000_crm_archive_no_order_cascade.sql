-- File only. Do not apply from the app.
-- A duplicate customer or vendor is archived or merged in the CRM.
-- This stops a company delete from removing deals, portal orders, or invoices.
-- Until this is applied, the app writes custom._archived and refuses to delete
-- a company that still has deals, contacts, orders, invoices, or a portal account.

alter table public.crm_companies
  add column if not exists archived_at timestamptz;

alter table public.crm_quotes
  add column if not exists archived_at timestamptz;

comment on column public.crm_companies.archived_at is
  'Set when staff archive a duplicate. Hidden from lists. Orders and invoices stay.';

alter table public.crm_deals drop constraint if exists crm_deals_company_id_fkey;
alter table public.crm_deals
  add constraint crm_deals_company_id_fkey
  foreign key (company_id) references public.crm_companies (id) on delete restrict;

alter table public.vmi_orders drop constraint if exists vmi_orders_company_id_fkey;
alter table public.vmi_orders
  add constraint vmi_orders_company_id_fkey
  foreign key (company_id) references public.crm_companies (id) on delete restrict;

alter table public.crm_qb_invoices drop constraint if exists crm_qb_invoices_company_id_fkey;
alter table public.crm_qb_invoices
  add constraint crm_qb_invoices_company_id_fkey
  foreign key (company_id) references public.crm_companies (id) on delete restrict;
