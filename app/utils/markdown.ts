import MarkdownIt from 'markdown-it'

/**
 * Spec §2 / §11.5: html:false escapes raw HTML, linkify:false leaves bare
 * URLs as text, and markdown-it's default validateLink refuses javascript:,
 * vbscript:, file: and non-image data: URLs. GFM tables and fences are on
 * by default.
 */
const md = new MarkdownIt({ html: false, linkify: false, typographer: false })

export function renderMarkdown(source: string): string {
  return md.render(source)
}
