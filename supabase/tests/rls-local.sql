-- Local RLS verification for the Day 3–5 migrations.
--
-- Run AFTER setup-auth-mock.sql and the migrations, as the postgres
-- superuser, via scripts/verify-rls-local.sh. Every check raises an
-- exception on failure, so psql -v ON_ERROR_STOP=1 fails the run.
--
-- Test users:
--   A = 11111111-1111-1111-1111-111111111111 (workspace owner)
--   B = 22222222-2222-2222-2222-222222222222 (outsider, later editor)
--   C = 33333333-3333-3333-3333-333333333333 (outsider)

begin;

-- Setup rows (as table owner, bypassing RLS, like the admin client).
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'User A'),
  ('22222222-2222-2222-2222-222222222222', 'User B'),
  ('33333333-3333-3333-3333-333333333333', 'User C')
on conflict (id) do nothing;

insert into public.workspaces (id, name, owner_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A workspace', '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

insert into public.workspace_members (workspace_id, user_id, role, status) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner', 'active')
on conflict (workspace_id, user_id) do nothing;

-- Day 4 setup rows (A's library).
insert into public.folders (id, workspace_id, name, created_by) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Reports', '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

insert into public.documents (id, workspace_id, folder_id, title, file_path, mime_type, size_bytes, version, created_by) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Q3 Report', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/cccccccc-cccc-cccc-cccc-cccccccccccc/v1/q3-report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1234, 1, '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

insert into public.document_versions (id, document_id, workspace_id, version_number, file_path, mime_type, size_bytes, created_by) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/cccccccc-cccc-cccc-cccc-cccccccccccc/v1/q3-report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1234, '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

insert into storage.objects (id, bucket_id, name, owner) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'documents', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/cccccccc-cccc-cccc-cccc-cccccccccccc/v1/q3-report.docx', '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

insert into public.document_stars (document_id, user_id) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111')
on conflict (document_id, user_id) do nothing;

-- Day 5 setup row: an editor session for A's document.
insert into public.editor_sessions (key, document_id, workspace_id, user_id, version, expires_at) values
  ('aaaaaaaaaaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 1, now() + interval '1 hour')
on conflict (key) do nothing;

commit;

-- All checks below run as the `authenticated` role, like a signed-in
-- app user. RLS applies to this role (it is not a superuser).
set role authenticated;

-- T1: A reads their own profile, but not B's.
set app.current_user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  own_count int;
  other_count int;
begin
  select count(*) into own_count from public.profiles
    where id = '11111111-1111-1111-1111-111111111111';
  select count(*) into other_count from public.profiles
    where id = '22222222-2222-2222-2222-222222222222';
  if own_count <> 1 then
    raise exception 'T1 FAILED: owner cannot read own profile (% rows)', own_count;
  end if;
  if other_count <> 0 then
    raise exception 'T1 FAILED: user can read another profile (% rows)', other_count;
  end if;
  raise notice 'T1 passed: own profile visible, other profile hidden';
end $$;

-- T2: A reads their workspace; B cannot see it at all.
set app.current_user_id = '22222222-2222-2222-2222-222222222222';
do $$
declare
  visible int;
begin
  select count(*) into visible from public.workspaces
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if visible <> 0 then
    raise exception 'T2 FAILED: outsider can see another workspace (% rows)', visible;
  end if;
  raise notice 'T2 passed: outsider cannot see another workspace';
end $$;

-- T3: B cannot insert a member into A's workspace (RLS violation).
set app.current_user_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  insert into public.workspace_members (workspace_id, user_id, role, status)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'viewer', 'active');
  raise exception 'T3 FAILED: cross-workspace member insert was allowed';
exception
  when insufficient_privilege then
    raise notice 'T3 passed: cross-workspace member insert denied';
end $$;

-- T4: B cannot update A's workspace (0 rows, silent denial).
set app.current_user_id = '22222222-2222-2222-2222-222222222222';
do $$
declare
  changed int;
begin
  update public.workspaces set name = 'Hijacked'
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'T4 FAILED: outsider updated another workspace (% rows)', changed;
  end if;
  raise notice 'T4 passed: outsider cannot update another workspace';
end $$;

-- T5: B cannot delete A's owner membership row (0 rows).
set app.current_user_id = '22222222-2222-2222-2222-222222222222';
do $$
declare
  removed int;
begin
  delete from public.workspace_members
    where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and user_id = '11111111-1111-1111-1111-111111111111';
  get diagnostics removed = row_count;
  if removed <> 0 then
    raise exception 'T5 FAILED: outsider deleted a membership (% rows)', removed;
  end if;
  raise notice 'T5 passed: outsider cannot delete another membership';
end $$;

-- T6 (positive control): A, as owner, CAN add B as editor.
set app.current_user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  insert into public.workspace_members (workspace_id, user_id, role, status)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'editor', 'active');
  raise notice 'T6 passed: owner can add a member';
exception
  when others then
    raise exception 'T6 FAILED: owner could not add a member: %', sqlerrm;
end $$;

-- T7: B, now an editor member, can read the workspace but cannot add C.
set app.current_user_id = '22222222-2222-2222-2222-222222222222';
do $$
declare
  visible int;
begin
  select count(*) into visible from public.workspaces
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if visible <> 1 then
    raise exception 'T7 FAILED: editor member cannot see the workspace (% rows)', visible;
  end if;
  raise notice 'T7a passed: editor member can see the workspace';
end $$;
do $$
begin
  insert into public.workspace_members (workspace_id, user_id, role, status)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'viewer', 'active');
  raise exception 'T7 FAILED: editor was allowed to add a member';
