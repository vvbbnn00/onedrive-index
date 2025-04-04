import axios from 'axios'
import apiConfig from '../../config/api.config'
import CryptoJS from 'crypto-js'
import { importPKCS8, SignJWT } from 'jose'
import { randomUUID } from 'node:crypto'

// Just a disguise to obfuscate required tokens (including but not limited to client secret,
// access tokens, and refresh tokens), used along with the following two functions
const AES_SECRET_KEY = process.env.SECRET_KEY // must be set in environment
export function encryptData(data: string): string {
  if (!AES_SECRET_KEY) {
    console.error('AES_SECRET_KEY not set.')
    throw new Error('AES_SECRET_KEY not set.')
  }
  const cipherText = CryptoJS.AES.encrypt(data, AES_SECRET_KEY)
  return cipherText.toString()
}

export function decryptData(obfuscated: string): string {
  if (!AES_SECRET_KEY) {
    console.error('AES_SECRET_KEY not set.')
    throw new Error('AES_SECRET_KEY not set.')
  }
  const bytes = CryptoJS.AES.decrypt(obfuscated, AES_SECRET_KEY)
  return bytes.toString(CryptoJS.enc.Utf8)
}

export async function prepareAuthParams() {
  const body = new URLSearchParams()
  body.append('client_id', apiConfig.clientId)

  // Add client_secret or client_assertion to the request body based on the auth type
  if (apiConfig.authType === 'clientSecret') {
    if (!apiConfig.clientId || !apiConfig.clientSecret) {
      throw new Error('Missing clientId or clientSecret.')
    }
    body.append('client_secret', apiConfig.clientSecret)
  } else if (apiConfig.authType === 'certificate') {
    if (!apiConfig.clientId || !apiConfig.clientCertificateThumbprint || !apiConfig.clientPrivateKey) {
      throw new Error('Missing clientId, thumbprint, or private key.')
    }

    const timestamp = Math.floor(Date.now() / 1000)
    const cryptoKey = await importPKCS8(apiConfig.clientPrivateKey, 'RS256')

    // Build and sign JWT
    const jwt = await new SignJWT({
      aud: apiConfig.authApi.replace('common', apiConfig.tenantId),
      iss: apiConfig.clientId,
      sub: apiConfig.clientId,
      jti: randomUUID()
    })
      .setProtectedHeader({
        alg: apiConfig.clientJwtAlg,
        typ: 'JWT',
        x5t: apiConfig.clientCertificateThumbprint
      })
      .setIssuedAt(timestamp)
      .setExpirationTime(timestamp + 600) // 10 minutes expiration
      .setNotBefore(timestamp - 600)
      .sign(cryptoKey)

    body.append('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer')
    body.append('client_assertion', jwt)
  } else {
    throw new Error(`Unsupported auth type: ${apiConfig.authType}`)
  }

  return body
}

// Generate the Microsoft OAuth 2.0 authorization URL, used for requesting the authorisation code
export function generateAuthorisationUrl(): string {
  const { clientId, redirectUri, authApi, scope } = apiConfig
  const authUrl = authApi.replace('/token', '/authorize')

  // Construct URL parameters for OAuth2
  const params = new URLSearchParams()
  params.append('client_id', clientId)
  params.append('redirect_uri', redirectUri)
  params.append('response_type', 'code')
  params.append('scope', scope)
  params.append('response_mode', 'query')

  return `${authUrl}?${params.toString()}`
}

// After a successful authorisation, the code returned from the Microsoft OAuth 2.0 authorization URL
// will be used to request an access token. This function requests the access token with the authorisation code
// and returns the access token and refresh token on success.
export async function requestTokenWithAuthCode(
  code: string
): Promise<
  | { expiryTime: string; accessToken: string; refreshToken: string }
  | { error: string; errorDescription: string; errorUri: string }
> {
  const { authApi, redirectUri } = apiConfig

  // Construct URL parameters for OAuth2
  const params = await prepareAuthParams()
  params.append('code', code)
  params.append('redirect_uri', redirectUri)
  params.append('grant_type', 'authorization_code')

  // Request access token
  return axios
    .post(authApi, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    .then(resp => {
      const { expires_in, access_token, refresh_token } = resp.data
      return { expiryTime: expires_in, accessToken: access_token, refreshToken: refresh_token }
    })
    .catch(err => {
      const { error, error_description, error_uri } = err.response.data
      return { error, errorDescription: error_description, errorUri: error_uri }
    })
}

// Verify the identity of the user with the access token and compare it with the userPrincipalName
// in the Microsoft Graph API. If the userPrincipalName matches, proceed with token storing.
export async function getAuthPersonInfo(accessToken: string) {
  const profileApi = apiConfig.driveApi.replace('/drive', '')
  return axios.get(profileApi, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })
}
