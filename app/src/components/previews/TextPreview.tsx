import { useRouter } from 'next/router'
import { useTranslation } from 'next-i18next'

import FourOhFour from '../FourOhFour'
import Loading from '../Loading'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import useFileContent from '../../utils/fetchOnMount'
import { DownloadBtnContainer, PreviewContainer } from './Containers'
import BasicInfoPanel from './BasicInfoPanel'

const TextPreview = ({ file }) => {
  const { asPath } = useRouter()
  const { t } = useTranslation()

  const { response: content, error, validating } = useFileContent(`/api/raw/?path=${asPath}`, asPath)
  if (error) {
    return (
      <PreviewContainer>
        <FourOhFour errorMsg={error} />
      </PreviewContainer>
    )
  }


  return (
    <>
      <BasicInfoPanel file={file}></BasicInfoPanel>

      <div className='w-full overflow-hidden border-t border-gray-900/10 bg-white bg-opacity-80 p-2 shadow-sm backdrop-blur-md dark:border-gray-500/30 dark:bg-gray-900 rounded backdrop-blur-md !bg-opacity-50'>
        {validating && <Loading loadingText={t('Loading file content...')} />}
        {(!content && !validating) && <FourOhFour errorMsg={t('File is empty.')} />}
        {(content && !validating) && <pre className="overflow-x-scroll p-0 text-sm md:p-3">{content}</pre>}
      </div>
      
      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>
    </>
  )
}

export default TextPreview
