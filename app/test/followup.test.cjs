const assert = require('node:assert/strict')
const { test } = require('node:test')
const { load } = require('./support.cjs')

function storeFixture() {
  const values = new Map(), calls = []
  class Redis {
    async get(key) { calls.push(['get', key]); return values.get(key) ?? null }
    async set(key, value, ...args) { calls.push(['set', key]); if (args.includes('NX') && values.has(key)) return null; values.set(key, value); return 'OK' }
    async del(key) { values.delete(key) }
    async eval(script, count, key, owner) { if (values.get(key) !== owner) return 0; if (script.includes("'del'")) values.delete(key); return 1 }
  }
  const api = load('src/utils/odAuthTokenStore.ts', {
    ioredis: Redis, '../../config/site.config': { kvPrefix: 'test:' }, './buildIdHelper': { checkBuildStage: () => false },
  })
  return { api, values, calls }
}

test('anonymous sessions allocate no Redis keys or cookies; login reuses its own session', async () => {
  const { api, calls, values } = storeFixture()
  const cookies = [], res = { setHeader: (key, value) => cookies.push(value) }
  const session = new api.Session({ cookies: {} }, res)
  assert.equal(await session.getSession(), null)
  assert.equal(calls.length, 0)
  assert.equal(cookies.length, 0)
  const created = await session.getSession(true)
  await session.updateSession({ passKeys: { '/private/.password': 'fixture' } })
  assert.equal((await session.getSession()).id, created.id)
  assert.equal(values.size, 1)
  assert.match(cookies.at(-1), /HttpOnly; SameSite=Strict; Secure/)
  const next = new api.Session({ cookies: { NEXT_SESSION_ID: created.id } }, res)
  assert.equal((await next.getSession()).passKeys['/private/.password'], 'fixture')
  await next.destroySession()
  assert.equal(values.size, 0)
})

test('cache negative values use one GET; valid access tokens do not read refresh token', async () => {
  const { api, values, calls } = storeFixture()
  await api.setCache({ key: 'missing', value: null })
  calls.length = 0
  assert.equal((await api.getCache({ key: 'missing' })).exists, 1)
  assert.equal(calls.length, 1)
  values.set('test:access_token', 'access')
  calls.length = 0
  assert.equal((await api.getOdAuthTokens()).accessToken, 'access')
  assert.equal(calls.length, 1)
})

test('sitemap locks exclude contenders and cannot be renewed or deleted by another owner', async () => {
  const { api } = storeFixture()
  const owner = await api.acquireLock('sitemap', 120)
  assert.ok(owner)
  assert.equal(await api.acquireLock('sitemap', 120), null)
  assert.equal(await api.renewLock('sitemap', 'wrong', 120), false)
  await api.releaseLock('sitemap', 'wrong')
  assert.equal(await api.acquireLock('sitemap', 120), null)
  await api.releaseLock('sitemap', owner)
  assert.ok(await api.acquireLock('sitemap', 120))
})

test('drive item paths reject missing or outside parents and preserve literal percent names', () => {
  const api = load('src/utils/driveItems.ts', {
    '../../config/site.config': { baseDirectory: '/shared' }, '../../config/api.config': {}, './odAuthTokenStore': {}, axios: {},
  })
  assert.equal(api.getItemPath({ name: 'x' }), null)
  assert.equal(api.getItemPath({ name: 'x', parentReference: { path: '/drive/root:/shared-other' } }), null)
  assert.equal(api.getItemPath({ name: 'x', parentReference: { path: '/drive/root:/shared/%2e%2e/private' } }), null)
  assert.equal(api.getItemPath({ name: '100%.txt', parentReference: { path: '/drive/root:/shared/%E4%B8%AD%E6%96%87' } }), '/中文/100%.txt')
  assert.equal(api.getNextToken('https://graph.invalid/children?$skiptoken=a%2Bb%3D&x=y'), 'a+b=')
})

