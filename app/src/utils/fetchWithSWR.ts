import axios from 'axios'
import useSWRInfinite from 'swr/infinite'

import type { OdAPIResponse } from '../types'

import { getStoredToken } from './protectedRouteHandler'

// Common axios fetch function for use with useSWR
export async function fetcher([url, token]: [url: string, token?: string]): Promise<any> {
  try {
    return (
      await (token
        ? axios.get(url, {
            headers: { 'od-protected-token': token },
          })
        : axios.get(url))
    ).data
  } catch (err: any) {
    throw { status: err.response.status, message: err.response.data }
  }
}

/**
 * Paging with useSWRInfinite + protected token support
 * @param path Current query directory path
 * @returns useSWRInfinite API
 */
export function useProtectedSWRInfinite(path: string = '', renderedData?) {
  const hashedToken = getStoredToken(path)

  async function renderedDataFetcher([url, token, index]: [url: string, token?: string, index?: Number]): Promise<any> {
    if (index == 0 && renderedData) return renderedData;
    try {
      return (
        await (token
          ? axios.get(url, {
              headers: { 'od-protected-token': token },
            })
          : axios.get(url))
      ).data
    } catch (err: any) {
      throw { status: err.response.status, message: err.response.data }
    }
  }

  /**
   * Next page infinite loading for useSWR
   * @param pageIdx The index of this paging collection
   * @param prevPageData Previous page information
   * @param path Directory path
   * @returns API to the next page
   */
  function getNextKey(pageIndex: number, previousPageData: OdAPIResponse): (string | Number | null)[] | null {
    // Reached the end of the collection
    if (previousPageData && !previousPageData.folder) return null

    // First page with no prevPageData
    if (pageIndex === 0) return [`/api/?path=${path}`, hashedToken, pageIndex]

    // Add nextPage token to API endpoint
    return [`/api/?path=${path}&next=${previousPageData.next}`, hashedToken, pageIndex]
  }

  // Disable auto-revalidate, these options are equivalent to useSWRImmutable
  // https://swr.vercel.app/docs/revalidation#disable-automatic-revalidations
  const revalidationOptions = {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
  }
  return useSWRInfinite(getNextKey, renderedDataFetcher, revalidationOptions)
}
