// Stable per-browser device identity, sent on every request so the backend can
// group sessions by device (the raw id is never stored server-side — it's
// hashed with a server pepper). Mirrors tres6zero's deviceHeaders() approach.
const DEVICE_ID_KEY = 'corte-device-id'
const DEVICE_NAME_KEY = 'corte-device-name'

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id) { id = randomHex(16); localStorage.setItem(DEVICE_ID_KEY, id) }
    return id
  } catch {
    return 'no-storage'
  }
}

export function getDeviceName(): string {
  try {
    const cached = localStorage.getItem(DEVICE_NAME_KEY)
    if (cached) return cached
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
    const platform = nav.userAgentData?.platform || navigator.platform || 'Web'
    const name = `${platform} · ${navigator.language || 'pt-BR'}`.slice(0, 80)
    localStorage.setItem(DEVICE_NAME_KEY, name)
    return name
  } catch {
    return 'Web'
  }
}
