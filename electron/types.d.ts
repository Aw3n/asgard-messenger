// Type declarations for ESM-only Holepunch packages
declare module 'hyperswarm' {
  import { Duplex } from 'stream'
  export default class Hyperswarm {
    constructor(opts?: {
      maxPeers?: number
      // CONFORMITÉ HOLEPUNCH (hyperswarm 4.17.1, index.js:315) : le firewall
      // reçoit (remotePublicKey, remoteHandshakePayload) — deux arguments.
      firewall?: (remotePublicKey: Buffer, remoteHandshakePayload?: unknown) => boolean
      keyPair?: { publicKey: Buffer; secretKey: Buffer }
      seed?: Buffer
    })
    connections: Set<unknown>
    peers: Map<string, unknown>
    on(event: 'connection', handler: (socket: Duplex & { remotePublicKey?: Buffer }, info: { publicKey: Buffer; topics: Buffer[] }) => void): void
    on(event: 'update', handler: () => void): void
    on(event: string, handler: (...args: unknown[]) => void): void
    join(topic: Buffer, opts?: { client?: boolean; server?: boolean }): { flushed: () => Promise<void> }
    leave(topic: Buffer): Promise<void>
    joinPeer(publicKey: Buffer): void
    leavePeer(publicKey: Buffer): void
    flush(): Promise<void>
    destroy(): Promise<void>
  }
}

declare module 'hyperdht' {
  const _default: {
    keyPair: (seed: Buffer) => { publicKey: Buffer; secretKey: Buffer }
  }
  export default _default
}

declare module 'hypercore-crypto' {
  const _default: {
    discoveryKey: (publicKey: Buffer) => Buffer
    randomBytes: (n: number) => Buffer
    keyPair: (seed?: Buffer) => { publicKey: Buffer; secretKey: Buffer }
  }
  export default _default
}

declare module 'corestore' {
  export default class Corestore {
    constructor(storage: string, opts?: { primaryKey?: Buffer; writable?: boolean })
    get(opts: { name: string } | { key: Buffer }): unknown
    replicate(stream: unknown): unknown
    session(): Corestore
    namespace(name: string): Corestore
    close(): Promise<void>
  }
}

declare module 'hyperbee' {
  export default class Hyperbee {
    constructor(core: unknown, opts?: { keyEncoding?: string; valueEncoding?: string })
    put(key: string, value: unknown): Promise<void>
    get(key: string): Promise<{ value: unknown } | null>
    del(key: string): Promise<void>
    createReadStream(opts?: Record<string, unknown>): AsyncIterable<{ key: string; value: unknown }>
    sub(key: string): Hyperbee
    close(): Promise<void>
  }
}

declare module 'hyperblobs' {
  // CONFORMITÉ HOLEPUNCH (hyperblobs 2.12.1, index.js + lib/streams.js) :
  // put(blob, opts) résout avec un id OBJET (BlobWriteStream.id =
  // { blockOffset, byteOffset, blockLength, byteLength } enrichi de
  // { block, offset, length } au close) et get()/clear()/createReadStream()
  // prennent ce même objet id — PAS un number. Les lectures partielles
  // utilisent get(id, { start, length }).
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
    constructor(core: unknown, opts?: { blockSize?: number })
    put(blob: Buffer, opts?: { blockSize?: number }): Promise<BlobId>
    get(id: BlobId, opts?: { start?: number; length?: number; wait?: boolean; timeout?: number }): Promise<Buffer | null>
    clear(id: BlobId, opts?: { diff?: boolean }): Promise<void>
    createReadStream(id: BlobId, opts?: { start?: number; end?: number }): NodeJS.ReadableStream
    createWriteStream(opts?: { blockSize?: number }): NodeJS.WritableStream & { id: BlobId }
    batch(): Hyperblobs
    snapshot(): Hyperblobs
    ready(): Promise<void>
    close(): Promise<void>
    replicate(isInitiator: unknown, opts?: unknown): unknown
  }
}

declare module 'protomux' {
  export default class Protomux {
    static from(stream: unknown): Protomux
    createChannel(opts: {
      protocol: string
      id?: Buffer | null
      handshake?: unknown
      onopen?: () => void
      onclose?: () => void
    }): ProtomuxChannel | null
    opened(opts: { protocol: string; id?: Buffer | null }): boolean
    pair(opts: { protocol: string; id?: Buffer | null }, notify: (id: Buffer | null) => Promise<void>): void
    unpair(opts: { protocol: string; id?: Buffer | null }): void
  }
  interface ProtomuxChannel {
    addMessage(opts: { encoding: unknown; onmessage?: (msg: unknown) => void }): ProtomuxMessage
    open(handshake?: unknown): void
    close(): void
  }
  interface ProtomuxMessage {
    send(data: unknown): void
  }
}

declare module 'compact-encoding' {
  export const binary: unknown
  export const string: unknown
  export const bool: unknown
  export const uint32: unknown
  export const json: unknown
  export function encode(encoding: unknown, value: unknown): Buffer
  export function decode(encoding: unknown, buffer: Buffer): unknown
}
