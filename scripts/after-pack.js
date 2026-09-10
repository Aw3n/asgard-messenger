/**
 * Linux: chrome-sandbox must be root-owned + setuid (4755) or Chromium
 * refuses to start. AppImage / user .deb installs cannot set that, so
 * the app also passes --no-sandbox (see electron/main.ts). chmod here
 * still helps when the package is installed as root (system .deb).
 */
const fs = require('fs')
const path = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return

  const sandbox = path.join(context.appOutDir, 'chrome-sandbox')
  if (!fs.existsSync(sandbox)) return

  try {
    fs.chmodSync(sandbox, 0o4755)
  } catch (err) {
    console.warn('[afterPack] could not chmod chrome-sandbox:', err.message)
  }
}
