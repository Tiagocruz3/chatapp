-- Supabase schema for:
-- 1) Chat logs (source of truth): chats, messages
-- 2) Memory (curated): user_memories, chat_summaries
-- 3) Docs RAG: documents, document_chunks
-- Plus: profiles, generated_images, optional orgs + org_memberships

-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- PROFILES
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Auto-create profile row on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles(user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email))
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ORGS (optional)
create table if not exists public.orgs (
  org_id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.org_memberships (
  org_id uuid not null references public.orgs(org_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- CHATS (persistent history)
create table if not exists public.chats (
  chat_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.orgs(org_id) on delete set null,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_chats_updated_at on public.chats;
create trigger trg_chats_updated_at
before update on public.chats
for each row execute function public.set_updated_at();

create index if not exists idx_chats_owner on public.chats(owner_user_id, updated_at desc);
create index if not exists idx_chats_org on public.chats(org_id, updated_at desc);

create table if not exists public.messages (
  message_id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(chat_id) on delete cascade,
  role text not null check (role in ('system','user','assistant','tool')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_chat_time on public.messages(chat_id, created_at asc);

-- Chat summaries (optional but recommended)
create table if not exists public.chat_summaries (
  chat_id uuid primary key references public.chats(chat_id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  summary text not null default '',
  last_summarized_message_time timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_chat_summaries_updated_at on public.chat_summaries;
create trigger trg_chat_summaries_updated_at
before update on public.chat_summaries
for each row execute function public.set_updated_at();

-- USER MEMORIES (curated + persistent)
create table if not exists public.user_memories (
  memory_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.orgs(org_id) on delete set null,
  memory_type text not null default 'other' check (memory_type in ('preference','personal_detail','project_context','other')),
  content text not null,
  confidence real not null default 0.6,
  is_active boolean not null default true,
  source_chat_id uuid references public.chats(chat_id) on delete set null,
  source_message_id uuid references public.messages(message_id) on delete set null,
  embedding vector(1536),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_user_memories_updated_at on public.user_memories;
create trigger trg_user_memories_updated_at
before update on public.user_memories
for each row execute function public.set_updated_at();

create index if not exists idx_user_memories_owner on public.user_memories(owner_user_id, is_active);

-- DOCUMENTS (RAG)
create table if not exists public.documents (
  document_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.orgs(org_id) on delete set null,
  title text not null,
  source_type text not null default 'upload' check (source_type in ('upload','url','note')),
  storage_bucket text not null default 'uploads',
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_documents_updated_at on public.documents;
create trigger trg_documents_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

create index if not exists idx_documents_owner on public.documents(owner_user_id, updated_at desc);

create table if not exists public.document_chunks (
  chunk_id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(document_id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists idx_chunks_document on public.document_chunks(document_id, chunk_index);

-- Semantic search helper (RAG)
-- Usage (client): supabase.rpc('match_document_chunks', { query_embedding, match_count })
create or replace function public.match_document_chunks(
  query_embedding vector(1536),
  match_count integer default 6
)
returns table (
  content text,
  document_id uuid,
  chunk_index integer,
  distance real
)
language sql
stable
as $$
  select
    c.content,
    c.document_id,
    c.chunk_index,
    (c.embedding <=> query_embedding) as distance
  from public.document_chunks c
  join public.documents d on d.document_id = c.document_id
  where c.embedding is not null
    and (
      d.owner_user_id = auth.uid()
      or (d.org_id is not null and public.is_org_member(d.org_id))
    )
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- PROJECTS (folders for organizing chats)
create table if not exists public.projects (
  project_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#10b981',
  instructions text not null default '',
  chat_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create index if not exists idx_projects_owner on public.projects(owner_user_id, updated_at desc);

-- GENERATED IMAGES
create table if not exists public.generated_images (
  image_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.orgs(org_id) on delete set null,
  prompt text not null,
  negative_prompt text,
  model text,
  parameters jsonb not null default '{}'::jsonb,
  storage_bucket text not null default 'generated-images',
  storage_path text not null,
  chat_id uuid references public.chats(chat_id) on delete set null,
  message_id uuid references public.messages(message_id) on delete set null,
  created_at timestamptz not null default now()
);

