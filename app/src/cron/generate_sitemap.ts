import { checkBuildStage } from '../utils/buildIdHelper'
import { posix as pathPosix } from 'path'
import { encodePath, getAccessToken, getAuthTokenPath } from '../pages/api'
import { now } from '../utils/loggerHelper'
import apiConfig from '../../config/api.config'
import axios from 'axios'
import siteConfig from '../../config/site.config'
import { getCache, setCache } from '../utils/odAuthTokenStore'


/**
 * A simple counter class, to prevent infinite loop
 */
class Counter {
  private count: number

  constructor() {
    this.count = 0
  }

  increment() {
    this.count++
  }

  get() {
    return this.count
  }
}


/**
 * Get file list from OneDrive API, used for server side rendering
 * @param query Query parameters
 * @returns File list
 */
async function getFileListSitemap(query: { path: any; next?: any; }) {
  // Add a random number at the end of the build stage check to prevent Next.js from caching the result
  if (checkBuildStage()) {
    console.log(' ✓ Build stage detected, getFileList will return false.')
    return false // If in build stage, return false to disable SSR
  }

  const { path = '/', next = '' } = query

  // Besides normalizing and making absolute, trailing slashes are trimmed
  const cleanPath = decodeURIComponent(pathPosix.resolve('/', pathPosix.normalize(path)).replace(/\/$/, ''))

  // Path shouldn't contain :
  if (cleanPath.includes(':')) {
    return false
  }

  const authTokenPathList = getAuthTokenPath(cleanPath)
  if (authTokenPathList.length > 0) {
    console.log(`[${now()}][Generate Sitemap][${cleanPath}] Skip Private Path.`)
    return false
  }

  const accessToken = await getAccessToken()

  // Return if no access token
  if (!accessToken) {
    console.error(`[${now()}][Generate Sitemap][${cleanPath}] Failed to get access token.`)
    return false
  }

  const requestPath = encodePath(cleanPath)

  // Handle response from OneDrive API
  const requestUrl = `${apiConfig.driveApi}/root${requestPath}`
  // Whether path is root, which requires some special treatment
  const isRoot = requestPath === ''

  // Querying current path identity (file or folder) and follow-up query children in folder
  try {
    console.info(`[${now()}][Generate Sitemap][${cleanPath}] Fetching file list.`)

    const { data: identityData } = await axios.get(requestUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: 'name,lastModifiedDateTime,folder'
      }
    })

    if ('folder' in identityData) {
      let folderData: any
      await Promise.all([
        folderData = (await axios.get(`${requestUrl}${isRoot ? '' : ':'}/children`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            ...{
              select: 'name,id,size,lastModifiedDateTime,folder,file,video,image',
              $top: siteConfig.maxItems
            },
            ...(next ? { $skipToken: next } : {})
          }
        })).data])

      folderData.value = folderData?.value?.map(item => {
        item.path = `${cleanPath}/${item.name}`

        // If path is in authTokenPathList, should add "Protected" tag
        if (getAuthTokenPath(item.path).length > 0) {
          item.protected = true
        }

        // If filename is .password, should add "Protected" tag
        if (item.name === '.password') {
          item.protected = true
        }

        return item
      })

      // Extract next page token from full @odata.nextLink
      const nextPage = folderData['@odata.nextLink']
        ? folderData['@odata.nextLink'].match(/&\$skiptoken=(.+)/i)[1]
        : null

      // Return paging token if specified
      if (nextPage) {
        return { folder: folderData, next: nextPage, lastModifiedDateTime: identityData?.lastModifiedDateTime }
      } else {
        return { folder: folderData, lastModifiedDateTime: identityData?.lastModifiedDateTime }
      }
    }


    // If filename is .password, should hide the quickXorHash and the size
    if (identityData.name === '.password') {
      delete identityData.file.hashes.quickXorHash
      identityData.size = 0
      identityData.protected = true
    }

    return { file: identityData, lastModifiedDateTime: identityData?.lastModifiedDateTime }
  } catch (error: any) {
    console.warn(`[${now()}][Generate Sitemap][${cleanPath}] Failed to get files, code %d, data: %s`, error?.response?.code ?? 500, JSON.stringify(error?.response?.data ?? 'Internal server error.'))
    return false
  }
}