exception
  when insufficient_privilege then
    raise notice 'T7b passed: editor cannot add a member';
end $$;

-- T8: B cannot update A's profile (0 rows, silent denial).
set app.current_user_id = '22222222-2222-2222-2222-222222222222';
do $$
declare
  changed int;
begin
  update public.profiles set display_name = 'Hijacked'
    where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'T8 FAILED: outsider updated another profile (% rows)', changed;
  end if;
  raise notice 'T8 passed: outsider cannot update another profile';
end $$;

-- T9: the helper answers only about the caller (auth.uid() is
-- checked inside its body), and anonymous users cannot call it at
-- all. (Authenticated users keep EXECUTE on purpose: RLS policies
-- evaluate the helpers as the querying user, so revoking it breaks
-- the policies — see T2. The Data API cannot reach app_private.)
-- Note: user B became an editor member in T6, so the outsider here
-- is user C, who was never added.
set app.current_user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  result boolean;
begin
  select app_private.is_workspace_member('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    into result;
  if result then
    raise exception 'T9 FAILED: helper says an outsider is a member';
  end if;
  raise notice 'T9a passed: helper reports outsider as non-member';
end $$;
set app.current_user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  result boolean;
begin
  select app_private.is_workspace_member('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    into result;
  if not result then
    raise exception 'T9 FAILED: helper says the owner is not a member';
  end if;
  raise notice 'T9b passed: helper reports owner as member';
end $$;
set role anon;
do $$
declare
  result boolean;
begin
  select app_private.is_workspace_member('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    into result;
  raise exception 'T9 FAILED: anon can call the helper (returned %)', result;
exception
  when insufficient_privilege then
    raise notice 'T9c passed: anon cannot call the helper';
end $$;
set role authenticated;

-- T10: A cannot delete their own owner membership row (last-owner guard).
set app.current_user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  removed int;
begin
  delete from public.workspace_members
    where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and user_id = '11111111-1111-1111-1111-111111111111';
  get diagnostics removed = row_count;
  if removed <> 0 then
    raise exception 'T10 FAILED: owner deleted their own owner row (% rows)', removed;
  end if;
  raise notice 'T10 passed: owner cannot delete their own owner row';
end $$;

-- T11: C cannot see A's folder or document; A can.
set app.current_user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  folder_count int;
  doc_count int;
begin
  select count(*) into folder_count from public.folders
    where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  select count(*) into doc_count from public.documents
    where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  if folder_count <> 0 or doc_count <> 0 then
    raise exception 'T11 FAILED: outsider sees another workspace library (folders %, docs %)', folder_count, doc_count;
  end if;
  raise notice 'T11 passed: outsider cannot see another workspace library';
end $$;
set app.current_user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  doc_count int;
begin
  select count(*) into doc_count from public.documents
    where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  if doc_count <> 1 then
    raise exception 'T11 FAILED: owner cannot see own document (% rows)', doc_count;
  end if;
  raise notice 'T11b passed: owner can see own document';
end $$;

-- T12: C cannot insert a document into A's workspace.
set app.current_user_id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  insert into public.documents (workspace_id, title)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Hijacked doc');
  raise exception 'T12 FAILED: cross-workspace document insert was allowed';
exception
  when insufficient_privilege then
    raise notice 'T12 passed: cross-workspace document insert denied';
end $$;

-- T13: B (editor) CAN create a folder in A's workspace; C cannot.
set app.current_user_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  insert into public.folders (workspace_id, name, created_by)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Editor folder', '22222222-2222-2222-2222-222222222222');
  raise notice 'T13a passed: editor can create a folder';
exception
  when others then
    raise exception 'T13 FAILED: editor could not create a folder: %', sqlerrm;
end $$;
set app.current_user_id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  insert into public.folders (workspace_id, name, created_by)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Outsider folder', '33333333-3333-3333-3333-333333333333');
  raise exception 'T13 FAILED: outsider was allowed to create a folder';
exception
  when insufficient_privilege then
    raise notice 'T13b passed: outsider cannot create a folder';
end $$;

-- T14: C cannot add a version to A's document; B (editor) can.
set app.current_user_id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  insert into public.document_versions (document_id, workspace_id, version_number, file_path)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/cccccccc-cccc-cccc-cccc-cccccccccccc/v2/q3-report.docx');
  raise exception 'T14 FAILED: outsider was allowed to add a version';
exception
  when insufficient_privilege then
    raise notice 'T14a passed: outsider cannot add a version';
end $$;
set app.current_user_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  insert into public.document_versions (document_id, workspace_id, version_number, file_path)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/cccccccc-cccc-cccc-cccc-cccccccccccc/v2/q3-report.docx');
  raise notice 'T14b passed: editor can add a version';
exception
  when others then
    raise exception 'T14 FAILED: editor could not add a version: %', sqlerrm;
end $$;

-- T15: storage objects — C cannot read A's file, A can, anon cannot.
set app.current_user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  obj_count int;
begin
  select count(*) into obj_count from storage.objects
    where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  if obj_count <> 0 then
    raise exception 'T15 FAILED: outsider can read another workspace file (% rows)', obj_count;
  end if;
  raise notice 'T15a passed: outsider cannot read another workspace file';
end $$;
set app.current_user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  obj_count int;
begin
  select count(*) into obj_count from storage.objects
    where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  if obj_count <> 1 then
    raise exception 'T15 FAILED: owner cannot read own file (% rows)', obj_count;
  end if;
  raise notice 'T15b passed: owner can read own file';
end $$;
set role anon;
do $$
declare
  obj_count int;
begin
  select count(*) into obj_count from storage.objects
    where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  raise exception 'T15 FAILED: anon can read a private file (% rows)', obj_count;
exception
  when insufficient_privilege then
    raise notice 'T15c passed: anon cannot read a private file';
end $$;
set role authenticated;

-- T16: C cannot star A's document; B (editor member) can.
set app.current_user_id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  insert into public.document_stars (document_id, user_id)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc', '33333333-3333-3333-3333-333333333333');
  raise exception 'T16 FAILED: outsider was allowed to star a document';
exception
  when insufficient_privilege then
    raise notice 'T16a passed: outsider cannot star a document';
end $$;
set app.current_user_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  insert into public.document_stars (document_id, user_id)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222');
  raise notice 'T16b passed: member can star a document';
exception
  when others then
    raise exception 'T16 FAILED: member could not star a document: %', sqlerrm;
end $$;

-- T17: is_personal backfill + one-personal-workspace rule.
set app.current_user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  is_personal boolean;
begin
  select w.is_personal into is_personal from public.workspaces w
    where w.id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if is_personal is not true then
    raise exception 'T17 FAILED: owner earliest workspace is not marked personal';
  end if;
  raise notice 'T17a passed: earliest workspace marked personal';
end $$;
do $$
begin
  insert into public.workspaces (name, owner_id, is_personal)
    values ('Second personal', '11111111-1111-1111-1111-111111111111', true);
  raise exception 'T17 FAILED: second personal workspace was allowed';
exception
  when unique_violation then
    raise notice 'T17b passed: second personal workspace rejected';
end $$;

-- T18: editor_sessions is invisible to app roles (RLS enabled with
-- no policies AND all privileges revoked — only the admin client
-- reads/writes it). A read attempt errors with
-- insufficient_privilege rather than returning rows.
set app.current_user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  perform count(*) from public.editor_sessions;
  raise exception 'T18 FAILED: authenticated user could read editor sessions';
exception
  when insufficient_privilege then
    raise notice 'T18a passed: editor sessions unreadable by authenticated users';
end $$;
do $$
begin
  insert into public.editor_sessions (key, document_id, workspace_id, user_id, version, expires_at)
    values ('bbbbbbbbbbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 1, now() + interval '1 hour');
  raise exception 'T18 FAILED: authenticated user could insert an editor session';
exception
  when insufficient_privilege then
    raise notice 'T18b passed: editor session insert denied for authenticated users';
end $$;

-- T19: OCR jobs and results (Day 13) — outsider C cannot enqueue
-- a job or read results for A's document; editor B can enqueue;
-- a second active job for the same document is refused by the
-- unique index; outsider C cannot insert a result.
set app.current_user_id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  insert into public.ocr_jobs (document_id, workspace_id, user_id, language)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'eng');
  raise exception 'T19 FAILED: outsider was allowed to enqueue an OCR job';
exception
  when insufficient_privilege then
    raise notice 'T19a passed: outsider cannot enqueue an OCR job';
end $$;
set app.current_user_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  insert into public.ocr_jobs (id, document_id, workspace_id, user_id, language)
    values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'eng');
  raise notice 'T19b passed: editor can enqueue an OCR job';
exception
  when others then
    raise exception 'T19 FAILED: editor could not enqueue an OCR job: %', sqlerrm;
end $$;
do $$
begin
  insert into public.ocr_jobs (document_id, workspace_id, user_id, language)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'urd');
  raise exception 'T19 FAILED: a second active job was allowed for the same document';
exception
  when unique_violation then
    raise notice 'T19c passed: a second active job for the same document is refused';
end $$;
set app.current_user_id = '33333333-3333-3333-3333-333333333333';
do $$
declare
  job_count int;
begin
  select count(*) into job_count from public.ocr_jobs
    where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  if job_count <> 0 then
    raise exception 'T19 FAILED: outsider can read another workspace OCR job (% rows)', job_count;
  end if;
  raise notice 'T19d passed: outsider cannot read another workspace OCR job';
end $$;
do $$
begin
  insert into public.document_ocr_results (document_id, workspace_id, job_id, page_number, text, mean_confidence, language)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 1, 'Forma Office', 96.30, 'eng');
  raise exception 'T19 FAILED: outsider was allowed to insert an OCR result';
exception
  when insufficient_privilege then
    raise notice 'T19e passed: outsider cannot insert an OCR result';
end $$;
set app.current_user_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  insert into public.document_ocr_results (document_id, workspace_id, job_id, page_number, text, mean_confidence, language)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 1, 'Forma Office', 96.30, 'eng');
  raise notice 'T19f passed: editor can insert an OCR result';
exception
  when others then
    raise exception 'T19 FAILED: editor could not insert an OCR result: %', sqlerrm;
end $$;

reset role;
do $$
begin
  raise notice 'ALL LOCAL RLS CHECKS PASSED';
end $$;
