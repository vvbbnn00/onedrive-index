const path = require('path')

module.exports = {
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh-CN', 'zh-TW', 'ja', 'de-DE', 'es', 'hi', 'id', 'tr-TR'] // you can add more locales here
  },
  localePath: path.resolve('public/locales'),
  reloadOnPrerender: process.env.NODE_ENV === 'development',
  keySeparator: false,
  namespaceSeparator: false,
  pluralSeparator: '——',
  contextSeparator: '——'
}
