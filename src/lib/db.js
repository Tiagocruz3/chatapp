import { supabase, isSupabaseConfigured } from './supabaseClient'

export function isDbEnabled(user) {
  return Boolean(isSupabaseConfigured && supabase && user?.id)
}

// Memories
export async function fetchMemories(userId, { limit = 50 } = {}) {
  const { data, error } = await supabase
    .from('user_memories')
    .select('memory_id,memory_type,content,confidence,is_active,created_at,updated_at,last_used_at')
    .eq('owner_user_id', userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function addMemory(userId, { memory_type = 'other', content, confidence = 0.6, source_chat_id = null, source_message_id = null } = {}) {
  const { data, error } = await supabase
    .from('user_memories')
    .insert({
      owner_user_id: userId,
      memory_type,
      content,
      confidence,
      source_chat_id,
      source_message_id,
    })
    .select('memory_id')
    .single()
  if (error) throw error
  return data
}

// Documents (metadata only). Chunking + embeddings should be done server-side (Edge Function / worker).
export async function listDocuments(userId, { limit = 50 } = {}) {
  const { data, error } = await supabase
    .from('documents')
    .select('document_id,title,source_type,storage_bucket,storage_path,metadata,created_at,updated_at')
    .eq('owner_user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function createDocument(userId, { title, source_type = 'upload', storage_bucket = 'uploads', storage_path = null, metadata = {} } = {}) {
  const { data, error } = await supabase
    .from('documents')
    .insert({
      owner_user_id: userId,
      title,
      source_type,
      storage_bucket,
      storage_path,
      metadata,
    })
    .select('document_id')
    .single()
  if (error) throw error
  return data
}

