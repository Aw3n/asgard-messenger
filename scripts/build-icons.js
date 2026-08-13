/**
 * Build cross-platform icons from the source SVG/PNG.
 * Generates:
 * - assets/icon.ico (already exists)
 * - assets/icon.icns for macOS
 * - assets/icons/<size>.png for Linux
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const ASSETS_DIR = path.join(__dirname, '..', 'assets')
const ICONS_DIR = path.join(ASSETS_DIR, 'icons')
const SOURCE_PNG = path.join(ASSETS_DIR, 'asgard-icon.png')
const SOURCE_SVG = path.join(ASSETS_DIR, 'asgard-icon.svg')

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

async function renderPng(size) {
  const source = fs.existsSync(SOURCE_SVG) ? SOURCE_SVG : SOURCE_PNG
  return sharp(source).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
}

async function buildLinuxIcons() {
  await ensureDir(ICONS_DIR)
  const sizes = [16, 24, 32, 48, 64, 96, 128, 256, 512, 1024]
  for (const size of sizes) {
    const out = path.join(ICONS_DIR, `${size}x${size}.png`)
    const buf = await renderPng(size)
    fs.writeFileSync(out, buf)
    console.log(`Generated ${out}`)
  }
}

async function buildIcns() {
  // ICNS type codes for PNG-encoded images (macOS 10.5+)
  const entries = [
    { size: 16, type: 'icp4' },
    { size: 32, type: 'icp5' },
    { size: 64, type: 'icp6' },
    { size: 128, type: 'ic07' },
    { size: 256, type: 'ic08' },
    { size: 512, type: 'ic09' },
    { size: 1024, type: 'ic10' },
  ]

  const iconData = []
  for (const { size, type } of entries) {
    const png = await renderPng(size)
    const header = Buffer.alloc(8)
    header.write(type, 0, 4, 'ascii')
    header.writeUInt32BE(png.length + 8, 4)
    iconData.push(Buffer.concat([header, png]))
  }

  const totalLength = iconData.reduce((sum, b) => sum + b.length, 0) + 8
  const icns = Buffer.alloc(totalLength)
  icns.write('icns', 0, 4, 'ascii')
  icns.writeUInt32BE(totalLength, 4)

  let offset = 8
  for (const data of iconData) {
    data.copy(icns, offset)
    offset += data.length
  }

  const out = path.join(ASSETS_DIR, 'icon.icns')
  fs.writeFileSync(out, icns)
  console.log(`Generated ${out}`)
}

async function main() {
  await ensureDir(ASSETS_DIR)
  await buildLinuxIcons()
  await buildIcns()
}

main().catch((err) => {
  console.error('Icon build failed:', err)
  process.exit(1)
})
