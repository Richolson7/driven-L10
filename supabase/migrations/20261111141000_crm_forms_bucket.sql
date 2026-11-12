-- Private setup-packet files. Safe to re-run.
-- Run after 20261026160000 (private.is_crm_team exists).
-- The PDFs and the vendor NDA are uploaded to this bucket separately.
-- They are not in git. The W-9 contains the company EIN.
--
-- Live shape this records:
--   bucket crm-forms, private, 10 MB, PDF and .docx only
--   one SELECT policy, "crm forms team read", for authenticated team members

do $$
begin
  if to_regprocedure('private.is_crm_team()') is null then
    raise exception 'Apply 20261026160000_crm_missing_rules_and_user_prefs.sql first';
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'crm-forms',
  'crm-forms',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
on conflict (id) do nothing;

-- A broader read policy must not remain beside the team check.
drop policy if exists "crm forms authenticated read" on storage.objects;
drop policy if exists "crm forms team read" on storage.objects;

create policy "crm forms team read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'crm-forms'
  and (select private.is_crm_team())
);
