import axios from 'axios'
import {useEffect, useState} from 'react'

/**
 * Custom hook for axios to fetch raw file content on component mount
 * @param fetchUrl The URL pointing to the raw file content
 * @param path The path of the file, used for determining whether path is protected
 * @param setContent
 */
export default function useFileContent(
  fetchUrl: string,
  path: string,
  setContent?: string
): { response: any; error: string | null; validating: boolean } {
  const [response, setResponse] = useState('')
  const [validating, setValidating] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {

    setError('')
    setResponse('')
    setValidating(true)
    if (setContent !== undefined) {
      setValidating(false);
      setResponse(setContent);
      return
    }

    const controller = new AbortController()
    let active = true
    axios
      // Using 'blob' as response type to get the response as a raw file blob, which is later parsed as a string.
      // Axios defaults response parsing to JSON, which causes issues when parsing JSON files.
      .get(fetchUrl, { responseType: 'blob', signal: controller.signal })
      .then(async res => { const text = await res.data.text(); if (active) setResponse(text) })
      .catch(e => { if (active && !axios.isCancel(e)) setError(e.message) })
      .finally(() => { if (active) setValidating(false) })
    return () => { active = false; controller.abort() }
  }, [fetchUrl, path, setContent])
  return { response, error, validating }
}
