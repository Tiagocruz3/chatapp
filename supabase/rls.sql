-- Enable RLS + policies

alter table public.profiles enable row level security;
alter table public.orgs enable row level security;
alter table public.org_memberships enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.chat_summaries enable row level security;
alter table public.user_memories enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.generated_images enable row level security;
alter table public.user_agents enable row level security;

-- Helper: org membership check
create or replace function public.is_org_member(p_org_id uuid)
returns boolean as $$
  select exists (
    select 1
    from public.org_memberships m
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
  );
$$ language sql stable;

-- PROFILES
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select using (user_id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ORGS + MEMBERSHIPS
drop policy if exists "orgs_select_member" on public.orgs;
create policy "orgs_select_member" on public.orgs
for select using (public.is_org_member(org_id) or created_by = auth.uid());

drop policy if exists "orgs_insert_self" on public.orgs;
create policy "orgs_insert_self" on public.orgs
for insert with check (created_by = auth.uid());

drop policy if exists "org_memberships_select_member" on public.org_memberships;
create policy "org_memberships_select_member" on public.org_memberships
for select using (user_id = auth.uid() or public.is_org_member(org_id));

drop policy if exists "org_memberships_insert_owner" on public.org_memberships;
create policy "org_memberships_insert_owner" on public.org_memberships
for insert with check (public.is_org_member(org_id));

-- CHATS
drop policy if exists "chats_select_owner_or_org" on public.chats;
create policy "chats_select_owner_or_org" on public.chats
for select using (
  owner_user_id = auth.uid()
  or (org_id is not null and public.is_org_member(org_id))
);

drop policy if exists "chats_insert_owner" on public.chats;
create policy "chats_insert_owner" on public.chats
for insert with check (owner_user_id = auth.uid());

drop policy if exists "chats_update_owner" on public.chats;
create policy "chats_update_owner" on public.chats
for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists "chats_delete_owner" on public.chats;
create policy "chats_delete_owner" on public.chats
for delete using (owner_user_id = auth.uid());

-- MESSAGES
drop policy if exists "messages_select_owner_or_org" on public.messages;
create policy "messages_select_owner_or_org" on public.messages
for select using (
  exists (
    select 1
    from public.chats c
    where c.chat_id = messages.chat_id
      and (c.owner_user_id = auth.uid() or (c.org_id is not null and public.is_org_member(c.org_id)))
  )
);

drop policy if exists "messages_insert_owner_or_org" on public.messages;
create policy "messages_insert_owner_or_org" on public.messages
for insert with check (
  exists (
    select 1
    from public.chats c
    where c.chat_id = messages.chat_id
      and (c.owner_user_id = auth.uid() or (c.org_id is not null and public.is_org_member(c.org_id)))
  )
);

-- CHAT SUMMARIES
drop policy if exists "chat_summaries_select_owner" on public.chat_summaries;
create policy "chat_summaries_select_owner" on public.chat_summaries
for select using (owner_user_id = auth.uid());

drop policy if exists "chat_summaries_upsert_owner" on public.chat_summaries;
create policy "chat_summaries_upsert_owner" on public.chat_summaries
for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- USER MEMORIES
drop policy if exists "user_memories_select_owner_or_org" on public.user_memories;
create policy "user_memories_select_owner_or_org" on public.user_memories
for select using (
  owner_user_id = auth.uid()
  or (org_id is not null and public.is_org_member(org_id))
);

drop policy if exists "user_memories_write_owner" on public.user_memories;
create policy "user_memories_write_owner" on public.user_memories
for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- DOCUMENTS + CHUNKS
drop policy if exists "documents_select_owner_or_org" on public.documents;
create policy "documents_select_owner_or_org" on public.documents
for select using (
  owner_user_id = auth.uid()
  or (org_id is not null and public.is_org_member(org_id))
);

drop policy if exists "documents_write_owner" on public.documents;
create policy "documents_write_owner" on public.documents
for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists "chunks_select_owner_or_org" on public.document_chunks;
create policy "chunks_select_owner_or_org" on public.document_chunks
for select using (
  exists (
    select 1
    from public.documents d
    where d.document_id = document_chunks.document_id
      and (d.owner_user_id = auth.uid() or (d.org_id is not null and public.is_org_member(d.org_id)))
  )
);

drop policy if exists "chunks_write_owner" on public.document_chunks;
create policy "chunks_write_owner" on public.document_chunks
for all using (
  exists (
    select 1
    from public.documents d
    where d.document_id = document_chunks.document_id
      and d.owner_user_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.documents d
    where d.document_id = document_chunks.document_id
      and d.owner_user_id = auth.uid()
  )
);

-- PROJECTS
alter table public.projects enable row level security;

drop policy if exists "projects_select_owner" on public.projects;
create policy "projects_select_owner" on public.projects
for select using (owner_user_id = auth.uid());

drop policy if exists "projects_insert_owner" on public.projects;
create policy "projects_insert_owner" on public.projects
for insert with check (owner_user_id = auth.uid());

drop policy if exists "projects_update_owner" on public.projects;
create policy "projects_update_owner" on public.projects
for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists "projects_delete_owner" on public.projects;
create policy "projects_delete_owner" on public.projects
for delete using (owner_user_id = auth.uid());

-- USER AGENTS
drop policy if exists "user_agents_select_owner" on public.user_agents;
create policy "user_agents_select_owner" on public.user_agents
for select using (owner_user_id = auth.uid());

drop policy if exists "user_agents_insert_owner" on public.user_agents;
create policy "user_agents_insert_owner" on public.user_agents
for insert with check (owner_user_id = auth.uid());

drop policy if exists "user_agents_update_owner" on public.user_agents;
create policy "user_agents_update_owner" on public.user_agents
for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists "user_agents_delete_owner" on public.user_agents;
create policy "user_agents_delete_owner" on public.user_agents
for delete using (owner_user_id = auth.uid());

-- GENERATED IMAGES
drop policy if exists "images_select_owner_or_org" on public.generated_images;
create policy "images_select_owner_or_org" on public.generated_images
for select using (
  owner_user_id = auth.uid()
  or (org_id is not null and public.is_org_member(org_id))
);

drop policy if exists "images_write_owner" on public.generated_images;
create policy "images_write_owner" on public.generated_images
for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

