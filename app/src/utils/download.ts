export const MAX_ZIP_FILES = 500
export const MAX_ZIP_BYTES = 100 * 1024 * 1024

export function createDownloadBudget() {
  return { files: 0, bytes: 0 }
}

export async function downloadFile(url: string, budget: ReturnType<typeof createDownloadBudget>, signal?: AbortSignal) {
  if (++budget.files > MAX_ZIP_FILES) throw new Error('Select at most 500 files per ZIP download.')
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Download failed (HTTP ${response.status}).`)
  const declared = Number(response.headers.get('content-length'))
  if (declared > MAX_ZIP_BYTES - budget.bytes) {
    await response.body?.cancel()
    throw new Error('ZIP downloads are limited to 100 MiB. Download larger files individually.')
  }
  if (!response.body) throw new Error('Streaming downloads are not supported by this browser.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      budget.bytes += value.byteLength
      if (budget.bytes > MAX_ZIP_BYTES) throw new Error('ZIP downloads are limited to 100 MiB. Download larger files individually.')
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally { reader.releaseLock() }
  return new Blob(chunks)
}
