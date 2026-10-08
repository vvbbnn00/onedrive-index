import axios from 'axios'
import type { NextApiRequest, NextApiResponse } from 'next'
import { encodePath, getAccessToken, checkAuthRoute } from '.'
import apiConfig from '../../../config/api.config'
import siteConfig from '../../../config/site.config'
import { encryptData } from '../../utils/oAuthHandler'
import { Session } from '../../utils/odAuthTokenStore'
import { encodeItemPath, getItemMetadata, getItemPath } from '../../utils/driveItems'
import { isPasswordFile } from '../../utils/isPasswordFile'

function sanitiseQuery(query: string): string {
  const sanitisedQuery = query
    .replace(/'/g, "''")
    .replace(/</g, ' &lt; ')
    .replace(/>/g, ' &gt; ')
    .replace(/\?/g, ' ')
    .replace(/\//g, ' ')
    .replace(/\\/g, ' ')
  return encodeURIComponent(sanitisedQuery)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  const { q = '' } = req.query
  if (typeof q !== 'string' || !q.trim()) return res.status(200).json([])
  if (q.length > 200) return res.status(400).json({ error: 'Search query too long.' })
  try {
    const accessToken = await getAccessToken()
    if (!accessToken) return res.status(403).json({ error: 'No access token.' })
    const session = await new Session(req, res).getSession()
    const root = encodePath('/')
    const { data } = await axios.get(`${apiConfig.driveApi}/root${root ? root + ':' : ''}/search(q='${sanitiseQuery(q)}')`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { select: 'id,name,file,folder,parentReference', top: siteConfig.maxItems },
      timeout: 15000,
    })
    const source = Array.isArray(data.value) ? data.value.slice(0, Number(siteConfig.maxItems)) : []
    const results: any[] = new Array(source.length)
    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(4, source.length) }, async () => {
      while (cursor < source.length) {
        const index = cursor++
        let item = source[index]
        // Business/Education search may omit the parent path.
        if (!item.parentReference?.path) item = await getItemMetadata(item.id, accessToken)
        const itemPath = getItemPath(item)
        if (!itemPath || isPasswordFile(item.name)) continue
        const check = await checkAuthRoute(itemPath, accessToken, '')
        if (check.needAuth && (!check.password || session?.passKeys?.[check.authPath ?? ''] !== check.password)) continue
        results[index] = { id: encryptData(item.id), name: item.name, file: Boolean(item.file), path: encodeItemPath(itemPath) }
      }
    }))
    return res.status(200).json(results.filter(Boolean))
  } catch (error: any) {
    return res.status(error?.response?.status ?? 500).json({ error: 'Search failed.' })
  }
}
