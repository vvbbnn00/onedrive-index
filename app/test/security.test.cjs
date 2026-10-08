const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { test } = require('node:test')
const ts = require('typescript')

// Exercise the real handlers with in-memory Graph/Redis boundaries. Never load .env.
const { load } = require('./support.cjs')

const cacheControlHeader = 'max-age=0, s-maxage=60, stale-while-revalidate'

function listingFixture() {
  const requests = []
  const api = load('src/pages/api/index.ts', {
    '../../../config/api.config': { driveApi: 'https://graph.invalid/drive', cacheControlHeader },
    '../../../config/site.config': { baseDirectory: '/shared', protectedRoutes: ['/private/'], maxItems: 100 },
    '../../utils/oAuthHandler': { encryptData: value => `encrypted:${value}` },
    '../../utils/protectedRouteHandler': {},
    '../../utils/odAuthTokenStore': {
      getOdAuthTokens: async () => ({ accessToken: 'test-token', refreshToken: 'test-refresh' }),
    },
    '../../utils/loggerHelper': { now: () => 'test' },
    '../../utils/buildIdHelper': { checkBuildStage: () => false },
    axios: { get: async url => {
      requests.push(url)
      return { data: { id: 'file-id', name: 'example.txt', file: {} } }
    } },
  })
  return { api, requests }
}

test('SSR resolves encoded separators and dot segments before protected-route checks', async () => {
  const { api, requests } = listingFixture()
  for (const value of ['/public%2F..%2Fprivate/secret.txt', '/public/%2E%2E/private/secret.txt', '/PRIVATE/secret.txt']) {
    assert.equal(await api.getFileList({ path: value }), false)
  }
  assert.equal(requests.length, 0, 'private SSR must not call Graph')
})

test('Graph paths cannot escape the configured base directory', async () => {
  const { api, requests } = listingFixture()
  assert.equal(decodeURIComponent(api.encodePath('../../outside')), ':/shared/outside')
  await api.getFileList({ path: '/public%2F..%2F..%2Foutside.txt' })
  assert.equal(decodeURIComponent(requests[0]), 'https://graph.invalid/drive/root:/shared/outside.txt')
})

test('SSR preserves public siblings, Unicode and literal percent filenames', async () => {
  const { api, requests } = listingFixture()
  for (const value of ['/private-copy/a.txt', '/中文/100%25.txt', '/literal%252Fname.txt']) {
    const result = await api.getFileList({ path: value })
    assert.equal(result.file.id, 'encrypted:file-id')
  }
  assert.equal(decodeURIComponent(requests[1]), 'https://graph.invalid/drive/root:/shared/中文/100%.txt')
  assert.equal(decodeURIComponent(requests[2]), 'https://graph.invalid/drive/root:/shared/literal%2Fname.txt')
})

test('SSR rejects malformed URI escapes without throwing or contacting Graph', async () => {
  const { api, requests } = listingFixture()
  assert.equal(await api.getFileList({ path: '/bad%escape' }), false)
  assert.equal(requests.length, 0)
})

function response() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    getHeader(name) { return this.headers[name.toLowerCase()] },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
    redirect(code, url) { this.statusCode = code; this.location = url; return this },
    writeHead(code, headers) {
      this.statusCode = code
      for (const [key, value] of Object.entries(headers)) this.setHeader(key, value)
    },
  }
}