test('malformed protection config fails closed; route and numeric config is normalized', () => {
  for (const value of ['bad', '{}', '[false]', '["/a/../b"]']) {
    assert.throws(() => load('config/site.config.js', {}, { process: { env: { PROTECTED_ROUTES: value } } }), /PROTECTED_ROUTES/)
  }
  const config = load('config/site.config.js', {}, { process: { env: { PROTECTED_ROUTES: '["Private","/PRIVATE/"]', MAX_ITEMS: '100', CACHE_MAX_AGE: '120' } } })
  assert.equal(JSON.stringify(config.protectedRoutes), '["/private/"]')
  assert.equal(config.maxItems, 100)
  assert.equal(config.cacheMaxAge, 120)
})

test('ZIP downloads reject HTTP errors and both declared and streamed over-budget responses', async () => {
  const api = load('src/utils/download.ts', {}, { fetch: async () => new Response('denied', { status: 403 }) })
  await assert.rejects(api.downloadFile('/file', api.createDownloadBudget()), /HTTP 403/)
  const declared = load('src/utils/download.ts', {}, { fetch: async () => new Response('x', { headers: { 'content-length': String(api.MAX_ZIP_BYTES + 1) } }) })
  await assert.rejects(declared.downloadFile('/file', declared.createDownloadBudget()), /100 MiB/)
  const streamed = load('src/utils/download.ts', {}, { fetch: async () => new Response('abc') })
  await assert.rejects(streamed.downloadFile('/file', { files: 0, bytes: api.MAX_ZIP_BYTES - 2 }), /100 MiB/)
  await assert.rejects(streamed.downloadFile('/file', { files: 500, bytes: 0 }), /500 files/)
  const budget = streamed.createDownloadBudget()
  assert.equal(await (await streamed.downloadFile('/file', budget)).text(), 'abc')
  assert.equal(budget.bytes, 3)
})

test('password metadata is blocked regardless of case', () => {
  const { isPasswordFile } = load('src/utils/isPasswordFile.ts')
  assert.equal(isPasswordFile('.PASSWORD'), true)
  assert.equal(isPasswordFile('readme.md'), false)
})

test('Markdown sanitizes executable HTML while preserving math and relative image URL encoding', async () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const [{ default: Markdown }, { default: raw }, sanitize, { default: math }, { default: katex }] = await Promise.all([
    import('react-markdown'), import('rehype-raw'), import('rehype-sanitize'), import('remark-math'), import('rehype-katex'),
  ])
  const { markdownSchema, markdownImageUrl } = load('src/utils/markdown.ts', { 'rehype-sanitize': sanitize })
  const html = renderToStaticMarkup(React.createElement(Markdown, {
    remarkPlugins: [math], rehypePlugins: [raw, [sanitize.default, markdownSchema], katex],
  }, '$x^2$\n\n$$\nx+y\n$$\n\n```js\nconst x=1\n```\n\n<img src="x" onerror="alert(1)"><script>alert(1)</script>'))
  assert.match(html, /class="katex"/)
  assert.match(html, /class="katex-display"/)
  assert.doesNotMatch(html, /onerror|<script/)
  assert.match(html, /class="language-js"/)
  assert.equal(new URL(markdownImageUrl('/folder', 'my%20photo.png'), 'https://test.invalid').searchParams.get('path'), '/folder/my photo.png')
  assert.equal(new URL(markdownImageUrl('/folder', '100%25.png'), 'https://test.invalid').searchParams.get('path'), '/folder/100%.png')
})

