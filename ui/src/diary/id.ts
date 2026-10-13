/** 生成日记标识。HTTP 局域网等非安全上下文没有 crypto.randomUUID。 */
export function newEntryId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      return crypto.randomUUID()
  } catch {
    /* 继续用 getRandomValues */
  }
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function')
    crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
