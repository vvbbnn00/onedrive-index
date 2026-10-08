import type { OdFileObject } from '../../types'

import { FC, useEffect, useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/router'
import { useTranslation } from 'next-i18next'

import axios from 'axios'
import toast from 'react-hot-toast'
import { useAsync } from 'react-async-hook'
import { useClipboard } from 'use-clipboard-copy'

import { getBaseUrl } from '../../utils/getBaseUrl'
import { getExtension } from '../../utils/getFileIcon'

import { DownloadButton } from '../DownloadBtnGtoup'
import { DownloadBtnContainer } from './Containers'
import FourOhFour from '../FourOhFour'
import Loading from '../Loading'
import CustomEmbedLinkMenu from '../CustomEmbedLinkMenu'

import 'plyr-react/plyr.css'
import BasicInfoPanel from './BasicInfoPanel'
import dynamic from 'next/dynamic'

const ReactPlyr = dynamic(() => import('plyr-react'), { ssr: false })

const VideoPlayer: FC<{
  videoName: string
  videoUrl: string
  width?: number
  height?: number
  thumbnail: string
  subtitle: string
  isFlv: boolean
  mpegts: any
}> = ({ videoName, videoUrl, width, height, thumbnail, subtitle, isFlv, mpegts }) => {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    let subtitleUrl: string | undefined
    let flv: any
    const attach = () => {
      const video = container.current?.querySelector('video')
      if (!video || !active) return
      if (subtitleUrl) video.querySelector('track')?.setAttribute('src', subtitleUrl)
      if (isFlv && mpegts && !flv) {
        flv = mpegts.createPlayer({ url: videoUrl, type: 'flv' })
        flv.attachMediaElement(video)
        flv.load()
      }
    }
    const observer = new MutationObserver(attach)
    if (container.current) observer.observe(container.current, { childList: true, subtree: true })
    attach()
    axios.get(subtitle, { responseType: 'blob', signal: controller.signal })
      .then(resp => { if (active) { subtitleUrl = URL.createObjectURL(resp.data); attach() } })
      .catch(() => {})
    return () => {
      active = false
      controller.abort()
      observer.disconnect()
      if (flv) flv.destroy()
      if (subtitleUrl) URL.revokeObjectURL(subtitleUrl)
    }
  }, [videoUrl, isFlv, mpegts, subtitle])

  // Common plyr configs, including the video source and plyr options
  const plyrSource = useMemo(() => ({
    type: 'video',
    title: videoName,
    poster: thumbnail,
    tracks: [{ kind: 'captions', label: videoName, src: '', default: true }],
    ...(!isFlv ? { sources: [{ src: videoUrl }] } : {})
  }), [videoName, thumbnail, isFlv, videoUrl])
  const plyrOptions: Plyr.Options = useMemo(() => ({
    ratio: `${width ?? 16}:${height ?? 9}`,
    fullscreen: { iosNative: true }
  }), [width, height])
  return <div ref={container}><ReactPlyr id="plyr" source={plyrSource as any} options={plyrOptions} /></div>

}

const VideoPreview: FC<{ file: OdFileObject, hashedToken?: string }> = ({ file, hashedToken }) => {
  const { asPath } = useRouter()
  const clipboard = useClipboard()

  const [menuOpen, setMenuOpen] = useState(false)
  const { t } = useTranslation()

  // OneDrive generates thumbnails for its video files, we pick the thumbnail with the highest resolution
  const thumbnail = `/api/thumbnail/?path=${asPath}&size=large${hashedToken ? `&odpt=${hashedToken}` : ''}`

  // We assume subtitle files are beside the video with the same name, only webvtt '.vtt' files are supported
  const vtt = `${asPath.substring(0, asPath.lastIndexOf('.'))}.vtt`
  const subtitle = `/api/raw/?path=${vtt}${hashedToken ? `&odpt=${hashedToken}` : ''}`

  // We also format the raw video file for the in-browser player as well as all other players
  const videoUrl = `/api/raw/?path=${asPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`

  const isFlv = getExtension(file.name) === 'flv'
  const {
    loading,
    error,
    result: mpegts
  } = useAsync(async () => {
    if (isFlv) {
      return (await import('mpegts.js')).default
    }
  }, [isFlv])

  return (
    <>
      <CustomEmbedLinkMenu path={asPath} menuOpen={menuOpen} setMenuOpen={setMenuOpen} hashedToken={hashedToken} />

      <BasicInfoPanel file={file}></BasicInfoPanel>

      <div
        className="w-full overflow-hidden border-t border-gray-900/10 bg-white bg-opacity-80 p-2 shadow-sm backdrop-blur-md dark:border-gray-500/30 dark:bg-gray-900 rounded backdrop-blur-md !bg-opacity-50">
        <div>
          {error ? (
            <FourOhFour errorMsg={error.message} />
          ) : loading && isFlv ? (
            <Loading loadingText={t('Loading FLV extension...')} />
          ) : (
            <VideoPlayer
              key={videoUrl}
              videoName={file.name}
              videoUrl={videoUrl}
              width={file.video?.width}
              height={file.video?.height}
              thumbnail={thumbnail}
              subtitle={subtitle}
              isFlv={isFlv}
              mpegts={mpegts}
            />
          )}
        </div>
      </div>

      <DownloadBtnContainer>
        <div className="flex flex-wrap justify-center gap-2">
          <DownloadButton
            onClickCallback={() => window.open(videoUrl)}
            btnColor="blue"
            btnText={t('Download')}
            btnIcon="file-download"
          />
          <DownloadButton
            onClickCallback={() => {
              clipboard.copy(`${getBaseUrl()}/api/raw/?path=${asPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`)
              toast.success(t('Copied direct link to clipboard.'))
            }}
            btnColor="pink"
            btnText={t('Copy direct link')}
            btnIcon="copy"
          />
          <DownloadButton
            onClickCallback={() => setMenuOpen(true)}
            btnColor="teal"
            btnText={t('Customise link')}
            btnIcon="pen"
          />

          <DownloadButton
            onClickCallback={() => window.open(`iina://weblink?url=${getBaseUrl()}${videoUrl}`)}
            btnText="IINA"
            btnImage="/players/iina.png"
          />
          <DownloadButton
            onClickCallback={() => window.open(`vlc://${getBaseUrl()}${videoUrl}`)}
            btnText="VLC"
            btnImage="/players/vlc.png"
          />
          <DownloadButton
            onClickCallback={() => window.open(`potplayer://${getBaseUrl()}${videoUrl}`)}
            btnText="PotPlayer"
            btnImage="/players/potplayer.png"
          />
          <DownloadButton
            onClickCallback={() => window.open(`nplayer-http://${window?.location.hostname ?? ''}${videoUrl}`)}
            btnText="nPlayer"
            btnImage="/players/nplayer.png"
          />
        </div>
      </DownloadBtnContainer>
    </>
  )
}

export default VideoPreview
