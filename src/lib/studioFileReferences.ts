import { BLUEPRINT_PROMPT_LIMIT } from './blueprintRequest.ts'

export const STUDIO_REFERENCE_FILE_ACCEPT = '.glb,.obj,.stl,.txt,.md,.csv,.json'
export const MODEL_REFERENCE_BYTES = 20 * 1024 * 1024
export const TEXT_REFERENCE_BYTES = 64 * 1024
export type ReferenceFileKind = 'glb' | 'obj' | 'stl' | 'text'

/** References use the existing prompt/image route; original files are never executed. */
export function referenceFileKind(file: { name: string; size: number }): ReferenceFileKind {
  const extension = file.name.toLowerCase().split('.').at(-1)
  const kind = ['txt', 'md', 'csv', 'json'].includes(extension ?? '') ? 'text'
    : ['glb', 'obj', 'stl'].includes(extension ?? '') ? extension as ReferenceFileKind : null
  if (!kind) throw new Error('Use GLB, OBJ or STL as a model reference, or TXT, MD, CSV or JSON as a written brief. Export other documents to text and other models to an embedded GLB first.')
  if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new Error('This reference file is empty.')
  if (file.size > (kind === 'text' ? TEXT_REFERENCE_BYTES : MODEL_REFERENCE_BYTES))
    throw new Error(kind === 'text' ? 'Use a text reference up to 64 KB.' : 'Use a model reference up to 20 MB.')
  return kind
}

export function appendReferenceText(prompt: string, name: string, bytes: ArrayBuffer): string {
  if (!bytes.byteLength || bytes.byteLength > TEXT_REFERENCE_BYTES) throw new Error('Use a text reference up to 64 KB.')
  let content: string
  try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '').trim() }
  catch { throw new Error('Save the written reference as UTF-8 text first.') }
  if (!content || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(content)) throw new Error('This file does not contain a readable text brief.')
  const title = name.replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, 100)
  const next = `${prompt.trim()}${prompt.trim() ? '\n\n' : ''}Reference brief (${title}):\n${content}`
  if (next.length > BLUEPRINT_PROMPT_LIMIT) throw new Error(`The description and entire file exceed ${BLUEPRINT_PROMPT_LIMIT} characters. Shorten the brief first; no contents were truncated or attached.`)
  return next
}
