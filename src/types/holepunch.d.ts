/**
 * Type declarations for Holepunch/Hyper modules.
 * These modules don't ship TypeScript types.
 */

declare module 'hyperswarm' {
  import { Duplex } from 'stream'

  interface HyperswarmOptions {
    maxPeers?: number
    // CONFORMITÉ HOLEPUNCH (hyperswarm 4.17.1, index.js:315) : le firewall
    // reçoit (remotePublicKey, remoteHandshakePayload) — pas la seule clé.
    firewall?: (remotePublicKey: Buffer, remoteHandshakePayload?: unknown) => boolean
    dht?: any
    keyPair?: { publicKey: Buffer; secretKey: Buffer }
    seed?: Buffer
    bootstrap?: string[]
  }

  // CONFORMITÉ HOLEPUNCH (hyperswarm/lib/peer-info.js) : PeerInfo n'expose NI
  // `initiator`, NI `remotePublicKey`, NI `handshake` (inventés précédemment).
  // Côté client de la connexion = info.client (boolean, « Set by the Swarm »).
  interface PeerInfo {
    publicKey: Buffer
    topics: Buffer[]
    client: boolean
    reconnecting: boolean
    prioritized: boolean
    banned: boolean
    relayAddresses: Array<{ host: string; port: number }> | null
    ban(banned?: boolean): void
    on(event: string, listener: (...args: any[]) => void): void
  }

  // join() retourne une session de découverte (peer-discovery.js) — flushed()
  // résout quand l'announce/lookup initial est propagé au DHT.
  interface PeerDiscoverySession {
    flushed(): Promise<void>
    refresh(): Promise<void>
    destroy(): Promise<void>
    session(opts?: { client?: boolean; server?: boolean }): PeerDiscoverySession
  }

  export default class Hyperswarm {
    constructor(options?: HyperswarmOptions)
    on(event: 'connection', listener: (socket: Duplex, info: PeerInfo) => void): this
    on(event: 'update', listener: () => void): this
    on(event: 'ban', listener: (info: PeerInfo, err: Error | undefined) => void): this
    on(event: string, listener: (...args: any[]) => void): this
    join(topic: Buffer, options?: { client?: boolean; server?: boolean; limit?: number }): PeerDiscoverySession
    leave(topic: Buffer): Promise<void>
    joinPeer(publicKey: Buffer): void
    leavePeer(publicKey: Buffer): void
    status(topic: Buffer): { flushed(): Promise<void>; refresh(): Promise<void> } | null
    listen(): Promise<void>
    flush(): Promise<void>
    suspend(): Promise<void>
    resume(): Promise<void>
    destroy(opts?: { force?: boolean }): Promise<void>
    readonly peers: Map<string, PeerInfo>
    readonly connections: Set<Duplex>
    readonly keyPair: { publicKey: Buffer; secretKey: Buffer }
    maxPeers: number
    // Per Hyperswarm source (index.js:47) : le server DHT vit sur le SWARM.
    readonly server: { address(): { host: string | null; port: number | null; publicKey: Buffer } | null; refresh(): void; relayAddresses: Array<{ host: string; port: number }> }
    readonly dht: any
  }
}

declare module 'hypercore' {
  interface HypercoreOptions {
    valueEncoding?: string
  }

  export default class Hypercore {
    constructor(storage: any, key?: string | Buffer, options?: HypercoreOptions)
    readonly key: Buffer
    readonly discoveryKey: Buffer
    readonly length: number
    readonly byteLength: number
    append(data: any): Promise<void>
    get(index: number): Promise<any>
    close(): Promise<void>
    ready(): Promise<void>
    update(): Promise<void>
    replicate(isInitiator: boolean | { live?: boolean; encrypt?: boolean }): any
  }
}

declare module 'hyperdht' {
  interface KeyPair {
    publicKey: Buffer
    secretKey: Buffer
  }

