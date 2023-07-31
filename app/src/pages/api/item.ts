import axios from 'axios'
import type { NextApiRequest, NextApiResponse } from 'next'

import { checkAuthRoute, getAccessToken } from '.'
import apiConfig from '../../../config/api.config'
import { decryptData, encryptData } from '../../utils/oAuthHandler'
import assert from 'assert'
import { matchProtectedRoute } from '../../utils/protectedRouteHandler'
import siteConfig from '../../../config/site.config'

/**
 * Extract the searched item's path in field 'parentReference' and convert it to the
 * absolute path represented in onedrive-vercel-index
 *
 * @param path Path returned from the parentReference field of the driveItem
 * @returns The absolute path of the driveItem in the search result
 */
function mapAbsolutePath(path: string): string {
  // path is in the format of '/drive/root:/path/to/file', if baseDirectory is '/' then we split on 'root:',
  // otherwise we split on the user defined 'baseDirectory'
  const absolutePath = path.split(siteConfig.baseDirectory === '/' ? 'root:' : siteConfig.baseDirectory)
  // path returned by the API may contain #, by doing a decodeURIComponent and then encodeURIComponent we can
  // replace URL sensitive characters such as the # with %23
  return absolutePath.length > 1 // solve https://github.com/spencerwooo/onedrive-vercel-index/issues/539
    ? absolutePath[1]
      .split('/')
      .map(p => encodeURIComponent(decodeURIComponent(p)))
      .join('/')
    : ''
}


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get access token from storage
  const accessToken = await getAccessToken()

  // Get item details (specifically, its path) by its unique ID in OneDrive
  const { id = '' } = req.query

  // Handle protected routes authentication
  const odTokenHeaders = req.cookies ?? {}

  // Set edge function caching for faster load times, check docs:
  // https://vercel.com/docs/concepts/functions/edge-caching
  res.setHeader('Cache-Control', apiConfig.cacheControlHeader)

  if (typeof id === 'string') {
    let queryId;
    try {
      queryId = decryptData(id);
      // console.log(queryId);
      assert(queryId.match(/^[A-Za-z0-9]+$/))
    } catch (err) {
      res.status(400).json({ error: 'Invalid driveItem ID.' })
      return;
    }
    const itemApi = `${apiConfig.driveApi}/items/${queryId}`

    try {
      const { data } = await axios.get(itemApi, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          select: 'id,name,parentReference,file,folder',
        },
      })
      delete data['@odata.context']
      delete data['@odata.etag']
      delete data?.parentReference?.driveId
      delete data?.parentReference?.driveType
      delete data?.parentReference?.siteId
      data.id = encryptData(data.id);
      if (data?.parentReference?.id) {
        data.parentReference.id = encryptData(data.parentReference.id);
      }

      const path = mapAbsolutePath(data?.parentReference?.path);
      const authPath = matchProtectedRoute(path) // check if the route is protected
      let token = ''
      if (authPath) {
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('X-Need-NoCache', 'yes')  // Add an extra header
        token = odTokenHeaders[`token_${encodeURIComponent(authPath)}`] || ''
      }

      const check = await checkAuthRoute(authPath, accessToken, token)
      if (check.code !== 200) {
        res.status(401).json({ error: 'Password required.' })
        return
      }

      res.status(200).json(data)
    } catch (error: any) {
      res.status(error?.response?.status ?? 500).json({ error: error?.response?.data?.error ?? 'Internal server error.' })
    }
  } else {
    res.status(400).json({ error: 'Invalid driveItem ID.' })
  }
  return
}
