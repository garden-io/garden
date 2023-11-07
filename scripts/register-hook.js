import url from 'node:url'
import { register } from 'node:module'

const __filename = url.fileURLToPath(import.meta.url)
register('ts-node/esm', url.pathToFileURL(__filename))