/**
 * Get file list from OneDrive API recursively, used for server side rendering
 * @param query Query parameters
 * @param siteMapData File list
 * @param counter Counter, to prevent infinite loop
 */
async function getFileListSitemapRecursive(query: { path: any; }, siteMapData: any[], counter: Counter) {
  // Abort if counter exceeds 50000
  counter.increment()
  if (counter.get() > 50000) {
    console.warn(`[${now()}][Generate Sitemap][${query.path}] Counter exceeds 50000, in order to prevent infinite loop, aborting.`)
    return false
  }

  // Abort if file count exceeds 10000
  if (siteMapData.length > 10000) {
    console.warn(`[${now()}][Generate Sitemap][${query.path}] File count exceeds 10000, aborting.`)
    return false
  }

  const { path = '/' } = query
  const data = await getFileListSitemap({ path })

  if (!data) {
    return false
  }

  siteMapData.push({
    path,
    // @ts-ignore
    lastModifiedDateTime: data?.folder?.lastModifiedDateTime ?? data?.file?.lastModifiedDateTime ?? data?.lastModifiedDateTime
  })

  let nextCount = 0
  if (data.folder) {
    // Get next page recursively, up to 10 pages
    while (data.next && nextCount < 10) {
      console.info(`[${now()}][Generate Sitemap][${path}] Fetching next page, page count: %d`, nextCount)
      nextCount++
      const nextData = await getFileListSitemap({ path, next: data.next })
      if (nextData) {
        data.folder.value.push(...nextData.folder.value)
        data.next = nextData.next
      } else {
        break
      }
    }

    // Get children recursively, in a single thread
    for (const item of data.folder.value) {
      // Skip protected items
      if (item.protected) {
        console.info(`[${now()}][Generate Sitemap][${item.path}] Skip protected item.`)
        continue
      }

      if (item.folder) {
        console.info(`[${now()}][Generate Sitemap][${item.path}] Fetching children.`)
        const children = await getFileListSitemapRecursive({ path: item.path }, siteMapData, counter)
        if (children) {
          item.children = children
        }
      } else {
        console.info(`[${now()}][Generate Sitemap][${item.path}] Add file.`)
        siteMapData.push({
          path: item.path,
          lastModifiedDateTime: item.lastModifiedDateTime
        })
      }
    }
  }

  return data
}


/**
 * Start generating sitemap task.
 */
export default async function generateSitemap() {
  if (checkBuildStage()) {
    console.log(' ✓ Build stage detected, generateSitemap will return.')
    return
  }
  const generateSitemapTaskLock = await getCache({ key: 'CRON:GENERATE_SITEMAP' })
  if (generateSitemapTaskLock.exists) {
    console.log(`[${now()}][Generate Sitemap] Task is already running, aborting.`)
    return
  }
  // Set lock, max age is 1 hour, if error occurs, it will be unlocked after 1 hour
  await setCache({ key: 'CRON:GENERATE_SITEMAP', value: '1', ex: 3600 })
  try {
    console.info(`[${now()}][Generate Sitemap] Start.`)
    const sitemapData = []
    const counter = new Counter()

    // Recursively get file list
    await getFileListSitemapRecursive({ path: '/' }, sitemapData, counter)

    // Write data to cache, preserve for 7 days.
    setCache({
      key: 'DATA:SITEMAP', value: JSON.stringify({
        data: sitemapData,
        lastModifiedDateTime: new Date().toISOString()
      }),
      ex: 7 * 24 * 60 * 60
    }).then(() => {
      console.info(`[${now()}][Generate Sitemap] Cache updated.`)
    })

  } catch (e) {
    console.error(`[${now()}][Generate Sitemap] Error: %s`, e)
  } finally {
    // Unlock
    await setCache({ key: 'CRON:GENERATE_SITEMAP', value: '0', ex: 1 })
    console.info(`[${now()}][Generate Sitemap] End.`)
  }
}


