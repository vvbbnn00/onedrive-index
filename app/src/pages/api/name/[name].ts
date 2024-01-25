import type { NextApiRequest, NextApiResponse } from 'next'
import { default as rawFileHandler } from '../raw'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Add a header which contains the attachment name
  const name = encodeURIComponent(req.query.name as string);
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`)

  await rawFileHandler(req, res)
}
