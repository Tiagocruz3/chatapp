-- Storage bucket and policies for generated images
-- Run this in the Supabase SQL Editor

-- ============================================
-- STEP 1: Create the buckets (run this first, or create manually in Dashboard)
-- ============================================
-- Go to Storage > New Bucket > Name: "generated-images" > Public: OFF
-- Go to Storage > New Bucket > Name: "uploads" > Public: OFF

-- Or use SQL (may not work in all Supabase versions):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('generated-images', 'generated-images', false) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('uploads', 'uploads', false) ON CONFLICT DO NOTHING;

-- ============================================
-- STEP 2: POLICIES FOR generated-images bucket
-- ============================================

-- Drop existing policies first
DROP POLICY IF EXISTS "Users can upload their own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own images" ON storage.objects;

-- Policy: Allow authenticated users to upload files to their own folder
-- Path format: {user_id}/{filename}
CREATE POLICY "Users can upload their own images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'generated-images'
  AND auth.uid()::text = (string_to_array(name, '/'))[1]
);

-- Policy: Allow authenticated users to read/view their own images
CREATE POLICY "Users can view their own images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'generated-images'
  AND auth.uid()::text = (string_to_array(name, '/'))[1]
);

-- Policy: Allow authenticated users to update their own images
CREATE POLICY "Users can update their own images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'generated-images'
  AND auth.uid()::text = (string_to_array(name, '/'))[1]
)
WITH CHECK (
  bucket_id = 'generated-images'
  AND auth.uid()::text = (string_to_array(name, '/'))[1]
);

-- Policy: Allow authenticated users to delete their own images
CREATE POLICY "Users can delete their own images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'generated-images'
  AND auth.uid()::text = (string_to_array(name, '/'))[1]
);

-- ============================================
-- STEP 3: POLICIES FOR uploads bucket (documents/files)
-- ============================================

-- Drop existing policies first
DROP POLICY IF EXISTS "Users can upload their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;

-- Policy: Allow authenticated users to upload files to their own folder
CREATE POLICY "Users can upload their own files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'uploads'
  AND auth.uid()::text = (string_to_array(name, '/'))[1]
);

-- Policy: Allow authenticated users to read/view their own files
CREATE POLICY "Users can view their own files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'uploads'
  AND auth.uid()::text = (string_to_array(name, '/'))[1]
);

-- Policy: Allow authenticated users to update their own files
CREATE POLICY "Users can update their own files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'uploads'
  AND auth.uid()::text = (string_to_array(name, '/'))[1]
)
WITH CHECK (
  bucket_id = 'uploads'
  AND auth.uid()::text = (string_to_array(name, '/'))[1]
);

-- Policy: Allow authenticated users to delete their own files
CREATE POLICY "Users can delete their own files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'uploads'
  AND auth.uid()::text = (string_to_array(name, '/'))[1]
);

-- ============================================
-- VERIFY: Check existing policies
-- ============================================
-- Run this to see all storage policies:
-- SELECT policyname, tablename, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'storage';
