/**
 * Supabase Integration Example
 * 
 * This shows how to add cloud sync to OxSig
 * Uncomment and configure when ready for production
 */

/*
// 1. Install: pnpm add @supabase/supabase-js

import { createClient } from '@supabase/supabase-js'

// 2. Add to .env.local:
// NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
// NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

// 3. Database schema (create in Supabase SQL editor):

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  title text NOT NULL,
  content text NOT NULL,
  hash text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id),
  user_id uuid REFERENCES auth.users(id),
  signature_data text NOT NULL,
  algorithm text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Row Level Security
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own documents"
  ON documents FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own signatures"
  ON signatures FOR ALL
  USING (auth.uid() = user_id);

// 4. Usage in your app:

// Upload document
export async function uploadDocument(document: any) {
  const { data, error } = await supabase
    .from('documents')
    .insert({
      title: document.title,
      content: document.content,
      hash: document.hash
    })
    .select()
    .single()
  
  if (error) throw error
  return data
}

// Download documents
export async function getDocuments() {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error) throw error
  return data
}

// Real-time sync
export function subscribeToDocuments(callback: (payload: any) => void) {
  return supabase
    .channel('documents')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'documents' },
      callback
    )
    .subscribe()
}

// File storage for large documents/PDFs
export async function uploadFile(file: File) {
  const fileName = `${Date.now()}-${file.name}`
  const { data, error } = await supabase.storage
    .from('documents')
    .upload(fileName, file)
  
  if (error) throw error
  
  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('documents')
    .getPublicUrl(fileName)
  
  return { fileName, publicUrl }
}
*/

// For now, export a placeholder
export const cloudSync = {
  enabled: false,
  message: 'Cloud sync ready to configure. See PRODUCTION_DEPLOYMENT.md'
}
