const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const ts = require('typescript')

exports.load = function load(relativePath, mocks = {}, globals = {}) {
  const entry = path.resolve(__dirname, '..', relativePath)
  const canonical = filename => filename.replace(/\.(ts|js)$/, '').replace(/[\\/]index$/, '')
  const resolvedMocks = new Map(Object.entries(mocks).filter(([name]) => name.startsWith('.')).map(([name, value]) => [canonical(path.resolve(path.dirname(entry), name)), value]))
  const cache = new Map()
  function read(filename) {
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }
    cache.set(filename, module)
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText
    const nativeRequire = createRequire(filename)
    vm.runInNewContext(source, {
      module, exports: module.exports,
      require: name => {
        if (!name.startsWith('.')) return Object.hasOwn(mocks, name) ? mocks[name] : nativeRequire(name)
        const resolved = path.resolve(path.dirname(filename), name)
        if (resolvedMocks.has(canonical(resolved))) return resolvedMocks.get(canonical(resolved))
        const target = [resolved, resolved + '.ts', resolved + '.js', path.join(resolved, 'index.ts')].find(p => fs.existsSync(p) && fs.statSync(p).isFile())
        return target ? read(target) : nativeRequire(name)
      },
      console: { log() {}, info() {}, warn() {}, error() {} },
      URL, URLSearchParams, Buffer, Blob, Uint8Array, AbortController, setTimeout, clearTimeout,
      process: { env: { SECRET_KEY: 'test-only-secret' } }, ...globals,
    }, { filename })
    return module.exports
  }
  return read(entry)
}
