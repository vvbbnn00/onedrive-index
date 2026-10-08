import axios from 'axios'
import { checkBuildStage } from '../utils/buildIdHelper'
import { encodePath, getAccessToken, getAuthTokenPath } from '../pages/api'
import apiConfig from '../../config/api.config'
import siteConfig from '../../config/site.config'
import { acquireLock, renewLock, releaseLock, setCache } from '../utils/odAuthTokenStore'
import { getNextToken } from '../utils/driveItems'
import { isPasswordFile } from '../utils/isPasswordFile'

export default async function generateSitemap() {
  if (checkBuildStage()) return
  const key = 'GENERATE_SITEMAP'
  const owner = await acquireLock(key, 120)
  if (!owner) return
  try {
    const accessToken = await getAccessToken()
    if (!accessToken) return
    const queue = ['/']
    const visited = new Set<string>()
    const sitemap: { path: string; lastModifiedDateTime?: string }[] = []
    while (queue.length) {
      const path = queue.shift()!
      if (visited.has(path) || getAuthTokenPath(path).length) continue
      visited.add(path)
      if (visited.size > 10000) throw new Error('Sitemap directory limit exceeded.')
      const requestPath = encodePath(path)
      let next: string | undefined
      const tokens = new Set<string>()
      do {
        if (!await renewLock(key, owner, 120)) throw new Error('Sitemap lease lost.')
        if (tokens.has(next ?? '')) throw new Error('Repeated sitemap pagination token.')
        tokens.add(next ?? '')
        const { data } = await axios.get(`${apiConfig.driveApi}/root${requestPath}${requestPath ? ':' : ''}/children`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { select: 'name,lastModifiedDateTime,folder', $top: siteConfig.maxItems, ...(next ? { $skipToken: next } : {}) },
          timeout: 30000,
        })
        if (!Array.isArray(data.value)) throw new Error('Invalid sitemap response.')
        for (const item of data.value) {
          const childPath = `${path === '/' ? '' : path}/${item.name}`
          if (isPasswordFile(item.name) || getAuthTokenPath(childPath).length) continue
          sitemap.push({ path: childPath, lastModifiedDateTime: item.lastModifiedDateTime })
          if (sitemap.length > 10000) throw new Error('Sitemap entry limit exceeded.')
          if (item.folder) queue.push(childPath)
        }
        next = getNextToken(data['@odata.nextLink'])
      } while (next)
    }
    if (!await renewLock(key, owner, 120)) throw new Error('Sitemap lease lost.')
    await setCache({ key: 'DATA:SITEMAP', value: JSON.stringify({ data: sitemap, lastModifiedDateTime: new Date().toISOString() }), ex: 7 * 86400 })
  } catch {
    // Keep the previous complete sitemap on failure.
    console.error('Sitemap refresh failed; retaining previous data.')
  } finally {
    await releaseLock(key, owner)
  }
}
