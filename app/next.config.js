const { i18n } = require('./next-i18next.config')
const fs = require('fs');

module.exports = {
  i18n,
  reactStrictMode: true,
  // Required by Next i18n with API routes, otherwise API routes 404 when fetching without trailing slash
  trailingSlash: true,
  generateBuildId: async () => {
    try {
      return fs.readFileSync('HEAD', 'utf-8').trim();
    } catch (error) {
      console.error('Error generating build id:', error);
      return 'unknown-build-id';
    }
  }
}
