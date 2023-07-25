import type { OdFileObject } from '../../types'

import { FC, useState } from 'react'
import { useRouter } from 'next/router'

import { DownloadBtnContainer } from './Containers'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import { getStoredToken } from '../../utils/protectedRouteHandler'
import BasicInfoPanel from './BasicInfoPanel'
import Loading from '../Loading'
import { useTranslation } from 'react-i18next'

const ImagePreview: FC<{ file: OdFileObject }> = ({ file }) => {
  const { t } = useTranslation()
  const { asPath } = useRouter()
  const hashedToken = getStoredToken(asPath)
  const [isLoading, setIsLoading] = useState(true);
  const handleImageLoad = () => {
    setIsLoading(false);
  };

  return (
    <>
      <BasicInfoPanel file={file}></BasicInfoPanel>
      <div className='no-scrollbar flex w-full flex-col overflow-scroll rounded bg-white dark:bg-gray-900 md:p-3 border-t border-gray-900/10 dark:border-gray-500/30 backdrop-blur-md !bg-opacity-50'>
        {isLoading && <Loading loadingText={t('Loading file content...')} />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`mx-auto ${isLoading ? 'hidden' : ''}`} // Hide the image while loading
          src={`/api/raw/?path=${asPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`}
          alt={file.name}
          width={file.image?.width}
          height={file.image?.height}
          onLoad={handleImageLoad}
        />
      </div>
      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>
    </>
  )
}

export default ImagePreview
