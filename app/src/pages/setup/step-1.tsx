import Head from 'next/head'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { useTranslation, Trans } from 'next-i18next'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'

import siteConfig from '../../../config/site.config'
import Navbar from '../../components/Navbar'
import Footer from '../../components/Footer'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { getAuthPersonInfo } from '../../utils/oAuthHandler'
import { getAccessToken } from '../api'
import Folders from '../[...path]'

/**
 * Protect the secret information.
 *
 * @param text information
 * @returns
 */
function addStarsAndTrim(text: string): string {
  if (text.length <= 10) {
    return '**********'
  }

  const prefix = text.substring(0, 5)
  const suffix = text.substring(text.length - 5)
  const stars = '*'.repeat(text.length - 10)

  return `${prefix}${stars}${suffix}`
}


async function checkInstalled(): Promise<boolean> {
  const access_token = await getAccessToken()
  if (!access_token) return false
  try {
    const { status } = await getAuthPersonInfo(access_token)
    if (status !== 200) return false
  } catch (error: any) {
    return false
  }
  return true
}


export default function OAuthStep1({ installed, apiConfig, build_id }) {
  const { t } = useTranslation()

  const router = useRouter()
  if (installed) {
    router.query.path = router.pathname.substring(1).split('/')
    //@ts-ignore
    return Folders({ build_id })
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white dark:bg-gray-900">
      <Head>
        <title>{t('OAuth Step 1 - {{title}}', { title: siteConfig.title })}</title>
      </Head>

      <main className="flex w-full flex-1 flex-col bg-gray-50 dark:bg-gray-800">
        <Navbar />

        <div className="mx-auto w-full max-w-5xl p-4">
          <div className="rounded bg-white p-3 dark:bg-gray-900 dark:text-gray-100">
            <div className="mx-auto w-52">
              <Image src="/images/fabulous-fireworks.png" width={912} height={912} alt="fabulous fireworks" priority />
            </div>
            <h3 className="mb-4 text-center text-xl font-medium">
              {t('Welcome to your new onedrive-docker-index 🎉')}
            </h3>

            <h3 className="mt-4 mb-2 text-lg font-medium">{t('Step 1/3: Preparations')}</h3>

            {/* <p className="py-1 text-sm font-medium text-yellow-400">
              <Trans>
                <FontAwesomeIcon icon="exclamation-triangle" className="mr-1" /> If you have not specified a REDIS_URL
                inside your Vercel env variable, go initialise one at{' '}
                <a href="https://upstash.com/" target="_blank" rel="noopener noreferrer" className="underline">
                  Upstash
                </a>
                . Docs:{' '}
                <a
                  href="https://docs.upstash.com/redis/howto/vercelintegration"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Vercel Integration - Upstash
                </a>
                .
              </Trans>
            </p> */}

            <p className="py-1">
              <Trans>
                Authorisation is required as no valid{' '}
                <code
                  className="font-mono text-sm underline decoration-pink-600 decoration-wavy">access_token</code> or{' '}
                <code
                  className="font-mono text-sm underline decoration-green-600 decoration-wavy">refresh_token</code>{' '}
                is present on this deployed instance. Check the following configurations before proceeding with
                authorising onedrive-docker-index with your own Microsoft account.
              </Trans>
            </p>

            <div className="my-4 overflow-hidden">
              <table className="min-w-full table-auto">
                <tbody>
                <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                  <td
                    className="bg-gray-50 py-1 px-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:bg-gray-800 dark:text-gray-400">
                    AUTH_TYPE
                  </td>
                  <td className="whitespace-nowrap py-1 px-3 text-gray-500 dark:text-gray-400">
                    <code className="font-mono text-sm">{apiConfig.authType}</code>
                  </td>
                </tr>
                <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                  <td
                    className="bg-gray-50 py-1 px-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:bg-gray-800 dark:text-gray-400">
                    CLIENT_ID
                  </td>
                  <td className="whitespace-nowrap py-1 px-3 text-gray-500 dark:text-gray-400">
                    <code className="font-mono text-sm">{apiConfig.clientId}</code>
                  </td>
                </tr>
                {apiConfig.authType === 'clientSecret' && (
                  <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                    <td
                      className="bg-gray-50 py-1 px-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:bg-gray-800 dark:text-gray-400">
                      CLIENT_SECRET*
                    </td>
                    <td className="whitespace-nowrap py-1 px-3 text-gray-500 dark:text-gray-400">
                      <code className="font-mono text-sm">{apiConfig.clientSecret || "-"}</code>
                    </td>
                  </tr>
                )}
                {apiConfig.authType === 'certificate' && (<>
                  <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                    <td
                      className="bg-gray-50 py-1 px-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:bg-gray-800 dark:text-gray-400">
                      TENANT_ID*
                    </td>
                    <td className="whitespace-nowrap py-1 px-3 text-gray-500 dark:text-gray-400">
                      <code className="font-mono text-sm">{apiConfig.tenantId || '-'}</code>
                    </td>
                  </tr>
                  <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                    <td
                      className="bg-gray-50 py-1 px-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:bg-gray-800 dark:text-gray-400">
                      CERTIFICATE_THUMBPRINT*
                    </td>
                    <td className="whitespace-nowrap py-1 px-3 text-gray-500 dark:text-gray-400">
                      <code className="font-mono text-sm">{apiConfig.clientCertificateThumbprint || '-'}</code>
                    </td>
                  </tr>
                  <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                    <td
                      className="bg-gray-50 py-1 px-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:bg-gray-800 dark:text-gray-400">
                      PRIVATE_KEY*
                    </td>
                    <td className="whitespace-nowrap py-1 px-3 text-gray-500 dark:text-gray-400">
                      <code className="font-mono text-sm">{apiConfig.clientPrivateKey || '-'}</code>
                    </td>
                  </tr>
                </>)}
                <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                  <td
                    className="bg-gray-50 py-1 px-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:bg-gray-800 dark:text-gray-400">
                    REDIRECT_URI
                  </td>
                  <td className="whitespace-nowrap py-1 px-3 text-gray-500 dark:text-gray-400">
                    <code className="font-mono text-sm">{apiConfig.redirectUri}</code>
                  </td>
                </tr>
                <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                  <td
                    className="bg-gray-50 py-1 px-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:bg-gray-800 dark:text-gray-400">
                    Auth API URL
                  </td>
                  <td className="whitespace-nowrap py-1 px-3 text-gray-500 dark:text-gray-400">
                    <code className="font-mono text-sm">{apiConfig.authApi}</code>
                  </td>
                </tr>
                <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                  <td
                    className="bg-gray-50 py-1 px-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:bg-gray-800 dark:text-gray-400">
                    Drive API URL
                  </td>
                  <td className="whitespace-nowrap py-1 px-3 text-gray-500 dark:text-gray-400">
                    <code className="font-mono text-sm">{apiConfig.driveApi}</code>
                  </td>
                </tr>
                <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                  <td
                    className="bg-gray-50 py-1 px-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:bg-gray-800 dark:text-gray-400">
                    API Scope
                  </td>
                  <td className="whitespace-nowrap py-1 px-3 text-gray-500 dark:text-gray-400">
                    <code className="font-mono text-sm">{apiConfig.scope}</code>
                  </td>
                </tr>
                </tbody>
              </table>
            </div>

            <p className="py-1 text-sm font-medium">
              <Trans>
                <FontAwesomeIcon icon="exclamation-triangle" className="mr-1 text-yellow-400" /> If you see anything
                missing or incorrect, you need to reconfigure{' '}
                <code className="font-mono text-xs">/config/api.config.js</code> and redeploy this instance.
              </Trans>
            </p>

            <div className="mb-2 mt-6 text-right">
              <button
                className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-gradient-to-bl focus:ring-4 focus:ring-cyan-300 dark:focus:ring-cyan-800"
                onClick={() => {
                  router.push('/setup/step-2')
                }}
              >
                <span>{t('Proceed to OAuth')}</span> <FontAwesomeIcon icon="arrow-right" />
              </button>
            </div>
          </div>
        </div>
      </main>

      <Footer BuildId={build_id} />
    </div>
  )
}

import apiConfig from '../../../config/api.config'
import getBuildId from '../../utils/buildIdHelper'

export async function getServerSideProps({ locale }) {

  return {
    props: {
      ...(await serverSideTranslations(locale, ['common'])),
      installed: await checkInstalled(),
      apiConfig: {
        authType: apiConfig.authType,
        clientId: apiConfig.clientId,
        redirectUri: apiConfig.redirectUri,
        authApi: apiConfig.authApi,
        driveApi: apiConfig.driveApi,
        scope: apiConfig.scope,
        tenantId: apiConfig.tenantId,
        clientCertificateThumbprint: apiConfig.clientCertificateThumbprint,
        clientSecret: addStarsAndTrim(apiConfig.clientSecret),
        clientPrivateKey: apiConfig?.clientPrivateKey ? "******" : "-",
      },
      build_id: getBuildId()
    }
  }
}
