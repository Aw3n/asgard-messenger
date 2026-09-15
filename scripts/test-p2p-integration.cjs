// Test d'intégration RÉEL du stack réseau Asgard : TCP + NoiseSecretStream
// (@hyperswarm/secret-stream — le même que hyperdht/hyperswarm, streamx + sodium) + Protomux
// + setup canaux Asgard exact (setupPeer de NetworkService).
// Le DHT/hole-punching est prouvé fonctionnel par le log utilisateur (connexion + identify
// établis) — on teste ici la couche transport chiffré + mux + canaux, qui est le doute restant.
// Reproduit le scénario utilisateur : 2 peers s'identifient, échangent présence + chat + appel.
// Usage : node scripts/test-p2p-integration.cjs

const net = require('node:net')
const Protomux = require('protomux')
const c = require('compact-encoding')
const b4a = require('b4a')
const NoiseSecretStream = require('@hyperswarm/secret-stream')

const TAP = process.argv.includes('--tap')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function makeSide(name, pk) {
  return { name, pk, identified: 0, jsonReceived: [], mux: null, channel: null, sendMsg: null }
}

// setupPeer de NetworkService — reproduction fidèle (pair() handlers + eager createChannel
// + double identify + onmessage 0x01/0x02/JSON)
function setupSide(side, socket) {
  const mux = Protomux.from(socket)
  side.mux = mux

  let channel = null
  let mainSendMsg = null

  const onMainMessage = (buf) => {
    const data = b4a.from(buf)
    if (TAP) console.log(`  [${side.name}] onMainMessage ${data.length}B`)
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
      onclose: () => { if (TAP) console.log(`  [${side.name}] main channel closed`) },
      ondestroy: () => { if (TAP) console.log(`  [${side.name}] main channel destroyed`) },
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

async function main() {
  const A = makeSide('A', 'PK_A_' + 'aa'.repeat(42))
  const B = makeSide('B', 'PK_B_' + 'bb'.repeat(42))

  // ── TCP local + NoiseSecretStream (le stack réel de hyperswarm) ──
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  const port = server.address().port

  const bConnected = new Promise((resolve) => {
    server.once('connection', (raw) => {
      const ns = new NoiseSecretStream(false, raw) // responder, handshake XX auto
      setupSide(B, ns)
      resolve()
    })
  })

  const rawA = net.connect(port, '127.0.0.1')
  await new Promise((r) => rawA.once('connect', r))
  const nsA = new NoiseSecretStream(true, rawA) // initiator
  setupSide(A, nsA)

  await bConnected

  // Attente du handshake + identify (les deux côtés s'identifient mutuellement)
  let waited = 0
  while ((A.identified === 0 || B.identified === 0) && waited < 10000) {
    await sleep(250)
    waited += 250
  }
  console.log(`Handshake + identify en ~${waited}ms (identify A←B=${A.identified}, B←A=${B.identified})`)

  await sleep(500)

  const sendApp = (side, obj) => {
    if (!side.sendMsg) {
      console.log(`  [${side.name}] ✗ PAS DE sendMsg — canal jamais créé !`)
      return
    }
    side.sendMsg.send(Buffer.from(JSON.stringify(obj)))
  }

  // 1. Chat A→B (comme ChatService.sendMessage)
  sendApp(A, { type: 'chat:message', from: A.pk, text: 'salut B' })
  await sleep(400)
  // 2. Receipt B→A
  sendApp(B, { type: 'chat:receipt', from: B.pk, text: 'bien reçu A' })
  await sleep(400)
  // 3. Présence A→B (comme broadcastPresence)
  sendApp(A, { type: 'presence:update', status: 'online' })
  await sleep(400)
  // 4. Appel : offer A→B, accept B→A (comme CallService)
  sendApp(A, { type: 'call:offer', callId: 'c1', media: 'audio' })
  await sleep(400)
  sendApp(B, { type: 'call:accept', callId: 'c1' })
  await sleep(400)
  // 5. Batch corké A→B (comme sendMediaBatch)
  A.mux.cork()
  for (let i = 0; i < 5; i++) sendApp(A, { type: 'media:chunk', i })
  A.mux.uncork()
  await sleep(700)
  // 6. Messages tardifs des deux côtés
  sendApp(A, { type: 'late:ping' })
  sendApp(B, { type: 'late:pong' })
  await sleep(700)

  let aJson = []
  let bJson = []
  try {
    aJson = A.jsonReceived.map((t) => JSON.parse(t).type)
    bJson = B.jsonReceived.map((t) => JSON.parse(t).type)
  } catch {}

  const checks = [
    ['identify B→A', A.identified >= 1],
    ['identify A→B', B.identified >= 1],
    ['chat A→B', bJson.includes('chat:message')],
    ['receipt B→A', aJson.includes('chat:receipt')],
    ['presence A→B', bJson.includes('presence:update')],
    ['call:offer A→B', bJson.includes('call:offer')],
    ['call:accept B→A', aJson.includes('call:accept')],
    ['batch corké A→B (5 chunks)', bJson.filter((t) => t === 'media:chunk').length === 5],
    ['late ping A→B', bJson.includes('late:ping')],
    ['late pong B→A', aJson.includes('late:pong')],
  ]

  console.log(`\nA a reçu ${A.jsonReceived.length} JSON : ${aJson.join(', ')}`)
  console.log(`B a reçu ${B.jsonReceived.length} JSON : ${bJson.join(', ')}`)

  const failed = checks.filter(([, ok]) => !ok).map(([label]) => label)
  for (const [label, ok] of checks) console.log(`  ${ok ? '✅' : '❌'} ${label}`)

  rawA.destroy()
  server.close()
  await sleep(200)

  const pass = failed.length === 0
  console.log(`\n══════════════════════════════════════`)
  console.log(`TEST D'INTÉGRATION NOISE+PROTOMUX RÉEL : ${pass ? '✅ PASS — le stack Asgard est sain' : '❌ FAIL — ' + failed.join(' | ')}`)
  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error('ERREUR TEST :', err)
  process.exit(2)
})
