import type { OdFileObject } from '../../types'
import { FC, useEffect, useRef, useState } from 'react'

import ReactAudioPlayer from 'react-audio-player'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useTranslation } from 'next-i18next'
import { useRouter } from 'next/router'

import DownloadButtonGroup from '../DownloadBtnGtoup'
import { DownloadBtnContainer, PreviewContainer } from './Containers'
import { LoadingIcon } from '../Loading'
import { formatModifiedDateTime, humanFileSize } from '../../utils/fileDetails'
import { getStoredToken } from '../../utils/protectedRouteHandler'

enum PlayerState {
  Loading,
  Ready,
  Playing,
  Paused,
}

const AudioPreview: FC<{ file: OdFileObject }> = ({ file }) => {
  const { t } = useTranslation()
  const { asPath } = useRouter()
  const hashedToken = getStoredToken(asPath)

  const rapRef = useRef<ReactAudioPlayer>(null)
  const [playerStatus, setPlayerStatus] = useState(PlayerState.Loading)
  const [playerVolume, setPlayerVolume] = useState(1)

  // Render audio thumbnail, and also check for broken thumbnails
  const thumbnail = `/api/thumbnail/?path=${asPath}&size=medium${hashedToken ? `&odpt=${hashedToken}` : ''}`
  const [brokenThumbnail, setBrokenThumbnail] = useState(false)

  useEffect(() => {
    // Manually get the HTML audio element and set onplaying event.
    // - As the default event callbacks provided by the React component does not guarantee playing state to be set
    // - properly when the user seeks through the timeline or the audio is buffered.
    const rap = rapRef.current?.audioEl.current
    if (rap) {
      rap.oncanplay = () => setPlayerStatus(PlayerState.Ready)
      rap.onended = () => setPlayerStatus(PlayerState.Paused)
      rap.onpause = () => setPlayerStatus(PlayerState.Paused)
      rap.onplay = () => setPlayerStatus(PlayerState.Playing)
      rap.onplaying = () => setPlayerStatus(PlayerState.Playing)
      rap.onseeking = () => setPlayerStatus(PlayerState.Loading)
      rap.onwaiting = () => setPlayerStatus(PlayerState.Loading)
      rap.onerror = () => setPlayerStatus(PlayerState.Paused)
      rap.onvolumechange = () => setPlayerVolume(rap.volume)
    }
  }, [])

  return (
    <>
      <PreviewContainer>
        <div className="flex flex-col space-y-4 md:flex-row md:space-x-4">
          <div className="relative flex aspect-square w-full items-center justify-center rounded bg-gray-100 transition-all duration-75 dark:bg-gray-700 md:w-48">
            <div
              className={`absolute z-20 flex h-full w-full items-center justify-center transition-all duration-300 ${playerStatus === PlayerState.Loading
                  ? 'bg-white opacity-80 dark:bg-gray-800'
                  : 'bg-transparent opacity-0'
                }`}
            >
              <LoadingIcon className="z-10 inline-block h-5 w-5 animate-spin" />
            </div>

            {!brokenThumbnail ? (
              <div className="absolute m-4 aspect-square rounded-full shadow-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={`h-full w-full rounded-full object-cover object-top ${playerStatus === PlayerState.Playing ? 'animate-spin-slow' : ''
                    }`}
                  src={thumbnail}
                  alt={file.name}
                  onError={() => setBrokenThumbnail(true)}
                />
              </div>
            ) : (
              <FontAwesomeIcon
                className={`z-10 h-5 w-5 ${playerStatus === PlayerState.Playing ? 'animate-spin' : ''}`}
                icon="music"
                size="2x"
              />
            )}
          </div>

          <div className="flex w-full flex-col justify-between">
            <div>
              <div className="mb-2 font-medium">{file.name}</div>
              <div className="mb-0 text-sm text-gray-500">
                {t('Last modified') + ': ' + formatModifiedDateTime(file.lastModifiedDateTime)}
              </div>
              <div className="mb-4 text-sm text-gray-500">
                {t('File size') + ': ' + humanFileSize(file.size)}
              </div>
            </div>


            <ReactAudioPlayer
              className="h-11 w-full"
              src={`/api/raw/?path=${asPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`}
              ref={rapRef}
              controls
              preload="auto"
              volume={playerVolume}
            />
          </div>
        </div>
        <div className="flex flex-col space-y-2 py-4 md:flex-1">
          <div>
            <div className="py-2 text-xs font-medium uppercase opacity-80">{t('Hashes')}</div>
            <table className="block w-full overflow-scroll whitespace-nowrap text-sm md:table">
              <tbody>
                <tr className="border-y bg-white dark:border-gray-700 dark:bg-gray-900">
                  <td className="bg-gray-50 py-1 px-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:bg-gray-800 dark:text-gray-400">
                    Quick XOR
                  </td>
                  <td className="whitespace-nowrap py-1 px-3 font-mono text-gray-500 dark:text-gray-400">
                    {file.file.hashes?.quickXorHash ?? t('Unavailable')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </PreviewContainer>

      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>
    </>
  )
}

export default AudioPreview
