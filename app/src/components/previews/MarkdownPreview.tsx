import { FC, CSSProperties, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import { markdownSchema, markdownImageUrl } from '../../utils/markdown'
import { useTranslation } from 'next-i18next'
import SyntaxHighlighter from 'react-syntax-highlighter/dist/cjs/light-async'
import { tomorrowNight } from 'react-syntax-highlighter/dist/cjs/styles/hljs'

import 'katex/dist/katex.min.css'

import useFileContent from '../../utils/fetchOnMount'
import FourOhFour from '../FourOhFour'
import Loading from '../Loading'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import { DownloadBtnContainer, PreviewContainer } from './Containers'
import BasicInfoPanel from './BasicInfoPanel'

const MarkdownPreview: FC<{
  file: any
  path: string
  standalone?: boolean
  setContent?: string,
  hashedToken?: string
}> = ({ file, path, standalone = true, setContent, hashedToken }) => {
  // The parent folder of the markdown file, which is also the relative image folder
  const parentPath = standalone ? path.substring(0, path.lastIndexOf('/')) : path

  const { response: content, error, validating } = useFileContent(`/api/raw/?path=${parentPath}/${encodeURIComponent(file?.name ?? '')}`, path, setContent)
  const { t } = useTranslation()

  // Custom renderer:
  const customRenderer = {
    // img: to render images in markdown with relative file paths
    img: ({
      alt,
      src,
      title,
      width,
      height,
      style,
    }: {
      alt?: string
      src?: string
      title?: string
      width?: string | number
      height?: string | number
      style?: CSSProperties
    }) => {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={alt}
          src={markdownImageUrl(parentPath, src)}
          title={title}
          width={width}
          height={height}
          style={style}
        />
      )
    },
    // code: to render code blocks with react-syntax-highlighter
    code({
      className,
      children,
      inline,
      ...props
    }: {
      className?: string | undefined
      children: ReactNode
      inline?: boolean
    }) {
      if (inline) {
        return (
          <code className={className} {...props}>
            {children}
          </code>
        )
      }

      const match = /language-(\w+)/.exec(className || '')
      return (
        <SyntaxHighlighter language={match ? match[1] : 'language-text'} style={tomorrowNight} customStyle={{ backgroundColor: 'transparent' }} PreTag="div" {...props}>
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      )
    },
  }

  if (error) {
    return (
      <PreviewContainer>
        <FourOhFour errorMsg={error} />
      </PreviewContainer>
    )
  }
  if (validating) {
    return (
      <>
        {standalone && <BasicInfoPanel file={file}></BasicInfoPanel>}
        <div className="border-t border-gray-900/10 bg-white bg-opacity-80 p-2 shadow-sm backdrop-blur-md dark:border-gray-500/30 dark:bg-gray-900 rounded !bg-opacity-50">
          <Loading loadingText={t('Loading file content...')} />
        </div>
        {standalone && (
          <DownloadBtnContainer>
            <DownloadButtonGroup hashedToken={hashedToken} />
          </DownloadBtnContainer>
        )}
      </>
    )
  }

  return (
    <div>
      {standalone && <BasicInfoPanel file={file}></BasicInfoPanel>}
      <div className="border-t border-gray-900/10 bg-white p-2 shadow-sm backdrop-blur-md dark:border-gray-500/30 dark:bg-gray-900 rounded !bg-opacity-50">
        <div className="markdown-body">
          {/* Sanitize source HTML before rendering trusted math output. */}
          <ReactMarkdown
            // @ts-ignore
            remarkPlugins={[remarkGfm, remarkMath]}
            // The type error is introduced by caniuse-lite upgrade.
            // Since type errors occur often in remark toolchain and the use is so common,
            // ignoring it shoudld be safe enough.
            // @ts-ignore
            rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSchema], rehypeKatex]}
            components={customRenderer}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
      {standalone && (
        <DownloadBtnContainer>
          <DownloadButtonGroup hashedToken={hashedToken} />
        </DownloadBtnContainer>
      )}
    </div>
  )
}

export default MarkdownPreview
