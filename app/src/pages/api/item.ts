import axios from 'axios'
import type { NextApiRequest, NextApiResponse } from 'next'

import { getAccessToken } from '.'
import apiConfig from '../../../config/api.config'
import { decryptData, encryptData } from '../../utils/oAuthHandler'
import assert from 'assert'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get access token from storage
  const accessToken = await getAccessToken()

  // Get item details (specifically, its path) by its unique ID in OneDrive
  const { id = '' } = req.query

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
          select: 'id,name,parentReference',
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
      res.status(200).json(data)
    } catch (error: any) {
      res.status(error?.response?.status ?? 500).json({ error: error?.response?.data?.error ?? 'Internal server error.' })
    }
  } else {
    res.status(400).json({ error: 'Invalid driveItem ID.' })
  }
  return
}
