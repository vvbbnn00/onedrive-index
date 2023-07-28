import { posix as pathPosix } from 'path'

import type { NextApiRequest, NextApiResponse } from 'next'
import axios from 'axios'

import apiConfig from '../../../config/api.config'
import siteConfig from '../../../config/site.config'
import { encryptData, getAuthPersonInfo } from '../../utils/oAuthHandler'
import { compareHashedToken } from '../../utils/protectedRouteHandler'
import { getCache, getOdAuthTokens, setCache, storeOdAuthTokens } from '../../utils/odAuthTokenStore'
import { runCorsMiddleware } from './raw'

// import CryptoJS from 'crypto-js'
// const AES_SECRET_KEY = 'onedrive-vercel-index'

async function checkInstalled(): Promise<boolean> {
  const access_token = await getAccessToken();
  if (!access_token) return false;
  try {
    const { status } = await getAuthPersonInfo(access_token);
    if (status !== 200) return false;
  } catch (error: any) {
    return false;
  }
  return true;
}

const basePath = pathPosix.resolve('/', siteConfig.baseDirectory)
const clientSecret = apiConfig.clientSecret

/**
 * Encode the path of the file relative to the base directory
 *
 * @param path Relative path of the file to the base directory
 * @returns Absolute path of the file inside OneDrive
 */
export function encodePath(path: string): string {
  let encodedPath = pathPosix.join(basePath, path)
  if (encodedPath === '/' || encodedPath === '') {
    return ''
  }
  encodedPath = encodedPath.replace(/\/$/, '')
  return `:${encodeURIComponent(encodedPath)}`
}

/**
 * Fetch the access token from Redis storage and check if the token requires a renew
 *
 * @returns Access token for OneDrive API
 */
export async function getAccessToken(): Promise<string> {
  const { accessToken, refreshToken } = await getOdAuthTokens()

  if (!apiConfig.clientId || !clientSecret) {
    console.error('clientId or clientSecret not set!')
    return ''
  }

  // Return in storage access token if it is still valid
  if (typeof accessToken === 'string') {
    console.log('Fetch access token from storage.')
    return accessToken
  }

  // Return empty string if no refresh token is stored, which requires the application to be re-authenticated
  if (typeof refreshToken !== 'string') {
    console.log('No refresh token, return empty access token.')
    return ''
  }

  // Fetch new access token with in storage refresh token
  const body = new URLSearchParams()
  body.append('client_id', apiConfig.clientId)
  body.append('redirect_uri', apiConfig.redirectUri)
  body.append('client_secret', clientSecret)
  body.append('refresh_token', refreshToken)
  body.append('grant_type', 'refresh_token')

  try {
    const resp = await axios.post(apiConfig.authApi, body, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    if ('access_token' in resp.data && 'refresh_token' in resp.data) {
      const { expires_in, access_token, refresh_token } = resp.data
      await storeOdAuthTokens({
        accessToken: access_token,
        accessTokenExpiry: parseInt(expires_in),
        refreshToken: refresh_token,
      })
      console.log('Fetch new access token with stored refresh token.')
      return access_token
    }
  } catch (error: any) {
    console.warn(error?.response?.data ?? 'Internal server error.');
    return ''
  }

  return ''
}

/**
 * Match protected routes in site config to get path to required auth token
 * @param path Path cleaned in advance
 * @returns Path to required auth token. If not required, return empty string.
 */
export function getAuthTokenPath(path: string) {
  // Ensure trailing slashes to compare paths component by component. Same for protectedRoutes.
  // Since OneDrive ignores case, lower case before comparing. Same for protectedRoutes.
  path = path.toLowerCase() + '/'
  const protectedRoutes = siteConfig.protectedRoutes as string[]
  let authTokenPath = ''
  for (let r of protectedRoutes) {
    if (typeof r !== 'string') continue
    r = r.toLowerCase().replace(/\/$/, '') + '/'
    if (path.startsWith(r)) {
      authTokenPath = `${r}.password`
      break
    }
  }
  return authTokenPath
}

/**
 * Handles protected route authentication:
 * - Match the cleanPath against an array of user defined protected routes
 * - If a match is found:
 * - 1. Download the .password file stored inside the protected route and parse its contents
 * - 2. Check if the od-protected-token header is present in the request
 * - The request is continued only if these two contents are exactly the same
 *
 * @param cleanPath Sanitised directory path, used for matching whether route is protected
 * @param accessToken OneDrive API access token
 * @param req Next.js request object
 * @param res Next.js response object
 */
export async function checkAuthRoute(
  cleanPath: string,
  accessToken: string,
  odTokenHeader: string
): Promise<{ code: 200 | 401 | 404 | 500; message: string }> {
  // Handle authentication through .password
  const authTokenPath = getAuthTokenPath(cleanPath)

  // Fetch password from remote file content
  if (authTokenPath === '') {
    return { code: 200, message: '' }
  }

  try {
    const token = await axios.get(`${apiConfig.driveApi}/root${encodePath(authTokenPath)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: '@microsoft.graph.downloadUrl,file',
      },
    })

    // Handle request and check for header 'od-protected-token'
    const odProtectedToken = await axios.get(token.data['@microsoft.graph.downloadUrl'])
    // console.log(odTokenHeader, odProtectedToken.data.trim())

    if (
      !compareHashedToken({
        odTokenHeader: odTokenHeader,
        dotPassword: odProtectedToken.data.toString(),
      })
    ) {
      return { code: 401, message: 'Password required.' }
    }
  } catch (error: any) {
    // Password file not found, fallback to 404
    if (error?.response?.status === 404) {
      return { code: 404, message: "You didn't set a password." }
    } else {
      return { code: 500, message: 'Internal server error.' }
    }
  }

  return { code: 200, message: 'Authenticated.' }
}


async function getFileTextFromCache(path) {
  const { data: cache, exists: cache_exists } = await getCache({
    key: 'F_' + path
  });
  // console.log(path, cache_exists)
  if (cache_exists) return cache;

  try {
    const accessToken = await getAccessToken()
    const { data } = await axios.get(`${apiConfig.driveApi}/root${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        // OneDrive international version fails when only selecting the downloadUrl (what a stupid bug)
        select: 'id,size,@microsoft.graph.downloadUrl',
      },
    })
    if ('@microsoft.graph.downloadUrl' in data) {
      // Only proxy raw file content response for files up to 4MB
      if ('size' in data && data['size'] < 4194304) {
        const { data: stream } = await axios.get(data['@microsoft.graph.downloadUrl'] as string, {
          responseType: 'text',
        })
        setCache({
          key: 'F_' + path,
          value: stream
        })
        return stream
      }
      return ''
    }
  } catch (error: any) {
    console.warn('axios.get readme.md', JSON.stringify(error.message))
    if (error?.response?.status === 404) {
      setCache({
        key: 'F_' + path,
        value: ''
      })
    }
    return ''
  }
}