  interface DHTOptions {
    bootstrap?: string[]
    nodes?: Array<{ host: string; port: number }>
    port?: number
    host?: string
    ephemeral?: boolean
    seed?: Buffer
    keyPair?: KeyPair
    connectionKeepAlive?: number | false
    randomPunchInterval?: number
    deferRandomPunch?: boolean
    firewalled?: boolean
  }

  interface MutableRecord {
    value?: Buffer
    seq?: number
    from?: { host: string; port: number }
    signature?: Buffer
    closestNodes?: Array<{ host: string; port: number }>
  }

  export default class HyperDHT {
    constructor(options?: DHTOptions)
    readonly keyPair: KeyPair
    readonly defaultKeyPair: KeyPair
    readonly host: string | null
    readonly port: number | null
    readonly firewalled: boolean
    readonly ephemeral: boolean
    readonly id: string | null
    readonly randomized: boolean
    static keyPair(seed?: Buffer): KeyPair
    static default: typeof HyperDHT
    static bootstrapper(port: number, host: string, options?: DHTOptions): HyperDHT
    mutablePut(keyPair: KeyPair, value: Buffer, opts?: { seq?: number; first?: boolean } & any): Promise<any>
    mutableGet(publicKey: Buffer, opts?: { latest?: boolean; seq?: number }): Promise<MutableRecord | null>
    immutablePut(value: Buffer): Promise<{ hash: Buffer; closestNodes: Array<{ host: string; port: number }> }>
    immutableGet(hash: Buffer): Promise<{ value: Buffer; from: { host: string; port: number } }>
    // CONFORMITÉ HOLEPUNCH (hyperdht 6.34.0) : PAS de listen() sur le DHT —
    // l'écoute serveur passe par dht.createServer().listen(keyPair) ou par
    // swarm.server (pattern officiel Hyperswarm). Ancienne déclaration fantôme
    // retirée après vérification dynamique du prototype installé.
    connect(remotePublicKey: Buffer | string, opts?: any): any
    lookup(topic: Buffer, opts?: any): any
    // CONFORMITÉ HOLEPUNCH (hyperdht/index.js:254) : announce(target, keyPair,
    // relayAddresses, opts) — relayAddresses est REQUIS (pas de valeur par
    // défaut) ; le pattern officiel est swarm.server.relayAddresses.
    announce(topic: Buffer, keyPair: KeyPair, relayAddresses: Array<{ host: string; port: number }>, opts?: any): any
    unannounce(topic: Buffer, keyPair: KeyPair, opts?: any): Promise<void>
    refresh(): void
    toArray(opts?: { limit?: number }): Array<{ host: string; port: number }>
    addNode(node: { host: string; port: number }): void
    suspend(): Promise<void>
    resume(): Promise<void>
    destroy(opts?: { force?: boolean }): Promise<void>
    readonly destroyed: boolean
    address(): { host: string; port: number } | null
    remoteAddress(): { host: string; port: number } | null
    fullyBootstrapped(): Promise<void>
    on(event: 'bootstrap', listener: () => void): this
    on(event: 'ready', listener: () => void): this
    on(event: 'persistent', listener: () => void): this
    on(event: 'wake-up', listener: () => void): this
    on(event: 'network-change', listener: (interfaces: any) => void): this
    on(event: 'nat-update', listener: (host: string, port: number) => void): this
    on(event: 'listening', listener: () => void): this
    on(event: 'close', listener: () => void): this
    on(event: 'request', listener: (req: any) => void): this
    on(event: string, listener: (...args: any[]) => void): this
  }
}

