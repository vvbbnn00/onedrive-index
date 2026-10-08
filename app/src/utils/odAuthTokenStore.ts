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

    set(..._args: any[]) {
        return Promise.resolve(null)
    }

    eval(..._args: any[]) { return Promise.resolve(0) }

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
    const refreshToken = accessToken ? null : await kv.get(`${siteConfig.kvPrefix}refresh_token`)

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
    if (typeof refreshToken === 'string' && refreshToken) await kv.set(`${siteConfig.kvPrefix}refresh_token`, refreshToken)
}

export async function getCache({key}: { key: string }): Promise<{ data: string | null, exists: number }> {
    const data = await kv.get(`${siteConfig.kvPrefix}_cache:${key}`);
    const exists = data === null ? 0 : 1;
    return {data, exists}
}

export async function setCache({key, value, ex = 300}: { key: string, value: any, ex?: number }): Promise<void> {
    await kv.set(`${siteConfig.kvPrefix}_cache:${key}`, value ?? '', 'EX', ex);
}



export async function acquireLock(key: string, ttl: number): Promise<string | null> {
    const owner = crypto.randomUUID()
    const result = await kv.set(`${siteConfig.kvPrefix}_lock:${key}`, owner, 'EX', ttl, 'NX')
    return result === 'OK' ? owner : null
}
export async function renewLock(key: string, owner: string, ttl: number): Promise<boolean> {
    return await kv.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end", 1, `${siteConfig.kvPrefix}_lock:${key}`, owner, ttl) === 1
}
export async function releaseLock(key: string, owner: string): Promise<void> {
    await kv.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, `${siteConfig.kvPrefix}_lock:${key}`, owner)
}
const sessionTtl = 60 * 60 * 24
export class Session {
    private session: any = null
    private loaded = false
    constructor(public req: NextApiRequest, public res: NextApiResponse) {}
    async createSession() {
        const data = { id: crypto.randomUUID().replace(/-/g, ''), createdAt: Date.now() }
        await kv.set(`${siteConfig.kvPrefix}_session:${data.id}`, JSON.stringify(data), 'EX', sessionTtl)
        this.session = data
        this.loaded = true
        this.res.setHeader('Set-Cookie', `NEXT_SESSION_ID=${data.id}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=${sessionTtl}`)
        return data
    }
    // Anonymous reads must not allocate Redis keys or emit cookies.
    async getSession(create = false): Promise<any> {
        if (!this.loaded) {
            this.loaded = true
            const id = this.req.cookies?.NEXT_SESSION_ID
            if (id && /^[a-zA-Z0-9]{32,64}$/.test(id)) {
                const raw = await kv.get(`${siteConfig.kvPrefix}_session:${id}`)
                try {
                    const value = raw ? JSON.parse(raw) : null
                    if (value?.id === id) this.session = value
                } catch { /* Treat malformed sessions as anonymous. */ }
            }
        }
        return this.session ?? (create ? this.createSession() : null)
    }
    async destroySession() {
        const id = this.req.cookies?.NEXT_SESSION_ID
        if (id) await kv.del(`${siteConfig.kvPrefix}_session:${id}`)
        this.session = null
        this.loaded = true
        this.res.setHeader('Set-Cookie', 'NEXT_SESSION_ID=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0')
    }
    async updateSession(data: any) {
        const current = await this.getSession(true)
        const session = { ...data, id: current.id, createdAt: current.createdAt }
        await kv.set(`${siteConfig.kvPrefix}_session:${session.id}`, JSON.stringify(session), 'EX', sessionTtl)
        this.session = session
        this.res.setHeader('Set-Cookie', `NEXT_SESSION_ID=${session.id}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=${sessionTtl}`)
    }
}
