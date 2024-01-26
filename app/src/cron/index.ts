import * as cron from 'cron'
import generateSitemap from './generate_sitemap'

function TaskGenerateSitemap() {
  // Run at 00:00 every day
  new cron.CronJob('0 0 0 * * *', () => {
    generateSitemap().then(() => {})
  }).start()
}

export {
  TaskGenerateSitemap
}
