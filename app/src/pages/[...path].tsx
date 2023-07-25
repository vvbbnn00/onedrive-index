import Head from 'next/head'
import { useRouter } from 'next/router'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'

import siteConfig from '../../config/site.config'
import Navbar from '../components/Navbar'
import FileListing from '../components/FileListing'
import Footer from '../components/Footer'
import Breadcrumb from '../components/Breadcrumb'
import SwitchLayout from '../components/SwitchLayout'
import getBuildId from '../utils/buildIdHelper'
import { getFileList } from './api'
import { ParsedUrlQuery } from 'querystring'

export default function Folders({ build_id, renderedData }) {
  const { query } = useRouter()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white dark:bg-gray-900 !bg-opacity-80">
      <Head>
        <title>{siteConfig.title}</title>
      </Head>

      <main className="flex w-full flex-1 flex-col bg-gray-50 dark:bg-gray-800 !bg-opacity-50">
        <Navbar />
        <div className="mx-auto w-full max-w-5xl py-4 sm:p-4 !bg-opacity-50">
          <nav className="mb-4 flex items-center justify-between space-x-3 px-4 sm:px-0 sm:pl-1">
            <Breadcrumb query={query} />
            <SwitchLayout />
          </nav>
          <FileListing query={query} renderedData={renderedData} />
        </div>
      </main>

      <Footer BuildId={build_id} />
    </div>
  )
}

/**
 * Convert url query into path string
 *
 * @param query Url query property
 * @returns Path string
 */
const queryToPath = (query?: ParsedUrlQuery) => {
  if (query) {
    const { path } = query
    if (!path) return '/'
    if (typeof path === 'string') return `/${encodeURIComponent(path)}`
    return `/${path.map(p => encodeURIComponent(p)).join('/')}`
  }
  return '/'
}

export async function getServerSideProps({ locale, query }) {
  const path = queryToPath(query);

  return {
    props: {
      ...(await serverSideTranslations(locale, ['common'])),
      build_id: getBuildId(),
      renderedData: await getFileList({ path })
    },
  }
}
