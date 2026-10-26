-- Document check: the owner uploads a survey plan, Certificate of Occupancy or deed; Claude reads it and
-- Groundproof tests it for consistency (not authenticity, and not a title search).

create table public.property_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('survey_plan', 'c_of_o', 'deed', 'other')),
  file_path text not null check (file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|pdf)$'),
  status text not null default 'pending' check (status in ('pending', 'consistent', 'review', 'unreadable')),
  extracted jsonb,                                  -- what Claude read from the document
  findings jsonb,                                   -- [{ level: 'ok' | 'warn' | 'info', text }]
  plan_number_norm text,                            -- normalised plan number, to spot the same plan on two properties
  created_at timestamptz not null default now(),
  checked_at timestamptz
);
create index on public.property_documents (property_id, created_at desc);
create index on public.property_documents (plan_number_norm) where plan_number_norm is not null;
alter table public.property_documents enable row level security;

-- Owner only: documents are never visible to reporters or family viewers.
create policy "owner reads documents" on public.property_documents
  for select to authenticated using (public.is_owner(property_id));
create policy "owner adds documents" on public.property_documents
  for insert to authenticated with check (
    uploaded_by = auth.uid() and public.is_owner(property_id)
    and status = 'pending' and extracted is null and findings is null and plan_number_norm is null and checked_at is null
  );
create policy "owner removes documents" on public.property_documents
  for delete to authenticated using (public.is_owner(property_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-docs', 'property-docs', false, 5242880, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

-- Path convention: <property_id>/<document_id>.<jpg|png|pdf>
create policy "owner uploads documents" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'property-docs' and public.is_owner(((storage.foldername(name))[1])::uuid)
  );
create policy "owner views documents" on storage.objects
  for select to authenticated using (
    bucket_id = 'property-docs' and public.is_owner(((storage.foldername(name))[1])::uuid)
  );
create policy "owner deletes documents" on storage.objects
  for delete to authenticated using (
    bucket_id = 'property-docs' and public.is_owner(((storage.foldername(name))[1])::uuid)
  );
