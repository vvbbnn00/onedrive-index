import { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { getCache } from '../utils/odAuthTokenStore'
import generateSitemap from '../cron/generate_sitemap'


export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3000'
  const protocol = headersList.get('x-forwarded-proto') || 'https'
  const baseUrl = `${protocol}://${host}`

  // Get sitemap list from cache
  let { data: siteMapData, exists } = await getCache({ key: 'DATA:SITEMAP' })
  let siteMapList: any[]
  if (!exists) {
    siteMapList = []
    generateSitemap().then(() => {})
  } else {
    try {
      siteMapList = JSON.parse(siteMapData as string)?.data
    } catch (e) {
      siteMapList = []
    }
  }

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1
    },
    // @ts-ignore
    ...siteMapList.map((item) => {
      let lastModifiedDateTime = item.lastModifiedDateTime
      try {
        lastModifiedDateTime = new Date(lastModifiedDateTime)
        if (isNaN(lastModifiedDateTime.getTime())) {
          lastModifiedDateTime = null
        }
      } catch (e) {
        lastModifiedDateTime = null
      }
      return {
        url: `${baseUrl}${item.path}`,
        lastModified: lastModifiedDateTime,
        changeFrequency: 'daily',
        priority: 0.8
      }
    })
  ]
}
