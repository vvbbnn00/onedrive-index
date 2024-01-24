import type {OdFileObject} from '../../types'
import {FC} from 'react'

import DownloadButtonGroup from '../DownloadBtnGtoup'
import {DownloadBtnContainer} from './Containers'
import BasicInfoPanel from './BasicInfoPanel'

const DefaultPreview: FC<{ file: OdFileObject, hashedToken?: string }> = ({file, hashedToken}) => {
    return (
        <div>
            <BasicInfoPanel file={file} hashedToken={hashedToken}></BasicInfoPanel>
            <DownloadBtnContainer>
                <DownloadButtonGroup hashedToken={hashedToken}/>
            </DownloadBtnContainer>
        </div>
    )
}

export default DefaultPreview
