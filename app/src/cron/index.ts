import * as cron from 'cron'
import generateSitemap from './generate_sitemap'

function TaskGenerateSitemap() {
  // Run at 00:00 every day
  new cron.CronJob('0 0 0 * * *', () => {
    generateSitemap().catch(() => console.warn('Sitemap task failed.'))
  }).start()
}

export {
  TaskGenerateSitemap
}