export async function getFileList(query) {
  const { path = '/', next = '', sort = '' } = query

  // Invalid requests doesn't support SSR
  if (path === '[...path]') {
    return false
  }
  if (typeof path !== 'string') {
    return false
  }

  // Besides normalizing and making absolute, trailing slashes are trimmed
  const cleanPath = decodeURIComponent(pathPosix.resolve('/', pathPosix.normalize(path)).replace(/\/$/, ''))

  // Validate sort param
  if (typeof sort !== 'string') {
    return false
  }

  const accessToken = await getAccessToken()

  // Return error 403 if access_token is empty
  if (!accessToken) {
    return false
  }

  // Handle protected routes authentication
  const { code } = await checkAuthRoute(cleanPath, accessToken, '')
  // Status code other than 200 means user has not authenticated yet
  if (code !== 200) {
    return false
  }

  const requestPath = encodePath(cleanPath)
  console.debug('requestPath SSRAPI', requestPath);

  // Handle response from OneDrive API
  const requestUrl = `${apiConfig.driveApi}/root${requestPath}`
  // Whether path is root, which requires some special treatment
  const isRoot = requestPath === ''

  let readme = '', head = '';

  // Querying current path identity (file or folder) and follow up query childrens in folder
  try {
    const { data: identityData } = await axios.get(requestUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: 'name,id,size,lastModifiedDateTime,folder,file,video,image',
      },
    })

    if ('folder' in identityData) {
      readme = await getFileTextFromCache(encodePath(cleanPath + '/readme.md'));
      head = await getFileTextFromCache(encodePath(cleanPath + '/head.md'));

      const { data: folderData } = await axios.get(`${requestUrl}${isRoot ? '' : ':'}/children`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          ...{
            select: 'name,id,size,lastModifiedDateTime,folder,file,video,image',
            $top: siteConfig.maxItems,
          },
          ...(next ? { $skipToken: next } : {}),
          ...(sort ? { $orderby: sort } : {}),
        },
      })

      delete folderData['@odata.context']
      folderData.value = folderData?.value?.map(item => {
        delete item['@odata.etag']
        item.id = encryptData(item.id)
        return item
      })

      // Extract next page token from full @odata.nextLink
      const nextPage = folderData['@odata.nextLink']
        ? folderData['@odata.nextLink'].match(/&\$skiptoken=(.+)/i)[1]
        : null

      // Return paging token if specified
      if (nextPage) {
        return { folder: folderData, next: nextPage, readme, head }
      } else {
        return { folder: folderData, readme, head }
      }
    }

    delete identityData['@odata.context']
    delete identityData['@odata.etag']
    identityData.id = encryptData(identityData.id)
    return { file: identityData }
  } catch (error: any) {
    console.warn('Failed to get files, code %d, data: %s', error?.response?.code ?? 500, JSON.stringify(error?.response?.data ?? 'Internal server error.'))
    return false
  }
}


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // If method is POST, then the API is called by the client to store acquired tokens
  if (req.method === 'POST') {

    // Only when the token is invalid can reset it.
    if (await checkInstalled()) {
      res.status(403).send('You don\'t have the permission to do that.');
      return
    }

    const { obfuscatedAccessToken, accessTokenExpiry, obfuscatedRefreshToken } = req.body
    const accessToken = obfuscatedAccessToken
    const refreshToken = obfuscatedRefreshToken

    // verify identity of the authenticated user with the Microsoft Graph API
    const { data, status } = await getAuthPersonInfo(accessToken)
    if (status !== 200) {
      res.status(500).send('Error validating identify.');
      return
    }
    if (data.userPrincipalName !== siteConfig.userPrincipalName) {
      res.status(403).send('You don\'t have the permission to do that.');
      return
    }

    if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
      res.status(400).send('Invalid request body')
      return
    }

    await storeOdAuthTokens({ accessToken, accessTokenExpiry, refreshToken })
    res.status(200).send('OK')
    return
  }

  // If method is GET, then the API is a normal request to the OneDrive API for files or folders
  const { path = '/', next = '', sort = '' } = req.query

  // Set edge function caching for faster load times, check docs:
  // https://vercel.com/docs/concepts/functions/edge-caching
  res.setHeader('Cache-Control', apiConfig.cacheControlHeader)

  // Sometimes the path parameter is defaulted to '[...path]' which we need to handle
  if (path === '[...path]') {
    res.status(400).json({ error: 'No path specified.' })
    return
  }
  // If the path is not a valid path, return 400
  if (typeof path !== 'string') {
    res.status(400).json({ error: 'Path query invalid.' })
    return
  }
  // Besides normalizing and making absolute, trailing slashes are trimmed
  const cleanPath = pathPosix.resolve('/', pathPosix.normalize(path)).replace(/\/$/, '')

  // Validate sort param
  if (typeof sort !== 'string') {
    res.status(400).json({ error: 'Sort query invalid.' })
    return
  }

  const accessToken = await getAccessToken()

  // Return error 403 if access_token is empty
  if (!accessToken) {
    res.status(403).json({ error: 'No access token.' })
    return
  }

  // Handle protected routes authentication
  const { code, message } = await checkAuthRoute(cleanPath, accessToken, req.headers['od-protected-token'] as string)
  // Status code other than 200 means user has not authenticated yet
  if (code !== 200) {
    res.status(code).json({ error: message })
    return
  }
  // If message is empty, then the path is not protected.
  // Conversely, protected routes are not allowed to serve from cache.
  if (message !== '') {
    res.setHeader('Cache-Control', 'no-cache')
  }

  const requestPath = encodePath(cleanPath)
  // Handle response from OneDrive API
  const requestUrl = `${apiConfig.driveApi}/root${requestPath}`
  // Whether path is root, which requires some special treatment
  const isRoot = requestPath === ''

  // Querying current path identity (file or folder) and follow up query childrens in folder
  try {
    const { data: identityData } = await axios.get(requestUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: 'name,size,lastModifiedDateTime,folder,file,video,image',
      },
    })

    if ('folder' in identityData) {
      const { data: folderData } = await axios.get(`${requestUrl}${isRoot ? '' : ':'}/children`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          ...{
            select: 'name,id,size,lastModifiedDateTime,folder,file,video,image',
            $top: siteConfig.maxItems,
          },
          ...(next ? { $skipToken: next } : {}),
          ...(sort ? { $orderby: sort } : {}),
        },
      })

      delete folderData['@odata.context']
      folderData.value = folderData?.value?.map(item => {
        delete item['@odata.etag']
        item.id = encryptData(item.id)
        return item
      })

      // Extract next page token from full @odata.nextLink
      const nextPage = folderData['@odata.nextLink']
        ? folderData['@odata.nextLink'].match(/&\$skiptoken=(.+)/i)[1]
        : null

      // Return paging token if specified
      if (nextPage) {
        res.status(200).json({ folder: folderData, next: nextPage })
      } else {
        res.status(200).json({ folder: folderData })
      }
      return
    }
    delete identityData['@odata.context']
    delete identityData['@odata.etag']
    identityData.id = encryptData(identityData.id)
    res.status(200).json({ file: identityData })
    return
  } catch (error: any) {
    res.status(error?.response?.status ?? 500).json({ error: error?.response?.data?.error ?? 'Internal server error.' })
    return
  }
}
