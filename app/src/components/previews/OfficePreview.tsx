import type {OdFileObject} from '../../types'
import {FC, useEffect, useRef, useState} from 'react'
import {useRouter} from 'next/router'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import {DownloadBtnContainer} from './Containers'
import {getBaseUrl} from '../../utils/getBaseUrl'
import BasicInfoPanel from './BasicInfoPanel'

const OfficePreview: FC<{ file: OdFileObject, hashedToken?: string }> = ({file, hashedToken}) => {
    const {asPath} = useRouter()

    const docContainer = useRef<HTMLDivElement>(null)
    const [docContainerWidth, setDocContainerWidth] = useState(600)

    const docUrl = encodeURIComponent(
        `${getBaseUrl()}/api/raw/?path=${asPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`
    )
    const url = `https://view.officeapps.live.com/op/embed.aspx?src=${docUrl}`

    useEffect(() => {
        setDocContainerWidth(docContainer.current ? docContainer.current.offsetWidth : 600)
    }, [])

    return (
        <div>
            <BasicInfoPanel file={file}></BasicInfoPanel>

            <div
                className="overflow-scroll border-t border-gray-900/10 bg-whitep-2 shadow-sm dark:border-gray-500/30 dark:bg-gray-900 rounded backdrop-blur-md !bg-opacity-50"
                ref={docContainer} style={{maxHeight: '90vh'}}>
                <iframe src={url} frameBorder="0" width="100%" height={docContainerWidth * 1.414}></iframe>
            </div>
            <DownloadBtnContainer>
                <DownloadButtonGroup hashedToken={hashedToken}/>
            </DownloadBtnContainer>
        </div>
    )
}

export default OfficePreview
