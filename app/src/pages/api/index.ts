import {posix as pathPosix} from 'path'

import type {NextApiRequest, NextApiResponse} from 'next'
import axios from 'axios'

import apiConfig from '../../../config/api.config'
import siteConfig from '../../../config/site.config'
import {encryptData, getAuthPersonInfo} from '../../utils/oAuthHandler'
import {encryptToken} from '../../utils/protectedRouteHandler'
import {getCache, getOdAuthTokens, Session, setCache, storeOdAuthTokens} from '../../utils/odAuthTokenStore'
import {now} from "../../utils/loggerHelper";
import {checkBuildStage} from "../../utils/buildIdHelper";

/**
 * Check if the application is installed by checking if the access token is valid
 * @returns Whether the application is installed
 */
async function checkInstalled(): Promise<boolean> {
    const access_token = await getAccessToken();
    if (!access_token) return false;
    try {
        const {status} = await getAuthPersonInfo(access_token);
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
    const {accessToken, refreshToken} = await getOdAuthTokens()

    if (!apiConfig.clientId || !clientSecret) {
        console.error('clientId or clientSecret not set!')
        return ''
    }

    // Return in storage access token if it is still valid
    if (typeof accessToken === 'string') {
        // console.log('Fetch access token from storage.')
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
            const {expires_in, access_token, refresh_token} = resp.data
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
export function getAuthTokenPath(path: string): string[] {
    // Ensure trailing slashes to compare paths component by component. Same for protectedRoutes.
    // Since OneDrive ignores case, lower case before comparing. Same for protectedRoutes.
    path = path.toLowerCase() + '/'
    const protectedRoutes = siteConfig.protectedRoutes as string[]
    let authTokenPath: string[] = [];
    for (let r of protectedRoutes) {
        r = r.toLowerCase()
        if (!path.startsWith(r)) {
            continue
        }
        authTokenPath.push(`${r}.password`)
        path = path.substring(0, path.length - 1)
        while (path.startsWith(r)) {
            authTokenPath.push(`${path}/.password`)
            const lastSlash = path.lastIndexOf('/')
            path = path.substring(0, lastSlash)
        }
        break
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
 * @param odTokenHeader od-protected-token header, which is the SHA384 hash of the .password file
 */
export async function checkAuthRoute(
    cleanPath: string,
    accessToken: string,
    odTokenHeader: string
): Promise<{
    code: 200 | 401 | 404 | 500 | 403;
    message: string;
    needAuth: boolean;
    authPath: string | null;
    password: string | null
}> {
    // Handle authentication through .password
    const authTokenPathList = getAuthTokenPath(cleanPath)

    // Fetch password from remote file content
    if (authTokenPathList.length === 0) {
        return {code: 200, message: 'Not Match', needAuth: false, authPath: null, password: null}
    }

    let odProtectedToken: string | null = null;
    let authPath: string | null = null;
    for (let authTokenPath of authTokenPathList) {
        try {
            const {data: cachedToken, exists} = await getCache({key: `TOKEN:${authTokenPath}`})

            authPath = authTokenPath
            if (!exists) {
                const token = await axios.get(`${apiConfig.driveApi}/root${encodePath(authTokenPath)}`, {
                    headers: {Authorization: `Bearer ${accessToken}`},
                    params: {
                        select: '@microsoft.graph.downloadUrl,file',
                    },
                })

                // Handle request and check for header 'od-protected-token'
                const odProtectedTokenResponse = await axios.get(token.data['@microsoft.graph.downloadUrl'])
                odProtectedToken = odProtectedTokenResponse.data.toString()
                setCache({
                    key: `TOKEN:${authTokenPath}`,
                    value: odProtectedToken,
                    ex: 600
                }).then(() => {
                })
                break;
            } else {
                if (!cachedToken || cachedToken === '') {
                    continue;
                }
                odProtectedToken = cachedToken!
                break;
            }

            // console.log(JSON.stringify(odProtectedToken), authTokenPath)
        } catch (error: any) {
            // Password file not found, fallback to 404
            if (error?.response?.status === 404) {
                // console.warn('Password file not found.', authTokenPath)
                setCache({
                    key: `TOKEN:${authTokenPath}`,
                    value: null,
                    ex: 600
                }).then(() => {
                })
            } else {
                console.warn('[axios.get] .password', JSON.stringify(error.message))
            }
        }
    }

    // console.log('path', cleanPath, 'authPath', authPath, 'odProtectedToken', odProtectedToken)

    if (!odProtectedToken) {
        return {code: 403, message: 'No Valid Password.', needAuth: true, authPath: authPath, password: null}
    }

    return {
        code: 401,
        message: 'Password required.',
        needAuth: true,
        authPath: authPath,
        password: odProtectedToken
    }
}

/**
 * Get file content from cache
 * @param path Path to file
 */
async function getFileTextFromCache(path: string) {
    const {data: cache, exists: cache_exists} = await getCache({
        key: 'F_' + path
    });
    // console.log(path, cache_exists)
    if (cache_exists) return cache;

    try {
        const accessToken = await getAccessToken()
        const {data} = await axios.get(`${apiConfig.driveApi}/root${path}`, {
            headers: {Authorization: `Bearer ${accessToken}`},
            params: {
                // OneDrive international version fails when only selecting the downloadUrl (what a stupid bug)
                select: 'id,size,@microsoft.graph.downloadUrl',
            },
        })
        if ('@microsoft.graph.downloadUrl' in data) {
            // Only proxy raw file content response for files up to 4MB
            if ('size' in data && data['size'] < 4194304) {
                const {data: stream} = await axios.get(data['@microsoft.graph.downloadUrl'] as string, {
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
        // console.warn('axios.get readme.md', JSON.stringify(error.message))
        if (error?.response?.status === 404) {
            setCache({
                key: 'F_' + path,
                value: ''
            })
        }
        return ''
    }
}


/**
 * Get file list from OneDrive API, used for server side rendering
 * @param query Query parameters
 * @returns File list
 */
export async function getFileList(query: { path: any; next?: any; sort?: any }) {
    // Add a random number at the end of the build stage check to prevent Next.js from caching the result
    if (checkBuildStage()) {
        console.log(' ✓ Build stage detected, getFileList will return false.')
        return false // If in build stage, return false to disable SSR
    }

    const {path = '/', next = '', sort = ''} = query

    // Invalid requests doesn't support SSR
    if (path === '[...path]') {
        return false
    }

    // Besides normalizing and making absolute, trailing slashes are trimmed
    const cleanPath = decodeURIComponent(pathPosix.resolve('/', pathPosix.normalize(path)).replace(/\/$/, ''))

    // Path shoudn't cotain :
    if (cleanPath.includes(':')) {
        return false
    }

    const authTokenPathList = getAuthTokenPath(cleanPath)
    if (authTokenPathList.length > 0) {
        console.info(`[${now()}][PRIVATE][Path:${cleanPath}](getFileList) Protected route, return empty file list.`)
        return false
    }

    const accessToken = await getAccessToken()

    // Return error 403 if access_token is empty
    if (!accessToken) {
        return false
    }

    const requestPath = encodePath(cleanPath)
    // console.debug('requestPath SSRAPI', requestPath);

    // Handle response from OneDrive API
    const requestUrl = `${apiConfig.driveApi}/root${requestPath}`
    // Whether path is root, which requires some special treatment
    const isRoot = requestPath === ''

    let readme = '', head = '';

    // Querying current path identity (file or folder) and follow up query childrens in folder
    try {
        console.info(`[${now()}][PUBLIC][Path:${cleanPath}](getFileList) Access.`)

        const {data: identityData} = await axios.get(requestUrl, {
            headers: {Authorization: `Bearer ${accessToken}`},
            params: {
                select: 'name,id,size,lastModifiedDateTime,folder,file,video,image',
            },
        })

        if ('folder' in identityData) {
            let folderData: any;
            await Promise.all([
                readme = await getFileTextFromCache(encodePath(cleanPath + '/readme.md')),
                head = await getFileTextFromCache(encodePath(cleanPath + '/head.md')),
                folderData = (await axios.get(`${requestUrl}${isRoot ? '' : ':'}/children`, {
                    headers: {Authorization: `Bearer ${accessToken}`},
                    params: {
                        ...{
                            select: 'name,id,size,lastModifiedDateTime,folder,file,video,image',
                            $top: siteConfig.maxItems,
                        },
                        ...(next ? {$skipToken: next} : {}),
                        ...(sort ? {$orderby: sort} : {}),
                    },
                })).data]);

            delete folderData['@odata.context']
            folderData.value = folderData?.value?.map(item => {
                delete item['@odata.etag']
                item.id = encryptData(item.id)

                // If filename is .password, should hide the quickXorHash and the size, add "Protected" tag
                if (item.name === '.password') {
                    delete item.file.hashes.quickXorHash
                    item.size = 0
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
                return {folder: folderData, next: nextPage, readme, head, title: identityData.name}
            } else {
                return {folder: folderData, readme, head, title: identityData.name}
            }
        }

        delete identityData['@odata.context']
        delete identityData['@odata.etag']
        identityData.id = encryptData(identityData.id)

        // If filename is .password, should hide the quickXorHash and the size
        if (identityData.name === '.password') {
            delete identityData.file.hashes.quickXorHash
            identityData.size = 0
            identityData.protected = true
        }

        return {file: identityData, title: identityData.name}
    } catch (error: any) {
        console.warn(`[${now()}][PUBLIC][${cleanPath}](getFileList) Failed to get files, code %d, data: %s`, error?.response?.code ?? 500, JSON.stringify(error?.response?.data ?? 'Internal server error.'))
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

        const {obfuscatedAccessToken, accessTokenExpiry, obfuscatedRefreshToken} = req.body
        const accessToken = obfuscatedAccessToken
        const refreshToken = obfuscatedRefreshToken

        // verify identity of the authenticated user with the Microsoft Graph API
        const {data, status} = await getAuthPersonInfo(accessToken)
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

        await storeOdAuthTokens({accessToken, accessTokenExpiry, refreshToken})
        res.status(200).send('OK')
        return
    }

    // If method is GET, then the API is a normal request to the OneDrive API for files or folders
    const {path = '/', next = '', sort = ''} = req.query

    const sessionManager = new Session(req, res);
    const session = await sessionManager.getSession();

    // Set edge function caching for faster load times, check docs:
    // https://vercel.com/docs/concepts/functions/edge-caching
    res.setHeader('Cache-Control', apiConfig.cacheControlHeader)

    // Sometimes the path parameter is defaulted to '[...path]' which we need to handle
    if (path === '[...path]') {
        res.status(400).json({error: 'No path specified.'})
        return
    }
    // If the path is not a valid path, return 400
    if (typeof path !== 'string') {
        res.status(400).json({error: 'Path query invalid.'})
        return
    }
    // Besides normalizing and making absolute, trailing slashes are trimmed
    const cleanPath = pathPosix.resolve('/', pathPosix.normalize(path)).replace(/\/$/, '')

    // Path shoudn't cotain :
    if (cleanPath.includes(':')) {
        res.status(400).json({error: 'Path invalid.'})
        return
    }

    const accessToken = await getAccessToken()

    // Return error 403 if access_token is empty
    if (!accessToken) {
        res.status(403).json({error: 'No access token.'})
        return
    }

    // Handle protected routes authentication
    const {
        code,
        message,
        authPath,
        needAuth,
        password
    } = await checkAuthRoute(cleanPath, accessToken, '')
    // Status code other than 200 means user has not authenticated yet
    if (code !== 200 && code !== 401) {
        res.status(code).json({error: message, authPath, needAuth})
        return
    }

    // Check user session
    const passKeys = session?.passKeys ?? {};
    const passKey = passKeys[authPath ?? ''] ?? '';
    if (needAuth && !passKey) {
        res.status(401).json({error: message, authPath, needAuth})
        return
    }
    if (password !== passKey && password !== null && needAuth) {
        res.status(401).json({error: 'Password incorrect.', authPath, needAuth})
        return
    }

    // If message is empty, then the path is not protected.
    // Conversely, protected routes are not allowed to serve from cache.
    if (message !== '') {
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('X-Need-NoCache', 'yes')  // Add an extra header
    }

    console.info(`[${now()}][${needAuth ? 'PRIVATE' : 'PUBLIC'}][Path:${cleanPath}] Access.`)

    const requestPath = encodePath(cleanPath)
    // Handle response from OneDrive API
    const requestUrl = `${apiConfig.driveApi}/root${requestPath}`
    // Whether path is root, which requires some special treatment
    const isRoot = requestPath === ''

    // Querying current path identity (file or folder) and follow up query childrens in folder
    try {
        const {data: identityData} = await axios.get(requestUrl, {
            headers: {Authorization: `Bearer ${accessToken}`},
            params: {
                select: 'name,id,size,lastModifiedDateTime,folder,file,video,image',
            },
        })

        if ('folder' in identityData) {
            const {data: folderData} = await axios.get(`${requestUrl}${isRoot ? '' : ':'}/children`, {
                headers: {Authorization: `Bearer ${accessToken}`},
                params: {
                    ...{
                        select: 'name,id,size,lastModifiedDateTime,folder,file,video,image',
                        $top: siteConfig.maxItems,
                    },
                    ...(next ? {$skipToken: next} : {}),
                    ...(sort ? {$orderby: sort} : {}),
                },
            })

            delete folderData['@odata.context']
            folderData.value = folderData?.value?.map(item => {
                delete item['@odata.etag']

                if (password) {
                    item.odpt = encryptToken({
                        token: password!,
                        fileId: item.id
                    })
                }
                item.id = encryptData(item.id)

                // If filename is .password, should hide the quickXorHash and the size, add "Protected" tag
                if (item.name === '.password') {
                    delete item.file.hashes.quickXorHash
                    item.size = 0
                    item.protected = true
                    delete item.odpt
                }

                return item
            })

            // Extract next page token from full @odata.nextLink
            const nextPage = folderData['@odata.nextLink']
                ? folderData['@odata.nextLink'].match(/&\$skiptoken=(.+)/i)[1]
                : null

            // Return paging token if specified
            if (nextPage) {
                res.status(200).json({folder: folderData, next: nextPage})
            } else {
                res.status(200).json({folder: folderData})
            }
            return
        }
        delete identityData['@odata.context']
        delete identityData['@odata.etag']

        const fileId = identityData.id;
        if (password) {
            identityData.odpt = encryptToken({
                token: password!,
                fileId
            })
        }
        identityData.id = encryptData(identityData.id)

        // If filename is .password, should hide the quickXorHash and the size
        if (identityData.name === '.password') {
            delete identityData.file.hashes.quickXorHash
            identityData.size = 0
            identityData.protected = true
        }

        res.status(200).json({file: identityData})
        return
    } catch (error: any) {
        res.status(error?.response?.status ?? 500).json({
            error: error?.response?.data?.error ?? 'Internal server error.'
        })
        return
    }
}
