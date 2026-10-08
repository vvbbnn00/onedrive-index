import axios from 'axios'
import useSWRInfinite from 'swr/infinite'

import type {OdAPIResponse} from '../types'

// Common axios fetch function for use with useSWR
export async function fetcher([url, token]: [url: string, token?: string]): Promise<any> {
    try {
        return (
            await (token
                ? axios.get(url, {
                    headers: {'od-protected-token': token},
                })
                : axios.get(url))
        ).data
    } catch (err: any) {
        throw {status: err.response?.status ?? 500, message: err.response?.data ?? { error: 'Network request failed.' }}
    }
}

/**
 * Paging with useSWRInfinite + protected token support
 * @param path Current query directory path
 * @param renderedData
 * @returns useSWRInfinite API
 */
export function useProtectedSWRInfinite(path: string = '', renderedData?) {
    async function renderedDataFetcher([url, index]: [url: string, index?: Number]): Promise<any> {
        try {
            return (
                await (axios.get(url))
            ).data
        } catch (err: any) {
            throw {status: err.response?.status ?? 500, message: err.response?.data ?? { error: 'Network request failed.' }}
        }
    }

    /**
     * Next page infinite loading for useSWR
     * @param pageIndex Current page index
     * @param previousPageData Previous page data
     * @returns API to the next page
     */
    function getNextKey(pageIndex: number, previousPageData: OdAPIResponse): (string | Number | null)[] | null {
        // Reached the end of the collection
        if (previousPageData && (!previousPageData.folder || !previousPageData.next)) return null

        // First page with no prevPageData
        if (pageIndex === 0) return [`/api/?path=${path}`, pageIndex]

        // Add nextPage token to API endpoint
        return [`/api/?path=${path}&next=${encodeURIComponent(previousPageData.next!)}`, pageIndex]
    }

    // Disable auto-revalidate, these options are equivalent to useSWRImmutable
    // https://swr.vercel.app/docs/revalidation#disable-automatic-revalidations
    const revalidationOptions = {
        fallbackData: renderedData ? [renderedData] : undefined,
        revalidateIfStale: false,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
    }
    return useSWRInfinite(getNextKey, renderedDataFetcher, revalidationOptions)
}
