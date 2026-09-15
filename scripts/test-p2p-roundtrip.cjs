// Test de round-trip P2P reproduisant EXACTEMENT setupPeer (NetworkService.ts L1770-1990) :
// NoiseSecretStream → Protomux.from → [corestore.replicate] → pair() handlers
// → createChannel('asgard') → addMessage(c.binary) → open → identify ×2 → messages applicatifs.
//
// Objectif : discriminer "nos octets partent mais le pair est zombie" vs "émission gelée".
// Phases :
//   1. Symétrique sans corestore (les deux côtés créent leur canal dans le tick de connexion)
//   2. Symétrique avec corestore.replicate (ordre exact du code réel, AVANT les pair() asgard)
//   3. Asymétrique sans corestore (A tarde 400ms → l'OPEN de B arrive en premier → chemin pair())
//   4. Asymétrique avec corestore
// Usage : node scripts/test-p2p-roundtrip.cjs

const net = require('node:net')
const Protomux = require('protomux')
const c = require('compact-encoding')
const b4a = require('b4a')

// noise-secret-stream n'est pas un package top-level — le transport chiffré est
// prouvé fonctionnel par le log utilisateur (l'identify circule) ; on teste la couche
// mux sur des sockets TCP bruts. userData=null émule NoiseSecretStream/streamx pour
// que Protomux.from() cache l'instance (comme dans l'app réelle avec corestore.replicate).
function asMuxStream(socket) {
  socket.userData = null
  return socket
}

// RAM minimal pour Corestore (random-access-memory non installé)
function makeRAM() {
  const files = new Map()
  return (name) => {
    let buf = files.get(name) || Buffer.alloc(0)
    files.set(name, buf)
    return {
      open(_opts, cb) { setImmediate(cb, null) },
      write(offset, data, cb) {
        const end = offset + data.length
        if (end > buf.length) {
          const nb = Buffer.alloc(Math.max(end, buf.length * 2))
          buf.copy(nb)
          data.copy(nb, offset)
          buf = nb
        } else {
          data.copy(buf, offset)
        }
        files.set(name, buf)
        setImmediate(cb, null)
      },
      read(offset, length, cb) {
        if (offset + length > buf.length) return setImmediate(cb, new Error('Out of bounds'))
        setImmediate(cb, null, buf.subarray(offset, offset + length))
      },
      del(_offset, _length, cb) { setImmediate(cb, null) },
      stat(cb) { setImmediate(cb, null, { size: buf.length }) },
      close(cb) { setImmediate(cb, null) },
    }
  }
}

const TAP = process.argv.includes('--tap')