declare module 'corestore' {
  export default class Corestore {
    constructor(storage: string | any, opts?: any)
    readonly key: Buffer
    readonly discoveryKey: Buffer
    // CONFORMITÉ HOLEPUNCH (corestore 7.12.5, index.js:560) : get() prend un
    // OBJET d'options — une string/Buffer brute est interprétée comme une KEY
    // (pas un nom d'alias). Le pattern nommé est get({ name: '...' }).
    get(opts: { name?: string; key?: Buffer; discoveryKey?: Buffer; valueEncoding?: any; [k: string]: any }): any
    // CONFORMITÉ HOLEPUNCH (corestore 7.12.5, index.js:477) : signature
    // replicate(isInitiator, opts) — le pattern officiel sur socket Hyperswarm
    // est store.replicate(socket) (isStream → réutilise le mux du socket).
    replicate(isInitiator: any, opts?: any): any
    namespace(name: string, opts?: any): Corestore
    session(opts?: any): Corestore
    findingPeers(): { done(): void }
    close(): Promise<void>
    ready(): Promise<void>
  }
}

declare module 'hyperbee' {
  interface HyperbeeOptions {
    keyEncoding?: string
    valueEncoding?: string
  }

  export default class Hyperbee {
    constructor(core: any, opts?: HyperbeeOptions)
    readonly key: Buffer
    readonly discoveryKey: Buffer
    get(key: string): Promise<any>
    put(key: string, value: any): Promise<void>
    del(key: string): Promise<void>
    close(): Promise<void>
    ready(): Promise<void>
    sub(name: string, opts?: HyperbeeOptions): Hyperbee
  }
}

declare module 'hyperblobs' {
  // CONFORMITÉ HOLEPUNCH (hyperblobs 2.12.1) : put() résout avec un id OBJET
  // (enrichi de { block, offset, length } au close du write stream) et
  // get()/clear()/createReadStream() prennent ce même objet id — PAS un number.
  export interface BlobId {
    block: number
    blockOffset: number
    blockLength: number
    offset: number
    length: number
    byteOffset: number
    byteLength: number
    blockMap?: unknown
  }
  export default class Hyperblobs {
    constructor(core: any, opts?: { blockSize?: number })
    put(data: Buffer | Uint8Array, opts?: { blockSize?: number }): Promise<BlobId>
    get(id: BlobId, opts?: { start?: number; length?: number; wait?: boolean; timeout?: number }): Promise<Buffer | null>
    clear(id: BlobId, opts?: { diff?: boolean }): Promise<void>
    createReadStream(id: BlobId, opts?: { start?: number; end?: number }): NodeJS.ReadableStream
    createWriteStream(opts?: { blockSize?: number }): NodeJS.WritableStream & { id: BlobId }
    batch(): Hyperblobs
    snapshot(): Hyperblobs
    close(): Promise<void>
    ready(): Promise<void>
    replicate(isInitiator: any, opts?: any): any
  }
}

declare module 'protomux' {
  // CONFORMITÉ HOLEPUNCH (protomux 3.12.0) : les méthodes `channel(name)`,
  // `Channel.write()/end()/on('data')` et `mux.addMessage()` invoquées
  // précédemment n'existent PAS. L'API réelle :
  //   mux = Protomux.from(stream)  — mux partagé via stream.userData
  //   channel = mux.createChannel({ protocol, id, onopen, onclose, ondestroy })
  //   message = channel.addMessage({ encoding, onmessage })
  //   channel.open() / channel.close() / channel.cork() / channel.uncork()
  //   message.send(data)
  interface ChannelMessage<T = unknown> {
    send(data: T): boolean
  }

  interface ChannelOptions {
    protocol: string
    id?: Buffer | null
    unique?: boolean
    handshake?: unknown
    messages?: Array<{ encoding: unknown; onmessage?: (data: any) => void }>
    onopen?(handshake?: unknown): void
    onclose?(): void
    ondestroy?(): void
    ondrain?(): void
    keepAlive?: number
  }

  interface Channel {
    addMessage<T = unknown>(opts: { encoding: unknown; onmessage?: (data: T) => void }): ChannelMessage<T>
    open(handshake?: unknown): void
    close(): void
    cork(): void
    uncork(): void
    readonly opened: boolean
    readonly closed: boolean
    readonly destroyed: boolean
    userData: unknown
  }

