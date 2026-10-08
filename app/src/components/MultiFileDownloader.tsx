import { NextRouter } from 'next/router'
import toast from 'react-hot-toast'
import { createDownloadBudget, downloadFile, MAX_ZIP_FILES } from '../utils/download'
import { useTranslation } from 'next-i18next'

import { fetcher } from '../utils/fetchWithSWR'

/**
 * A loading toast component with file download progress support
 * @param props
 * @param props.router Next router instance, used for reloading the page
 * @param props.progress Current downloading and compression progress (returned by jszip metadata)
 */
export function DownloadingToast({ router, progress }: { router: NextRouter; progress?: string }) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center space-x-2">
      <div className="w-56">
        <span>{progress ? t('Downloading {{progress}}%', { progress }) : t('Downloading selected files...')}</span>

        <div className="relative mt-2">
          <div className="flex h-1 overflow-hidden rounded bg-gray-100">
            <div style={{ width: `${progress}%` }} className="bg-gray-500 text-white transition-all duration-100"></div>
          </div>
        </div>
      </div>
      <button
        className="rounded bg-red-500 p-2 text-white hover:bg-red-400 focus:outline-none focus:ring focus:ring-red-300"
        onClick={() => router.reload()}
      >
        {t('Cancel')}
      </button>
    </div>
  )
}

// Blob download helper
export function downloadBlob({ blob, name }: { blob: Blob; name: string }) {
  // Prepare for download
  const el = document.createElement('a')
  el.style.display = 'none'
  document.body.appendChild(el)

  // Download zip file
  const bUrl = window.URL.createObjectURL(blob)
  el.href = bUrl
  el.download = name
  el.click()
  setTimeout(() => window.URL.revokeObjectURL(bUrl), 1000)
  el.remove()
}

/**
 * Download multiple files after compressing them into a zip
 * @param toastId Toast ID to be used for toast notification
 * @param files Files to be downloaded
 * @param folder Optional folder name to hold files, otherwise flatten files in the zip
 */
export async function downloadMultipleFiles({
  toastId,
  router,
  files,
  folder,
}: {
  toastId: string
  router: NextRouter
  files: { name: string; url: string }[]
  folder?: string
}): Promise<void> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const dir = folder ? zip.folder(folder)! : zip

  if (files.length > MAX_ZIP_FILES) throw new Error('Select at most 500 files per ZIP download.')
  const budget = createDownloadBudget()
  const controller = new AbortController()
  let cursor = 0
  const workers = Array.from({ length: Math.min(4, files.length) }, async () => {
    while (cursor < files.length && !controller.signal.aborted) {
      const { name, url } = files[cursor++]
      try {
        dir.file(name, await downloadFile(url, budget, controller.signal))
      } catch (error) {
        controller.abort()
        throw error
      }
    }
  })
  const results = await Promise.allSettled(workers)
  const failure = results.find(result => result.status === 'rejected') as PromiseRejectedResult | undefined
  if (failure) throw failure.reason

  // Create zip file and download it
  const b = await zip.generateAsync({ type: 'blob' }, metadata => {
    toast.loading(<DownloadingToast router={router} progress={metadata.percent.toFixed(0)} />, {
      id: toastId,
    })
  })
  downloadBlob({ blob: b, name: folder ? folder + '.zip' : 'download.zip' })
}

/**
 * Download hierarchical tree-like files after compressing them into a zip
 * @param toastId Toast ID to be used for toast notification
 * @param files Files to be downloaded. Array of file and folder items excluding root folder.
 * Folder items MUST be in front of its children items in the array.
 * Use async generator because generation of the array may be slow.
 * When waiting for its generation, we can meanwhile download bodies of already got items.
 * Only folder items can have url undefined.
 * @param basePath Root dir path of files to be downloaded
 * @param folder Optional folder name to hold files, otherwise flatten files in the zip
 */
export async function downloadTreelikeMultipleFiles({
  toastId,
  router,
  files,
  basePath,
  folder,
}: {
  toastId: string
  router: NextRouter
  files: AsyncGenerator<{
    name: string
    url?: string
    path: string
    isFolder: boolean
  }>
  basePath: string
  folder?: string
}): Promise<void> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const root = folder ? zip.folder(folder)! : zip
  const map = new Map([[basePath.replace(/\/$/, ''), root]])
  const budget = createDownloadBudget()

  // Add selected file blobs to zip according to its path
  for await (const { name, url, path, isFolder } of files) {
    const parent = path.substring(0, path.lastIndexOf('/')).replace(/\/$/, '')
    const dir = map.get(parent)
    if (!dir) throw new Error('File array does not satisfy requirement')
    if (isFolder) {
      map.set(path.replace(/\/$/, ''), dir.folder(name)!)
    } else {
      dir.file(name, await downloadFile(url!, budget))
    }
  }

  // Create zip file and download it
  const b = await zip.generateAsync({ type: 'blob' }, metadata => {
    toast.loading(<DownloadingToast router={router} progress={metadata.percent.toFixed(0)} />, {
      id: toastId,
    })
  })
  downloadBlob({ blob: b, name: folder ? folder + '.zip' : 'download.zip' })
}

interface TraverseItem {
  path: string
  meta: any
  isFolder: boolean
  error?: { status: number; message: string }
}

/**
 * Bounded top-down traversal. Pages are yielded as they arrive, with parents
 * before children. Client errors are reported for the affected directory;
 * server and network errors abort the download.
 * @param path Folder to be traversed. The path should be cleaned in advance.
 * @param hashedToken Optional hashed token to be used for protected routes
 * @returns Array of items representing folders and files of traversed folder top-down and excluding root folder.
 * Due to top-down, Folder items are ALWAYS in front of its children items.
 * Error key in the item will contain the error when there is a handleable error.
 */
export async function* traverseFolder(path: string, hashedToken?: string): AsyncGenerator<TraverseItem, void, undefined> {
  const queue = [path]
  const visited = new Set<string>()
  let count = 0
  while (queue.length) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    if (visited.size > 500) throw new Error('Select a smaller folder (at most 500 directories per download).')
    let next: string | undefined
    const pages = new Set<string>()
    do {
      if (pages.has(next ?? '')) throw new Error('Repeated pagination token.')
      pages.add(next ?? '')
      let data: any
      try {
        data = await fetcher([`/api/?path=${current}${next ? '&next=' + encodeURIComponent(next) : ''}`, hashedToken])
      } catch (error: any) {
        if (error.status >= 400 && error.status < 500) {
          yield { path: current, meta: {}, isFolder: true, error: { status: error.status, message: error.message?.error ?? 'Unable to read folder.' } }
          break
        }
        throw error
      }
      if (!Array.isArray(data?.folder?.value)) throw new Error('Path is not folder')
      for (const child of data.folder.value) {
        if (child.name.toLowerCase() === '.password') continue
        if (++count > 1000) throw new Error('Select a smaller folder (at most 1000 entries per download).')
        const childPath = `${current === '/' ? '' : current}/${encodeURIComponent(child.name)}`
        const isFolder = Boolean(child.folder)
        if (isFolder) queue.push(childPath)
        yield { path: childPath, meta: child, isFolder }
      }
      next = data.next
    } while (next)
  }
}
