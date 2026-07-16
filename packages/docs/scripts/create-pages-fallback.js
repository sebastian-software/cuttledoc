import { readFile, writeFile } from 'node:fs/promises'

const buildRoot = new URL('../build/client/', import.meta.url)
const indexHtml = await readFile(new URL('index.html', buildRoot), 'utf8')
const fallbackHtml = indexHtml.replace('</head>', '<meta name="robots" content="noindex" /></head>')

await writeFile(new URL('404.html', buildRoot), fallbackHtml)
