export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log(' ✓ Start registering cron jobs.')
    const { TaskGenerateSitemap } = await import('./cron/index')
    TaskGenerateSitemap()
  }
}
