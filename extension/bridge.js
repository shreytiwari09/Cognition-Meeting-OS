// Runs on the MeetingOS web app. The "Connect extension" page hands the extension its token through
// window.postMessage; only pages on the origins listed in manifest.json can do this.
const reply = (type, extra = {}) => window.postMessage({ type, ...extra }, location.origin)

window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== location.origin) return
  const msg = event.data || {}

  if (msg.type === 'MEETINGOS_PING') {
    chrome.storage.local.get('connection', ({ connection }) =>
      reply('MEETINGOS_EXTENSION_PRESENT', { connected: !!connection?.token && !connection.needsReconnect, name: connection?.name || '' }))
  }

  if (msg.type === 'MEETINGOS_CONNECT' && typeof msg.token === 'string' && msg.token.startsWith('mos_ext_')) {
    const connection = {
      token: msg.token, apiUrl: String(msg.apiUrl || '').replace(/\/$/, ''), appUrl: location.origin,
      name: msg.name || '', role: msg.role || '', companyName: msg.companyName || '', connectedAt: Date.now(),
    }
    chrome.storage.local.set({ connection }, () => reply('MEETINGOS_CONNECTED', { name: connection.name }))
  }

  if (msg.type === 'MEETINGOS_DISCONNECT') {
    chrome.storage.local.remove('connection', () => reply('MEETINGOS_DISCONNECTED'))
  }
})

reply('MEETINGOS_EXTENSION_PRESENT')
