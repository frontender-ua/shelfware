import http from 'node:http'

export interface RawResponse {
  status: number
  headers: http.IncomingHttpHeaders
  text: string
}

export interface RawRequestInit {
  method?: string
  headers?: Record<string, string>
  body?: string
}

export function rawRequest(url: string, init: RawRequestInit = {}): Promise<RawResponse> {
  const target = new URL(url)
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: init.method ?? 'GET',
        headers: init.headers ?? {},
      },
      (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          text += chunk
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text }))
      },
    )
    req.on('error', reject)
    if (init.body) req.write(init.body)
    req.end()
  })
}
