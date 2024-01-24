import type {NextApiRequest, NextApiResponse} from "next";
import {getCache, Session, setCache} from "../../utils/odAuthTokenStore";
import axios from "axios";
import apiConfig from "../../../config/api.config";
import {encodePath, getAccessToken} from "./index";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const sessionManager = new Session(req, res);
    const session = await sessionManager.getSession();

    if (req.method !== 'POST' && req.method !== 'DELETE') {
        res.status(405).json({error: 'Invalid request method.'})
        return
    }

    if (req.method === 'DELETE') {
        await sessionManager.destroySession();
        res.status(200).json({success: true})
        return
    }

    const {token, path} = req.body;
    if (!token || !path) {
        res.status(400).json({error: 'Invalid request body.'})
        return
    }

    // Check Whether the password file ends with /.password
    if (!path.endsWith('/.password')) {
        res.status(400).json({error: 'Invalid password file.'})
        return
    }

    // Prevent directory traversal
    if (path.includes('../') || path.includes(':') || path.includes('..\\')) {
        res.status(400).json({error: 'Invalid password file.'})
        return
    }

    const accessToken = await getAccessToken()

    // Return error 403 if access_token is empty
    if (!accessToken) {
        res.status(403).json({error: 'No access token.'})
        return
    }

    let odProtectedToken = ''

    try {
        const {data: cachedToken, exists} = await getCache({key: `TOKEN:${path}`})
        if (!exists && cachedToken === null) {
            const token = await axios.get(`${apiConfig.driveApi}/root${encodePath(path)}`, {
                headers: {Authorization: `Bearer ${accessToken}`},
                params: {
                    select: '@microsoft.graph.downloadUrl,file',
                },
            })

            // Handle request and check for header 'od-protected-token'
            const odProtectedTokenResponse = await axios.get(token.data['@microsoft.graph.downloadUrl'])
            odProtectedToken = odProtectedTokenResponse.data.toString()
            setCache({
                key: `TOKEN:${path}`,
                value: odProtectedToken,
                ex: 600
            }).then(() => {
            })
        } else {
            odProtectedToken = cachedToken!
        }
    } catch (error: any) {
        // Password file not found, fallback to 404
        if (error?.response?.status === 404) {
            console.warn('Password file not found.', path)
            res.status(401).json({error: 'Password file not found.'})
        } else {
            console.warn('axios.get .password', JSON.stringify(error.message))
            res.status(500).json({error: 'Internal server error.'})
        }
    }

    // Compare the two tokens
    if (odProtectedToken !== token) {
        res.status(401).json({error: 'Incorrect password.'})
        return
    }

    session.passKeys = session?.passKeys || {}
    session.passKeys[path] = token
    await sessionManager.updateSession(session);

    // Password correct, return 200
    res.status(200).json({success: true})
}
