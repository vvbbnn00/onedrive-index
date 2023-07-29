import axios from 'axios'
import type { NextApiRequest, NextApiResponse } from 'next'

import { encodePath, getAccessToken } from '.'
import apiConfig from '../../../config/api.config'
import siteConfig from '../../../config/site.config'
import { encryptData } from '../../utils/oAuthHandler'

/**
 * Sanitize the search query
 *
 * @param query User search query, which may contain special characters
 * @returns Sanitised query string, which:
 * - encodes the '<' and '>' characters,
 * - replaces '?' and '/' characters with ' ',
 * - replaces ''' with ''''
 * Reference: https://stackoverflow.com/questions/41491222/single-quote-escaping-in-microsoft-graph.
 */
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
  // Get access token from storage
  const accessToken = await getAccessToken()

  // Query parameter from request
  const { q: searchQuery = '' } = req.query

  // Set edge function caching for faster load times, check docs:
  // https://vercel.com/docs/concepts/functions/edge-caching
  res.setHeader('Cache-Control', apiConfig.cacheControlHeader)

  if (typeof searchQuery === 'string') {
    // Construct Microsoft Graph Search API URL, and perform search only under the base directory
    const searchRootPath = encodePath('/')
    const encodedPath = searchRootPath === '' ? searchRootPath : searchRootPath + ':'

    const searchApi = `${apiConfig.driveApi}/root${encodedPath}/search(q='${sanitiseQuery(searchQuery)}')`

    try {
      const { data } = await axios.get(searchApi, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          select: 'id,file,parentReference',
          top: siteConfig.maxItems,
        },
      })
      res.status(200).json(data.value.map(item => {
        delete item['@odata.type']
        item.file = item.file ? true : false;
        delete item?.parentReference?.driveId
        delete item?.parentReference?.driveType
        delete item?.parentReference?.siteId
        item.id = encryptData(item.id);
        if (item.parentReference.id) {
          item.parentReference.id = encryptData(item?.parentReference?.id)
        }
        return item
      }))
    } catch (error: any) {
      res.status(error?.response?.status ?? 500).json({ error: error?.response?.data?.error ?? 'Internal server error.' })
      // console.log(error)
    }
  } else {
    res.status(200).json([])
  }
  return
}
