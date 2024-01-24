import {HmacSHA512} from 'crypto-js'

const TOKEN_SECRET = process.env.SECRET_KEY

// Hash password token with SHA384
export function encryptToken({
                                 token,
                                 nonce,
                                 fileId
                             }: {
    token: string,
    nonce?: string,
    fileId: string
}): string {
    if (!TOKEN_SECRET) {
        console.error('TOKEN_SECRET not set.')
        throw new Error('TOKEN_SECRET not set.')
    }
    const s_nonce = nonce ?? Math.random().toString(36).slice(-8)
    const raw = `${s_nonce}/${token}/${fileId}`
    // console.log(raw)
    const hash = HmacSHA512(raw, TOKEN_SECRET).toString()
    return `${s_nonce}-${hash}`
}


/**
 * Compares the hash of .password and od-protected-token header
 * @param odTokenHeader od-protected-token header (sha384 hashed token)
 * @param dotPassword non-hashed .password file
 * @param fileId file id, used to guarantee the token is used for the same file
 * @returns whether the two hashes are the same
 */
export function compareHashedToken({
                                       odTokenHeader,
                                       dotPassword,
                                       fileId
                                   }: {
    odTokenHeader: string
    dotPassword: string,
    fileId: string
}): boolean {
    // New token pattern
    if (!odTokenHeader?.match(/^[a-z0-9]{8}-[0-9a-f]{128}$/)) return false
    const [nonce] = odTokenHeader.split('-');
    return encryptToken({
        token: dotPassword,
        nonce,
        fileId
    }) === odTokenHeader
}
