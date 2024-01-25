import {FC, useEffect, useState} from 'react'
import {useTranslation} from 'next-i18next'
import {useRouter} from 'next/router'

import {LightAsync as SyntaxHighlighter} from 'react-syntax-highlighter'
import {tomorrowNightEighties, tomorrow} from 'react-syntax-highlighter/dist/cjs/styles/hljs'

import useFileContent from '../../utils/fetchOnMount'
import {getLanguageByFileName} from '../../utils/getPreviewType'
import FourOhFour from '../FourOhFour'
import Loading from '../Loading'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import {DownloadBtnContainer, PreviewContainer} from './Containers'
import BasicInfoPanel from './BasicInfoPanel'

const CodePreview: FC<{ file: any, hashedToken?: string }> = ({file, hashedToken}) => {
    const {asPath} = useRouter()
    const {response: content, error, validating} = useFileContent(`/api/raw/?path=${asPath}`, asPath)
    const [darkMode, setDarkMode] = useState(false);

    useEffect(() => {
        // Detect system dark mode
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        setDarkMode(mediaQuery.matches);

        // Listen for changes to the prefers-color-scheme media query
        const handleChange = (e) => {
            setDarkMode(e.matches);
        };

        mediaQuery.addEventListener('change', handleChange);

        // Call listener manually at run time
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    const {t} = useTranslation()

    if (error) {
        return (
            <PreviewContainer>
                <FourOhFour errorMsg={error}/>
            </PreviewContainer>
        )
    }
    if (validating) {
        return (
            <>
                <BasicInfoPanel file={file}></BasicInfoPanel>
                <div
                    className="no-scrollbar flex w-full flex-col overflow-scroll rounded bg-white dark:bg-gray-900 md:p-3 border-t border-gray-900/10 dark:border-gray-500/30 backdrop-blur-md !bg-opacity-50">
                    <Loading loadingText={t('Loading file content...')}/>
                </div>
                <DownloadBtnContainer>
                    <DownloadButtonGroup hashedToken={hashedToken}/>
                </DownloadBtnContainer>
            </>
        )
    }

    return (
        <>
            <BasicInfoPanel file={file}></BasicInfoPanel>
            <div
                className="no-scrollbar flex w-full flex-col overflow-scroll rounded bg-white dark:bg-gray-900 md:p-3 border-t border-gray-900/10 dark:border-gray-500/30 backdrop-blur-md !bg-opacity-50">
                <SyntaxHighlighter
                    language={getLanguageByFileName(file.name)}
                    style={darkMode ? tomorrowNightEighties : tomorrow}
                    customStyle={{backgroundColor: 'transparent'}}
                >
                    {content}
                </SyntaxHighlighter>
            </div>
            <DownloadBtnContainer>
                <DownloadButtonGroup hashedToken={hashedToken}/>
            </DownloadBtnContainer>
        </>
    )
}

export default CodePreview