// Tap wire-level : logue chaque write sortant et chaque chunk 'data' entrant
function tapStream(sock, name) {
  sock.userData = null
  const origWrite = sock.write.bind(sock)
  sock.write = (buf, ...rest) => {
    if (TAP) console.log(`  [wire:${name}] ⟵ WRITE ${buf.length}B ${buf.subarray(0, 20).toString('hex')}`)
    return origWrite(buf, ...rest)
  }
  if (TAP) sock.on('data', (chunk) => {
    console.log(`  [wire:${name}] ⟶ DATA  ${chunk.length}B ${chunk.subarray(0, 20).toString('hex')}`)
  })
  return sock
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function makeSide(name, pk) {
  return { name, pk, identified: 0, jsonReceived: [], mux: null, channel: null, sendMsg: null }
}

// Reproduit setupPeer — y compris le double-send de l'identify (onopen + post-addMessage)
function setupSide(side, stream) {
  const mux = Protomux.from(stream)
  side.mux = mux

  let channel = null
  let mainSendMsg = null

  const onMainMessage = (buf) => {
    const data = b4a.from(buf)
    if (data.length > 0 && data[0] === 0x01) {
      side.identified++
      console.log(`  [${side.name}] IDENTITY RECEIVED ← ${data.slice(1).toString('utf-8').slice(0, 24)}…`)
      return
    }
    if (data.length > 0 && data[0] === 0x02) {
      console.log(`  [${side.name}] MEDIA-FALLBACK RECEIVED size=${data.length}`)
      return
    }
    let text = ''
    try { text = data.toString('utf-8') } catch {}
    side.jsonReceived.push(text)
    console.log(`  [${side.name}] JSON RECEIVED size=${data.length}: ${text.slice(0, 70)}`)
  }

  const sendIdentityFrame = () => {
    if (!side.pk || !mainSendMsg) return
    try {
      const idBuf = Buffer.from(side.pk, 'utf-8')
      const payload = Buffer.alloc(1 + idBuf.length)
      payload[0] = 0x01
      idBuf.copy(payload, 1)
      mainSendMsg.send(payload)
    } catch (err) {
      console.warn(`  [${side.name}] Identity send failed: ${err.message}`)
    }
  }

  const createMainChannel = () => {
    if (channel) return channel
    channel = mux.createChannel({
      protocol: 'asgard',
      id: null,
      onopen: () => { sendIdentityFrame() },
      onclose: () => { console.log(`  [${side.name}] main channel closed`) },
      ondestroy: () => { console.log(`  [${side.name}] main channel destroyed`) },
    })
    if (channel) {
      mainSendMsg = channel.addMessage({ encoding: c.binary, onmessage: onMainMessage })
      channel.open()
      sendIdentityFrame() // double-send comme le code réel (L1900-1901)
      side.channel = channel
      side.sendMsg = mainSendMsg
    } else {
      console.log(`  [${side.name}] main channel REJECTED (null)`)
    }
    return channel
  }

  mux.pair({ protocol: 'asgard', id: null }, async () => { createMainChannel() })
  createMainChannel()

  return side
}

async function runOnce(label, { withCorestore, delayA }) {
  console.log(`\n─────── ${label} ───────`)

  let Corestore = null
  let RAM = null
  if (withCorestore) {
    try {
      Corestore = require('corestore')
      RAM = require('random-access-memory')
    } catch (err) {
      console.log(`  [skip] corestore/random-access-memory indisponible: ${err.message}`)
      return null
    }
  }

  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  const port = server.address().port

  const A = makeSide('A', 'PK_A_' + 'aa'.repeat(42))
  const B = makeSide('B', 'PK_B_' + 'bb'.repeat(42))

  const bReady = new Promise((resolve) => {
    server.once('connection', (raw) => {
      const ns = tapStream(raw, 'B')
      if (Corestore) {
        const cs = new Corestore(makeRAM())
        cs.replicate(ns) // ordre exact du code réel : AVANT les pair() asgard
      }
      setupSide(B, ns)
      resolve()
    })
  })

  const rawA = net.connect(port, '127.0.0.1')
  await new Promise((r) => rawA.once('connect', r))
  const nsA = tapStream(rawA, 'A')

  if (delayA > 0) await sleep(delayA) // A tarde : l'OPEN de B arrivera en premier → chemin pair()

  if (Corestore) {
    const cs = new Corestore(makeRAM())
    cs.replicate(nsA)
  }
  setupSide(A, nsA)

  await bReady
  await sleep(1000) // handshake + échange d'identify

  const sendApp = (side, obj) => {
    if (!side.sendMsg) {
      console.log(`  [${side.name}] ✗ PAS DE sendMsg — canal jamais créé !`)
      return
    }
    side.sendMsg.send(Buffer.from(JSON.stringify(obj)))
  }

  // 1. Chat simple A→B
  sendApp(A, { type: 'chat:message', from: A.pk, text: 'salut B' })
  await sleep(300)
  // 2. Réponse B→A
  sendApp(B, { type: 'chat:receipt', from: B.pk, text: 'bien reçu A' })
  await sleep(300)
  // 3. Batch corké A→B (comme sendMediaBatch)
  A.mux.cork()
  for (let i = 0; i < 5; i++) sendApp(A, { type: 'presence:update', i })
  A.mux.uncork()
  await sleep(700)
  // 4. Après le batch, un message tardif des deux côtés (vérifie que rien n'est gelé)
  sendApp(A, { type: 'late:ping' })
  sendApp(B, { type: 'late:pong' })
  await sleep(700)

  let aJson = []
  let bJson = []
  try {
    aJson = A.jsonReceived.map((t) => JSON.parse(t).type)
    bJson = B.jsonReceived.map((t) => JSON.parse(t).type)
  } catch {}

  const okIdentifyA = A.identified >= 1
  const okIdentifyB = B.identified >= 1
  const okChatB = bJson.includes('chat:message')
  const okReceiptA = aJson.includes('chat:receipt')
  const okBatchB = bJson.filter((t) => t === 'presence:update').length === 5
  const okLateA = aJson.includes('late:pong')
  const okLateB = bJson.includes('late:ping')
  const ok = okIdentifyA && okIdentifyB && okChatB && okReceiptA && okBatchB && okLateA && okLateB

  console.log(`  identify : A←B=${A.identified}  B←A=${B.identified}`)
  console.log(`  A a reçu ${A.jsonReceived.length} JSON : ${aJson.join(', ')}`)
  console.log(`  B a reçu ${B.jsonReceived.length} JSON : ${bJson.join(', ')}`)
  console.log(`  VERDICT ${label} : ${ok ? '✅ PASS' : '❌ FAIL'}`)
  if (!ok) {
    const fails = []
    if (!okIdentifyA) fails.push('identify B→A')
    if (!okIdentifyB) fails.push('identify A→B')
    if (!okChatB) fails.push('chat A→B')
    if (!okReceiptA) fails.push('receipt B→A')
    if (!okBatchB) fails.push('batch corké A→B')
    if (!okLateA) fails.push('late pong B→A')
    if (!okLateB) fails.push('late ping A→B')
    console.log(`  ÉCHECS : ${fails.join(' | ')}`)
  }

  rawA.destroy()
  server.close()
  await sleep(200)
  return ok
}

;(async () => {
  const r1 = await runOnce('PHASE 1 — symétrique, sans corestore', { withCorestore: false, delayA: 0 })
  const r2 = await runOnce('PHASE 2 — symétrique, avec corestore.replicate', { withCorestore: true, delayA: 0 })
  const r3 = await runOnce('PHASE 3 — asymétrique (A tarde 400ms, chemin pair()), sans corestore', { withCorestore: false, delayA: 400 })
  const r4 = await runOnce('PHASE 4 — asymétrique, avec corestore.replicate', { withCorestore: true, delayA: 400 })

  const results = [r1, r2, r3, r4].filter((r) => r !== null)
  const pass = results.length > 0 && results.every(Boolean)
  console.log(`\n══════════════════════════════════════`)
  console.log(`RÉSULTAT GLOBAL : ${pass ? '✅ PASS' : '❌ FAIL'} (${results.filter(Boolean).length}/${results.length} phases)`)
  process.exit(pass ? 0 : 1)
})().catch((err) => {
  console.error('ERREUR TEST :', err)
  process.exit(2)
})
