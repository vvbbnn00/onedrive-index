import type { OdFileObject } from '../../types'
import { FC } from 'react'

import DownloadButtonGroup from '../DownloadBtnGtoup'
import { DownloadBtnContainer } from './Containers'
import BasicInfoPanel from './BasicInfoPanel'

const DefaultPreview: FC<{ file: OdFileObject }> = ({ file }) => {
  return (
    <div>
      <BasicInfoPanel file={file}></BasicInfoPanel>
      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>
    </div>
  )
}

export default DefaultPreview
