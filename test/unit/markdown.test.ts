import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../../app/utils/markdown'

describe('renderMarkdown', () => {
  it('escapes raw HTML instead of emitting it', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<a href="https://x.invalid">raw</a>')
    expect(html).not.toContain('<script')
    expect(html).not.toMatch(/<[a-z][^>]*onerror=/i)
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<a href')
    expect(html).toContain('&lt;script&gt;')
  })

  it('refuses javascript:, vbscript:, file: and non-image data: links', () => {
    const html = renderMarkdown([
      '[x](javascript:alert(1))',
      '[y](vbscript:msgbox)',
      '[z](file:///etc/passwd)',
      '[w](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
    ].join('\n\n'))
    expect(html).not.toMatch(/href="(javascript|vbscript|file|data):/i)
    expect(html).not.toContain('<a ')
  })

  it('keeps ordinary links, tables and fenced code', () => {
    const html = renderMarkdown([
      '[docs](https://example.com/docs)',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '```sh',
      'echo "<b>not bold</b>"',
      '```',
    ].join('\n'))
    expect(html).toContain('<a href="https://example.com/docs">docs</a>')
    expect(html).toContain('<table>')
    expect(html).toContain('<td>1</td>')
    expect(html).toContain('<pre><code class="language-sh">')
    expect(html).toContain('&lt;b&gt;not bold&lt;/b&gt;')
  })

  it('leaves quotes and dashes alone (no typographer)', () => {
    expect(renderMarkdown('"quoted" -- dash')).toContain('&quot;quoted&quot; -- dash')
  })
})