  export default class Protomux {
    private constructor(stream: unknown, opts?: unknown)
    static from(stream: unknown, opts?: unknown): Protomux
    createChannel(opts: ChannelOptions): Channel | null
    pair(opts: { protocol: string; id?: Buffer | null }, notify: (id: Buffer | null) => Promise<void>): void
    unpair(opts: { protocol: string; id?: Buffer | null }): void
    opened(opts: { protocol: string; id?: Buffer | null }): boolean
    getLastChannel(opts: { protocol: string; id?: Buffer | null }): Channel | null
    isIdle(): boolean
    cork(): void
    uncork(): void
    stream: unknown
    corked: number
  }
}

declare module 'autobase' {
  export default class Autobase {
    constructor(stores: any, bootstrap?: any, opts?: any)
    readonly key: Buffer
    readonly discoveryKey: Buffer
    append(value: any): Promise<void>
    // CONFORMITÉ HOLEPUNCH (autobase 7.28.2) : PAS de get() direct sur
    // l'Autobase — les lectures passent par la view (autobase.view / createIndex).
    // Ancienne déclaration fantôme retirée après vérification dynamique.
    close(): Promise<void>
    ready(): Promise<void>
    view: any
  }
}

declare module 'b4a' {
  export function toString(buffer: Buffer | Uint8Array, encoding?: string): string
  export function from(data: string | number[] | ArrayBuffer | Uint8Array, encoding?: string): Buffer
  export function alloc(size: number): Buffer
  export function concat(buffers: Buffer[]): Buffer
  export function isBuffer(value: any): value is Buffer
  export function equals(a: Buffer | Uint8Array, b: Buffer | Uint8Array): boolean
  export function compare(a: Buffer | Uint8Array, b: Buffer | Uint8Array): number
  // CONFORMITÉ HOLEPUNCH (b4a 1.6.7) : utf8ToBytes/bytesToUtf8 n'existent PAS
  // dans b4a (vérifié dynamiquement) — ancienne déclaration fantôme retirée.
}

declare module 'compact-encoding' {
  export interface State {
    start: number
    end: number
    buffer: Buffer | null
  }

  // CONFORMITÉ HOLEPUNCH (compact-encoding 3.5.0) : decode(enc, buffer) prend
  // un BUFFER (pas un State) et retourne la valeur. Les encodings sont des
  // objets { preencode, encode, decode } — pas une classe.
  export function state(start?: number, end?: number, buffer?: Buffer | null): State
  export function encode(enc: any, value: any): Buffer
  export function decode(enc: any, buffer: Buffer): any
  export const raw: any
  export const binary: any
  export const uint: any
  export const uint8: any
  export const uint16: any
  export const uint32: any
  export const uint64: any
  export const int: any
  export const float32: any
  export const float64: any
  export const string: any
  export const utf8: any
  export const ascii: any
  export const hex: any
  export const base64: any
  export const buffer: any
  export const optionalBuffer: any
  export const bool: any
  export const json: any
  export const ndjson: any
  export const array: any
  export const fixed32: any
  export const fixed64: any
}

declare module '@noble/hashes/sha2.js' {
  export function sha256(data: Uint8Array | string): Uint8Array
  export function sha224(data: Uint8Array | string): Uint8Array
  export function sha512(data: Uint8Array | string): Uint8Array
  export function sha384(data: Uint8Array | string): Uint8Array
  export function sha512_224(data: Uint8Array | string): Uint8Array
  export function sha512_256(data: Uint8Array | string): Uint8Array
}

// CONFORMITÉ NOBLE (hashes 2.2.0) : les subpaths '@noble/hashes/sha2' et
// '@noble/hashes/sha256' (sans .js) ne sont PAS définis par le "exports" map
// du paquet — un import de ces chemins compile (déclaration ambient) mais
// échoue au runtime. Seul './sha2.js' est valide : les anciennes déclarations
// fantômes ont été retirées.
