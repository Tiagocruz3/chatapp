export async function uploadAttachment(file) {
  // Simple in-browser mock uploader with per-file 10MB limit
  const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
  if (!file) {
    throw new Error('No file provided')
  }
  if (file.size > MAX_BYTES) {
    throw new Error('File size exceeds 10MB limit')
  }
  // Create a blob URL to reference the file in the mock storage
  const url = URL.createObjectURL(file)
  return {
    url,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream'
  }
}
