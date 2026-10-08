import { defaultSchema } from 'rehype-sanitize'

// Permit only the math markers used by remark-math; KaTeX runs after sanitizing.
export const markdownSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-[\w-]+$/]],
    div: [...(defaultSchema.attributes?.div ?? []), ['className', 'math', 'math-display']],
    span: [...(defaultSchema.attributes?.span ?? []), ['className', 'math', 'math-inline']],
  },
}

export function markdownImageUrl(parentPath: string, src = ''): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) return src
  try {
    const base = new URL(parentPath.replace(/\/$/, '') + '/', 'https://markdown.invalid')
    const image = new URL(src, base)
    return `/api/raw/?path=${encodeURIComponent(decodeURIComponent(image.pathname))}`
  } catch { return '' }
}