function rawFixture({ privateFile = true, session = {}, filename = 'example.txt' } = {}) {
  const tokenTools = load('src/utils/protectedRouteHandler.ts', {})
  const requests = []
  const raw = load('src/pages/api/raw.ts', {
    '../../../config/api.config': { driveApi: 'https://graph.invalid/drive', cacheControlHeader },
    '.': {
      encodePath: value => `:${encodeURIComponent(value)}`,
      getAccessToken: async () => 'test-token',
      checkAuthRoute: async () => privateFile
        ? { code: 401, message: 'Password required.', authPath: '/private/.password', needAuth: true, password: 'correct' }
        : { code: 200, message: 'Not Match', authPath: null, needAuth: false, password: null },
    },
    '../../utils/odAuthTokenStore': { Session: class { async getSession() { return session } } },
    '../../utils/protectedRouteHandler': tokenTools,
    '../../utils/loggerHelper': { now: () => 'test' },
    cors: () => (_req, _res, done) => done(),
    axios: { get: async url => {
      requests.push(url)
      if (url === 'https://download.invalid/file') {
        return {
          headers: { 'cache-control': 'public, max-age=86400', 'content-type': 'text/plain' },
          data: { pipe: res => { res.body = 'file bytes' } },
        }
      }
      return { data: { id: 'file-id', name: filename, size: 100, '@microsoft.graph.downloadUrl': 'https://download.invalid/file' } }
    } },
  }).default
  const run = async (query = {}, handler = raw) => {
    const res = response()
    await handler({ query: { path: '/private/example.txt', ...query }, headers: {}, cookies: {} }, res)
    return res
  }
  return { raw, run, requests, tokenTools }
}

test('cookie-authorized private proxy bytes remain private and non-storable', async () => {
  const { run } = rawFixture({ session: { passKeys: { '/private/.password': 'correct' } } })
  const res = await run({ proxy: 'true' })
  assert.equal(res.statusCode, 200)
  assert.equal(res.body, 'file bytes')
  assert.equal(res.headers['cache-control'], 'private, no-store')
})

test('file-bound ODPT allows authorized downloads and rejects wrong-file tokens', async () => {
  const { run, tokenTools } = rawFixture()
  const odpt = tokenTools.encryptToken({ token: 'correct', fileId: 'file-id', nonce: '12345678' })
  const res = await run({ odpt, proxy: 'true' })
  assert.equal(res.body, 'file bytes')
  assert.equal(res.headers['cache-control'], 'private, no-store')
  const wrong = tokenTools.encryptToken({ token: 'correct', fileId: 'other-id', nonce: '12345678' })
  assert.equal((await run({ odpt: wrong })).statusCode, 401)
})

test('anonymous private downloads do not fetch file bytes', async () => {
  const { run, requests } = rawFixture()
  const res = await run({ proxy: 'true' })
  assert.equal(res.statusCode, 401)
  assert.equal(requests.includes('https://download.invalid/file'), false)
  assert.equal(res.headers['cache-control'], 'private, no-store')
})

test('private redirect and named-download entry points retain private cache policy', async () => {
  const fixture = rawFixture({ session: { passKeys: { '/private/.password': 'correct' } } })
  const redirected = await fixture.run()
  assert.equal(redirected.statusCode, 302)
  assert.equal(redirected.headers['cache-control'], 'private, no-store')
  const named = load('src/pages/api/name/[name].ts', { '../raw': fixture.raw }).default
  const res = await fixture.run({ proxy: 'true', name: 'renamed.txt' }, named)
  assert.equal(res.headers['cache-control'], 'private, no-store')
  assert.equal(res.headers['content-disposition'], 'attachment; filename="renamed.txt"; filename*=UTF-8\'\'renamed.txt')
})

test('public proxy and redirect behavior remain available', async () => {
  const { run } = rawFixture({ privateFile: false })
  const res = await run({ proxy: 'true' })
  assert.equal(res.body, 'file bytes')
  assert.equal(res.headers['cache-control'], cacheControlHeader)
  const redirected = await run()
  assert.equal(redirected.statusCode, 302)
  assert.equal(redirected.location, 'https://download.invalid/file')
})

test('password files cannot be downloaded even with a valid session', async () => {
  const { run } = rawFixture({ filename: '.password', session: { passKeys: { '/private/.password': 'correct' } } })
  assert.equal((await run({ proxy: 'true' })).statusCode, 403)
})

test('Unicode proxy filenames produce a valid HTTP header', async () => {
  const { run } = rawFixture({ privateFile: false, filename: '中文😀.txt' })
  const res = await run({ proxy: 'true' })
  assert.equal(res.statusCode, 200)
  require('node:http').validateHeaderValue('content-disposition', res.headers['content-disposition'])
  assert.match(res.headers['content-disposition'], /filename\*=UTF-8''%E4%B8%AD%E6%96%87/)
})
