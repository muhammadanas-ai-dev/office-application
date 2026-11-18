-- Forma OCR (Phase C, Day 13): OCR jobs and per-page results.
--
-- A job is one OCR run on one document. The route enqueues a job;
-- the worker (ocr/worker.ts) claims it, renders the file's pages,
-- runs the project's own Tesseract binary per page, and stores the
-- text in document_ocr_results. The original file is never changed.
-- RLS follows the documents pattern: every row carries the
-- workspace_id of its document, and the app_private helpers decide
-- membership. The worker uses the service role key, which bypasses
-- RLS, so it can claim and update any job.

-- ocr_jobs
create table if not exists public.ocr_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed')),
  language text not null default 'eng'
    check (language in ('eng', 'urd', 'ara')),
  page_count int check (page_count is null or page_count >= 1),
  processed_pages int not null default 0 check (processed_pages >= 0),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

-- One active job per document: a document cannot have two OCR
-- runs at once. A new job is refused while one is pending/processing.
create unique index if not exists ocr_jobs_one_active_per_document
  on public.ocr_jobs (document_id)
  where status in ('pending', 'processing');

create index if not exists ocr_jobs_pending_idx
  on public.ocr_jobs (created_at)
  where status = 'pending';

create index if not exists ocr_jobs_document_idx
  on public.ocr_jobs (document_id, created_at desc);

-- document_ocr_results: one row per page, per job.
create table if not exists public.document_ocr_results (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id uuid not null references public.ocr_jobs(id) on delete cascade,
  page_number int not null check (page_number >= 1),
  text text not null default '',
  mean_confidence numeric(5, 2) check (mean_confidence is null or (mean_confidence >= 0 and mean_confidence <= 100)),
  language text not null default 'eng'
    check (language in ('eng', 'urd', 'ara')),
  created_at timestamptz not null default now(),
  unique (job_id, page_number)
);

create index if not exists document_ocr_results_document_idx
  on public.document_ocr_results (document_id, page_number);

-- RLS
alter table public.ocr_jobs enable row level security;
alter table public.document_ocr_results enable row level security;

-- ocr_jobs: readable by workspace members, enqueuable by editors
-- (the job must belong to a document in the same workspace),
-- updatable by editors, deletable only by owner/admin.
drop policy if exists "ocr jobs select member" on public.ocr_jobs;
create policy "ocr jobs select member" on public.ocr_jobs
  for select to authenticated
  using ((select app_private.is_workspace_member(workspace_id)));

drop policy if exists "ocr jobs insert editor" on public.ocr_jobs;
create policy "ocr jobs insert editor" on public.ocr_jobs
  for insert to authenticated
  with check (
    (select app_private.is_workspace_member(workspace_id))
    and (select app_private.workspace_role(workspace_id))
      in ('owner', 'admin', 'editor')
    and exists (
      select 1 from public.documents d
      where d.id = document_id and d.workspace_id = workspace_id
    )
  );

drop policy if exists "ocr jobs update editor" on public.ocr_jobs;
create policy "ocr jobs update editor" on public.ocr_jobs
  for update to authenticated
  using (
    (select app_private.is_workspace_member(workspace_id))
    and (select app_private.workspace_role(workspace_id))
      in ('owner', 'admin', 'editor')
  )
  with check (
    (select app_private.is_workspace_member(workspace_id))
    and (select app_private.workspace_role(workspace_id))
      in ('owner', 'admin', 'editor')
  );

drop policy if exists "ocr jobs delete owner admin" on public.ocr_jobs;
create policy "ocr jobs delete owner admin" on public.ocr_jobs
  for delete to authenticated
  using (
    (select app_private.is_workspace_member(workspace_id))
    and (select app_private.workspace_role(workspace_id))
      in ('owner', 'admin')
  );

-- document_ocr_results: readable by workspace members, writable by
-- editors (the worker writes through the service role, which
-- bypasses RLS; the policy exists so the shape matches the other
-- per-document tables), deletable only by owner/admin.
drop policy if exists "ocr results select member" on public.document_ocr_results;
create policy "ocr results select member" on public.document_ocr_results
  for select to authenticated
  using ((select app_private.is_workspace_member(workspace_id)));

drop policy if exists "ocr results insert editor" on public.document_ocr_results;
create policy "ocr results insert editor" on public.document_ocr_results
  for insert to authenticated
  with check (
    (select app_private.is_workspace_member(workspace_id))
    and (select app_private.workspace_role(workspace_id))
      in ('owner', 'admin', 'editor')
    and exists (
      select 1 from public.documents d
      where d.id = document_id and d.workspace_id = workspace_id
    )
  );

drop policy if exists "ocr results delete owner admin" on public.document_ocr_results;
create policy "ocr results delete owner admin" on public.document_ocr_results
  for delete to authenticated
  using (
    (select app_private.is_workspace_member(workspace_id))
    and (select app_private.workspace_role(workspace_id))
      in ('owner', 'admin')
  );

-- ------------------------------------------------------------------
-- Grants (least privilege: app roles only)
-- ------------------------------------------------------------------
grant select, insert, update, delete
  on public.ocr_jobs, public.document_ocr_results
  to authenticated;
revoke all
  on public.ocr_jobs, public.document_ocr_results
  from anon;
