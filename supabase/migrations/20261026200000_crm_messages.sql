-- Provider status for email and SMS. NOT applied.
-- This pull request does not send email or SMS and does not connect a provider.
-- The message-status function only records a webhook after Rich picks a provider and turns it on.

create table if not exists public.crm_messages (
  id bigint generated always as identity primary key,
  deal_id bigint references public.crm_deals (id) on delete cascade,
  company_id bigint references public.crm_companies (id) on delete cascade,
  channel text not null,
  direction text not null default 'outbound',
  to_address text,
  subject text,
  body text,
  status text not null default 'queued',
  status_at timestamptz,
  provider text,
  provider_message_id text,
  detail text,
  created_at timestamptz not null default now(),
  constraint crm_messages_channel_check check (channel = any (array['email'::text, 'sms'::text])),
  constraint crm_messages_direction_check check (direction = any (array['outbound'::text, 'inbound'::text])),
  constraint crm_messages_status_check check (status = any (array[
    'queued'::text, 'sent'::text, 'delivered'::text, 'opened'::text, 'read'::text, 'failed'::text
  ]))
);

create index if not exists crm_messages_deal_idx on public.crm_messages (deal_id, created_at desc);
create index if not exists crm_messages_company_idx on public.crm_messages (company_id, created_at desc);
create unique index if not exists crm_messages_provider_uidx
  on public.crm_messages (provider, provider_message_id)
  where provider is not null and provider_message_id is not null;

comment on table public.crm_messages is
  'Delivery and read status reported by a provider. The CRM does not send these messages.';

alter table public.crm_messages enable row level security;

revoke all on table public.crm_messages from anon, public;
grant select, insert, update, delete on table public.crm_messages to authenticated;
grant usage, select on sequence public.crm_messages_id_seq to authenticated;

drop policy if exists crm_team_all on public.crm_messages;
create policy crm_team_all on public.crm_messages
  for all to authenticated
  using ((select private.is_crm_team()))
  with check ((select private.is_crm_team()));
