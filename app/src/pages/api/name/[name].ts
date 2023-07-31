import type { NextApiRequest, NextApiResponse } from 'next'
import { default as rawFileHandler } from '../raw'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Add a header which contains the attachment name
  res.setHeader('Content-Disposition', `attachment; filename="${req.query.name}"`)
  
  rawFileHandler(req, res)
}
