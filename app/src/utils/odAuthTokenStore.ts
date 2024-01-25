import Redis from 'ioredis'
import siteConfig from '../../config/site.config'
import type {NextApiRequest, NextApiResponse} from "next";
import crypto from "crypto";
import {checkBuildStage} from "./buildIdHelper";

// If in build stage, use a null Redis client
class NullRedis {
    constructor() {
        console.log(' ✓ Build stage detected, using NullRedis.')
    }

    get() {
        return Promise.resolve(null)
    }

    set() {
        return Promise.resolve(null)
    }

    exists() {
        return Promise.resolve(0)
    }

    del() {
        return Promise.resolve(null)
    }

    expire() {
        return Promise.resolve(null)
    }
}


// Persistent key-value store is provided by Redis, hosted on Upstash
// https://vercel.com/integrations/upstash
let kv: NullRedis | Redis;
// Add a random number at the end of the build stage check to prevent Next.js from caching the result
if (checkBuildStage()) {
    kv = new NullRedis()
} else {
    kv = new Redis(process.env.REDIS_URL || '')
}

export async function getOdAuthTokens(): Promise<{ accessToken: unknown; refreshToken: unknown }> {
    const accessToken = await kv.get(`${siteConfig.kvPrefix}access_token`)
    const refreshToken = await kv.get(`${siteConfig.kvPrefix}refresh_token`)

    return {
        accessToken,
        refreshToken,
    }
}

export async function storeOdAuthTokens({
                                            accessToken,
                                            accessTokenExpiry,
                                            refreshToken,
                                        }: {
    accessToken: string
    accessTokenExpiry: number
    refreshToken: string
}): Promise<void> {
    await kv.set(`${siteConfig.kvPrefix}access_token`, accessToken, 'EX', accessTokenExpiry)
    await kv.set(`${siteConfig.kvPrefix}refresh_token`, refreshToken)
}

export async function getCache({key}: { key: string }): Promise<{ data: string | null, exists: number }> {
    const data = await kv.get(`${siteConfig.kvPrefix}_cache:${key}`);
    const exists = await kv.exists(`${siteConfig.kvPrefix}_cache:${key}`);
    return {data, exists}
}

export async function setCache({key, value, ex = 300}: { key: string, value: any, ex?: number }): Promise<void> {
    await kv.set(`${siteConfig.kvPrefix}_cache:${key}`, value, 'EX', ex);
}


export class Session {
    req: NextApiRequest;
    res: NextApiResponse;

    constructor(req: NextApiRequest, res: NextApiResponse) {
        this.req = req;
        this.res = res;
    }

    async createSession() {
        const sessionId = Date.now().toString(36) + crypto.randomUUID().replace(/-/g, '');
        const data = {
            id: sessionId,
            createdAt: Date.now(),
        };
        await kv.set(`${siteConfig.kvPrefix}_session:${sessionId}`, JSON.stringify(data), 'EX', 60 * 60 * 24);
        this.res.setHeader('Set-Cookie', `NEXT_SESSION_ID=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=${60 * 60 * 24 * 365 * 1000}`);
        return data;
    }


    async getSession() {
        const sessionId = this.req.cookies?.NEXT_SESSION_ID;
        if (!sessionId) {
            return this.createSession();
        }
        const session = await kv.get(`${siteConfig.kvPrefix}_session:${sessionId}`);
        if (!session) {
            return this.createSession();
        }
        try {
            const sessionData = JSON.parse(session);
            kv.expire(`${siteConfig.kvPrefix}_session:${sessionId}`, 60 * 60 * 24 * 30);
            return sessionData;
        } catch (e) {
            return this.createSession();
        }
    }


    async destroySession() {
        const sessionId = this.req.cookies?.NEXT_SESSION_ID;
        if (!sessionId) {
            return;
        }
        await kv.del(`${siteConfig.kvPrefix}_session:${sessionId}`);
        this.res.setHeader('Set-Cookie', `NEXT_SESSION_ID=; Path=/; HttpOnly; SameSite=Strict; Secure; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
    }


    async updateSession(data: any) {
        let session = await this.getSession();
        session = {
            id: session.id,
            createdAt: session.createdAt,
            ...data,
        }
        await kv.set(`${siteConfig.kvPrefix}_session:${session?.id}`, JSON.stringify(session), 'EX', 60 * 60 * 24);
    }
}
