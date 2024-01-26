import axios from 'axios'
import type {NextApiRequest, NextApiResponse} from 'next'

import {checkAuthRoute, getAccessToken} from '.'
import apiConfig from '../../../config/api.config'
import {decryptData, encryptData} from '../../utils/oAuthHandler'
import assert from 'assert'
import siteConfig from '../../../config/site.config'
import {getCache, Session, setCache} from "../../utils/odAuthTokenStore";

/**
 * Extract the searched item's path in field 'parentReference' and convert it to the
 * absolute path represented in onedrive-docker-index
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

/**
 * Get item details (specifically, its path) by its unique ID in OneDrive
 * @param itemId Unique ID of the driveItem
 * @returns The driveItem object
 */
async function getFileDataById(itemId: string) {
    const accessToken = await getAccessToken()
    const itemApi = `${apiConfig.driveApi}/items/${itemId}`
    const {data} = await axios.get(itemApi, {
        headers: {Authorization: `Bearer ${accessToken}`},
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
    return data;
}

/**
 * Get cached item details (specifically, its path) by its unique ID in OneDrive
 * @param itemId
 * @returns The driveItem object
 */
async function getCachedFileDataById(itemId: string) {
    let {data, exists} = await getCache({key: `ITEM:${itemId}`})
    if (exists && data) {
        try {
            return JSON.parse(data);
        } catch (e) {
        }
    }
    data = await getFileDataById(itemId);
    setCache({key: `ITEM:${itemId}`, value: JSON.stringify(data), ex: 300}).then(() => {
    });
    return data
}


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Get access token from storage
    const accessToken = await getAccessToken()

    // Get item details (specifically, its path) by its unique ID in OneDrive
    const {id = ''} = req.query

    // Get session
    const sessionManager = new Session(req, res);
    const session = await sessionManager.getSession();
    const passKeys = session?.passKeys ?? {};

    // Set edge function caching for faster load times, check docs:
    // https://vercel.com/docs/concepts/functions/edge-caching
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('X-Need-NoCache', 'yes')

    if (typeof id === 'string') {
        let queryId: string;
        try {
            queryId = decryptData(id);
            // console.log(queryId);
            assert(queryId.match(/^[A-Za-z0-9]+$/))
        } catch (err) {
            res.status(400).json({error: 'Invalid driveItem ID.'})
            return;
        }

        try {
            const data = await getCachedFileDataById(queryId);

            const authPath = mapAbsolutePath(data?.parentReference?.path + '/placeholder');
            const check = await checkAuthRoute(decodeURIComponent(authPath), accessToken, '')

            // console.log(authPath, check);

            if (check.code !== 200) {
                if (check.code !== 401) {
                    res.status(check.code).json({error: check.message})
                    return
                }
                // Check user session
                const passKey = passKeys[check.authPath ?? ''] ?? '';
                if (!passKey) {
                    res.status(401).json({error: check.message})
                    return
                }
                if (check.password !== passKey) {
                    res.status(401).json({error: 'Password incorrect.'})
                    return
                }
            }

            res.status(200).json(data)
        } catch (error: any) {
            res.status(error?.response?.status ?? 500).json({error: error?.response?.data?.error ?? 'Internal server error.'})
        }
    } else {
        res.status(400).json({error: 'Invalid driveItem ID.'})
    }
    return
}
