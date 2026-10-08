import type { NextApiRequest, NextApiResponse } from 'next'
import { default as rawFileHandler } from '../raw'
import { contentDisposition } from '../../../utils/contentDisposition'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Add a header which contains the attachment name
  if (typeof req.query.name !== 'string') return res.status(400).json({ error: 'Invalid filename.' })
  res.setHeader('Content-Disposition', contentDisposition(req.query.name))

  await rawFileHandler(req, res)
}