test('search filters private and outside items and resolves missing parent metadata with bounded concurrency', async () => {
  const items = [
    { id: 'public', name: 'readme.md', file: {}, parentReference: { path: '/drive/root:/shared' } },
    { id: 'private', name: 'secret.txt', file: {}, parentReference: { path: '/drive/root:/shared/private' } },
    { id: 'outside', name: 'outside.txt', file: {}, parentReference: { path: '/drive/root:/other' } },
    { id: 'password', name: '.PASSWORD', file: {}, parentReference: { path: '/drive/root:/shared' } },
    ...Array.from({length: 8}, (_, i) => ({ id: 'fallback' + i, name: 'missing.txt' })),
  ]
  let active = 0, peak = 0
  const mocks = {
    '.': { encodePath: () => ':/shared', getAccessToken: async () => 'test', checkAuthRoute: async path => path.startsWith('/private') ? { needAuth: true, password: 'secret', authPath: '/private/.password' } : { needAuth: false } },
    '../../../config/api.config': { driveApi: 'https://graph.invalid/drive' },
    '../../../config/site.config': { baseDirectory: '/shared', maxItems: 100 },
    '../../utils/oAuthHandler': { encryptData: value => 'encrypted:' + value },
    '../../utils/odAuthTokenStore': { Session: class { async getSession() { return null } }, getCache: async () => ({data:null}), setCache: async () => {} },
    axios: { get: async url => {
      if (url.includes('/search(')) return {data:{value:items}}
      active++; peak=Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 5)); active--
      return {data:{id:url.split('/').at(-1),name:'missing.txt',file:{},parentReference:{path:'/drive/root:/shared'}}}
    } },
  }
  const handler = load('src/pages/api/search.ts', mocks).default
  const res = { headers:{}, status(code) {this.code=code;return this}, json(data){this.body=data;return this}, setHeader(key,value){this.headers[key]=value} }
  await handler({query:{q:'test'},cookies:{}},res)
  assert.equal(res.code,200)
  assert.equal(res.body.length,9)
  assert.ok(res.body.every(item => !item.name.includes('secret') && !item.name.includes('outside') && item.name !== '.PASSWORD'))
  assert.ok(peak <= 4)
  assert.equal(res.headers['Cache-Control'],'private, no-store')
})

test('verification upstream failures respond once without creating a session', async () => {
  let creates=0, writes=0
  const handler=load('src/pages/api/verify.ts', {
    './index': {getAccessToken:async ()=>'test',encodePath:value=>value},
    '../../../config/api.config':{driveApi:'https://graph.invalid'},
    '../../utils/odAuthTokenStore':{getCache:async()=>({exists:0,data:null}),Session:class {async getSession(){creates++;return {}}}},
    axios:{get:async()=>{throw {response:{status:404}}}},
  }).default
  const res={status(code){this.code=code;return this},json(){writes++;return this},setHeader(){}}
  await handler({method:'POST',body:{path:'/private/.password',token:'guess'},cookies:{}},res)
  assert.equal(res.code,401)
  assert.equal(writes,1)
  assert.equal(creates,0)
})

test('sitemap follows encoded pagination and retains the previous snapshot on incomplete scans', async () => {
  for (const fail of [false,true]) {
    const writes=[], requests=[]; let released=false
    const handler=load('src/cron/generate_sitemap.ts', {
      '../utils/buildIdHelper':{checkBuildStage:()=>false},
      '../pages/api':{getAccessToken:async()=>'fixture',encodePath:()=>'',getAuthTokenPath:path=>path.startsWith('/private')?['password']:[]},
      '../../config/api.config':{driveApi:'https://graph.invalid'},'../../config/site.config':{maxItems:100},
      '../utils/odAuthTokenStore':{acquireLock:async()=>'owner',renewLock:async()=>true,releaseLock:async()=>{released=true},setCache:async item=>writes.push(item)},
      axios:{get:async(url,options)=>{
        requests.push(options.params)
        if(options.params.$skipToken){if(fail)throw new Error('network');return {data:{value:[{name:'100%.txt'}]}}}
        return {data:{value:[{name:'public.txt'},{name:'.PASSWORD'},{name:'private',folder:{}}],'@odata.nextLink':'https://graph.invalid/children?$skiptoken=a%2Bb%3D'}}
      }},
    }).default
    await handler()
    assert.equal(requests[1].$skipToken,'a+b=')
    assert.equal(released,true)
    assert.equal(writes.length,fail?0:1)
    if(!fail)assert.equal(JSON.stringify(JSON.parse(writes[0].value).data.map(item=>item.path)), '["/public.txt","/100%.txt"]')
  }
})
