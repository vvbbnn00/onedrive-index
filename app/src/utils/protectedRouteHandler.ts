import siteConfig from '../../config/site.config'
import { SHA384 } from 'crypto-js'

// Hash password token with SHA384
function encryptToken(token: string, nonce?: string): string {
  const s_nonce = nonce ?? Math.random().toString(36).slice(-8)
  const raw = `${s_nonce}/${token}`
  const hash = SHA384(raw).toString()
  return `${s_nonce}-${hash}`
}

// Fetch stored token from localStorage and encrypt with SHA384
export function getStoredToken(path: string): string | null {
  // console.log(matchProtectedRoute(path))
  const storedToken =
    typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(matchProtectedRoute(path)) as string) : ''
  return storedToken ? encryptToken(storedToken) : null
}

/**
 * Compares the hash of .password and od-protected-token header
 * @param odTokenHeader od-protected-token header (sha384 hashed token)
 * @param dotPassword non-hashed .password file
 * @returns whether the two hashes are the same
 */
export function compareHashedToken({
  odTokenHeader,
  dotPassword,
}: {
  odTokenHeader: string
  dotPassword: string
}): boolean {
  // New token pattern
  if (!odTokenHeader?.match(/^[a-z0-9]{8}\-[0-9a-f]{96}$/)) return false
  const [nonce] = odTokenHeader.split('-');
  return encryptToken(dotPassword.trim(), nonce) === odTokenHeader
}
/**
 * Match the specified route against a list of predefined routes
 * @param route directory path
 * @returns whether the directory is protected
 */

export function matchProtectedRoute(route: string): string {
  if (!route.endsWith('/')) route += '/'
  const protectedRoutes: string[] = siteConfig.protectedRoutes
  let authTokenPath = ''

  for (const r of protectedRoutes) {
    // protected route array could be empty
    if (r) {
      if (
        route.startsWith(
          r
            .split('/')
            .map(p => encodeURIComponent(p))
            .join('/')
        )
      ) {
        authTokenPath = r
        break
      }
    }
  }
  return authTokenPath
}
