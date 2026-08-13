/**
 * Generate PNG and ICO icons from the SVG compass logo.
 * Uses sharp (already in devDependencies).
 */
import sharp from 'sharp'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

const svgPath = join(projectRoot, 'assets', 'asgard-icon.svg')
const svgBuffer = readFileSync(svgPath)

// Icon sizes for Windows ICO (multi-resolution)
const sizes = [16, 24, 32, 48, 64, 128, 256]

async function generatePngs() {
  const pngs = []
  for (const size of sizes) {
    const png = await sharp(svgBuffer, { density: 384 })
      .resize(size, size)
      .png()
      .toBuffer()
    pngs.push({ size, buffer: png })
    console.log(`  Generated PNG ${size}x${size} (${png.length} bytes)`)
  }
  return pngs
}

async function generateMainPng() {
  // Main PNG at 512x512 for high quality
  const pngPath = join(projectRoot, 'assets', 'asgard-icon.png')
  await sharp(svgBuffer, { density: 384 })
    .resize(512, 512)
    .png()
    .toFile(pngPath)
  console.log(`Saved main PNG: ${pngPath}`)

  // Also save a 256x256 version to public/ for web use
  const publicPngPath = join(projectRoot, 'public', 'asgard-icon.png')
  await sharp(svgBuffer, { density: 384 })
    .resize(256, 256)
    .png()
    .toFile(publicPngPath)
  console.log(`Saved public PNG: ${publicPngPath}`)
}

/**
 * Create a multi-resolution ICO file from an array of PNG buffers.
 * ICO format: https://docs.fileformat.com/image/ico/
 */
function createIco(pngs) {
  const headerSize = 6
  const entrySize = 16
  const count = pngs.length
  const header = Buffer.alloc(headerSize)

  // ICONDIR header
  header.writeUInt16LE(0, 0)       // reserved, must be 0
  header.writeUInt16LE(1, 2)       // type: 1 = ICO
  header.writeUInt16LE(count, 4)   // number of images

  // Calculate offsets
  const dataOffset = headerSize + entrySize * count
  let currentOffset = dataOffset
  const entries = []
  const dataChunks = []

  for (const { size, buffer } of pngs) {
    const entry = Buffer.alloc(entrySize)
    const dim = size >= 256 ? 0 : size  // 0 means 256
    entry.writeUInt8(dim, 0)           // width
    entry.writeUInt8(dim, 1)           // height
    entry.writeUInt8(0, 2)             // color palette count (0 = no palette)
    entry.writeUInt8(0, 3)             // reserved
    entry.writeUInt16LE(1, 4)           // color planes
    entry.writeUInt16LE(32, 6)         // bits per pixel
    entry.writeUInt32LE(buffer.length, 8)  // image data size
    entry.writeUInt32LE(currentOffset, 12)  // image data offset

    entries.push(entry)
    dataChunks.push(buffer)
    currentOffset += buffer.length
  }

  return Buffer.concat([header, ...entries, ...dataChunks])
}

async function main() {
  console.log('Generating icons from SVG:', svgPath)

  // Generate all PNG sizes
  const pngs = await generatePngs()

  // Generate main PNG files
  await generateMainPng()

  // Generate ICO
  const icoBuffer = createIco(pngs)
  const icoPath = join(projectRoot, 'assets', 'icon.ico')
  writeFileSync(icoPath, icoBuffer)
  console.log(`Saved ICO: ${icoPath} (${icoBuffer.length} bytes)`)

  console.log('Done!')
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
