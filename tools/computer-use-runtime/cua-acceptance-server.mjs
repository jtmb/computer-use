import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

export function acceptancePage(second = false) {
  return `<!doctype html><html lang="en"><meta charset="utf-8">
<title>Local CUA acceptance${second ? ' — second page' : ''}</title>
<style>body{font:20px system-ui;max-width:720px;margin:60px auto;background:#f8fafc;color:#172033}input,button{font:inherit;padding:10px;margin:12px 6px 12px 0}output{display:block;background:white;padding:20px;border:1px solid #cbd5e1}a{display:block;margin-top:24px}</style>
<h1>${second ? 'Second sample page' : 'Computer-use sample page'}</h1>
<p>This page is a disposable local test. It uses no account and sends no form data.</p>
<label for="note">Sample note</label><br><input id="note" value="" autocomplete="off">
<button id="apply" type="button">Show note</button><output id="result" aria-live="polite">Nothing changed yet.</output>
<a href="${second ? '/' : '/second'}">${second ? 'First sample page' : 'Second sample page'}</a>
<script>document.getElementById('apply').addEventListener('click',()=>{document.getElementById('result').textContent='Verified note: '+document.getElementById('note').value})</script></html>`
}

export async function startAcceptanceServer() {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname
    if (request.method !== 'GET' || !['/', '/second'].includes(pathname)) {
      response.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'no-store' })
      response.end('Sample page not found.')
      return
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action 'none'; connect-src 'none'; frame-ancestors 'none'" })
    response.end(acceptancePage(pathname === '/second'))
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  return { server, url: `http://127.0.0.1:${address.port}` }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3 || process.argv[2] !== '--serve') throw new Error('Use --serve to start the disposable loopback sample page for at most ten minutes.')
  const { server, url } = await startAcceptanceServer()
  console.log(JSON.stringify({ url, pid: process.pid, host: '127.0.0.1', expiresAfterSeconds: 600 }))
  const deadline = setTimeout(() => server.close(), 600_000)
  const close = () => { clearTimeout(deadline); server.close() }
  process.once('SIGTERM', close)
  process.once('SIGINT', close)
}
