import type { NextApiRequest, NextApiResponse } from 'next'
import { checkAuthRoute, getAccessToken } from '.'
import { decryptData, encryptData } from '../../utils/oAuthHandler'
import { Session } from '../../utils/odAuthTokenStore'
import { encodeItemPath, getItemMetadata, getItemPath } from '../../utils/driveItems'
import { isPasswordFile } from '../../utils/isPasswordFile'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  const { id } = req.query
  let itemId: string
  try {
    if (typeof id !== 'string') throw new Error()
    itemId = decryptData(id)
    if (!/^[a-zA-Z0-9!]+$/.test(itemId)) throw new Error()
  } catch { return res.status(400).json({ error: 'Invalid driveItem ID.' }) }
  try {
    const accessToken = await getAccessToken()
    if (!accessToken) return res.status(403).json({ error: 'No access token.' })
    const item = await getItemMetadata(itemId, accessToken)
    const itemPath = getItemPath(item)
    if (!itemPath || isPasswordFile(item.name)) return res.status(404).json({ error: 'Item not found.' })
    const check = await checkAuthRoute(itemPath, accessToken, '')
    const session = await new Session(req, res).getSession()
    if (check.needAuth && (!check.password || session?.passKeys?.[check.authPath ?? ''] !== check.password)) {
      return res.status(401).json({ error: 'Not authenticated.' })
    }
    return res.status(200).json({
      id: encryptData(item.id), name: item.name, file: Boolean(item.file), folder: item.folder,
      path: encodeItemPath(itemPath),
    })
  } catch (error: any) {
    return res.status(error?.response?.status ?? 500).json({ error: 'Unable to read item.' })
  }
}
