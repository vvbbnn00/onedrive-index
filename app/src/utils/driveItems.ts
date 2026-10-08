import axios from 'axios'
import { posix } from 'path'
import apiConfig from '../../config/api.config'
import siteConfig from '../../config/site.config'
import { getCache, setCache } from './odAuthTokenStore'

// Graph parent paths are URI-encoded; item names are literal strings.
export function getItemPath(item: any): string | null {
  if (typeof item?.name !== 'string' || /[\\/]/.test(item.name) || ['.', '..'].includes(item.name)) return null
  const parent = item?.parentReference?.path
  if (typeof parent !== 'string') return null
  const marker = parent.indexOf('root:')
  if (marker === -1) return null
  try {
    const absolute = posix.resolve('/', decodeURIComponent(parent.slice(marker + 5)))
    const base = posix.resolve('/', siteConfig.baseDirectory).replace(/\/$/, '')
    if (base && absolute.toLowerCase() !== base.toLowerCase() && !absolute.toLowerCase().startsWith(base.toLowerCase() + '/')) return null
    return posix.join('/', absolute.slice(base.length), item.name)
  } catch { return null }
}

export function encodeItemPath(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/')
}

export async function getItemMetadata(id: string, accessToken: string) {
  if (!/^[a-zA-Z0-9!]+$/.test(id)) throw new Error('Invalid driveItem ID.')
  const key = `ITEM_V2:${id}`
  const cached = await getCache({ key })
  if (cached.data) {
    try { return JSON.parse(cached.data) } catch { /* Refresh corrupt cache entries. */ }
  }
  const { data } = await axios.get(`${apiConfig.driveApi}/items/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { select: 'id,name,parentReference,file,folder' },
    timeout: 15000,
  })
  await setCache({ key, value: JSON.stringify(data), ex: 300 })
  return data
}

export function getNextToken(nextLink?: string): string | undefined {
  if (!nextLink) return undefined
  const url = new URL(nextLink)
  let token: string | undefined
  url.searchParams.forEach((value, key) => { if (key.toLowerCase() === '$skiptoken') token = value })
  return token
}
