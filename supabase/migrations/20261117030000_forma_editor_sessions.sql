-- Forma Office — Day 5: editor sessions for the ONLYOFFICE proof.
--
-- Depends on 20261117010000 (workspaces) and 20261117020000
-- (documents). Apply in filename order.
--
-- editor_sessions maps the random ONLYOFFICE document key (20 hex
-- chars, see src/lib/editor.server.ts) back to a document, a user
-- and a version. The key is the only thing the document server ever
-- sees; it reveals nothing and cannot be guessed. A session lives
-- for one hour and is deleted after its save is applied (or when it
-- expires — the app treats an expired session as invalid).
--
-- RLS is enabled with NO policies for app roles: only the admin
-- (service_role) client reads/writes this table, from the server
-- actions and API routes that build configs and handle callbacks.
-- No row is ever readable through the Data API.

create table if not exists public.editor_sessions (
  key text primary key,
  document_id uuid not null references public.documents (id)
    on delete cascade,
  workspace_id uuid not null references public.workspaces (id)
    on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  version integer not null check (version >= 1),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists editor_sessions_document_idx
  on public.editor_sessions (document_id);
create index if not exists editor_sessions_expires_idx
  on public.editor_sessions (expires_at);

alter table public.editor_sessions enable row level security;

-- Deliberately no policies: app roles cannot read or write sessions
-- at all. The server (admin client) is the only accessor.
revoke all on public.editor_sessions from anon, authenticated;
