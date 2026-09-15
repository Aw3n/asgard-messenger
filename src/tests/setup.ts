/// <reference types="vitest/globals" />
import '@testing-library/jest-dom'

// Mock Electron API for tests
const mockAsgardAPI = {
  setLanguage: vi.fn().mockResolvedValue(true),
  window: {
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
    isMaximized: vi.fn().mockResolvedValue(false),
    onMaximizeChange: vi.fn().mockReturnValue(() => {}),
  },
  identity: {
    create: vi.fn().mockResolvedValue({
      publicKey: 'a'.repeat(64),
      keyPair: { publicKey: new Uint8Array(32), secretKey: new Uint8Array(64) },
    }),
    load: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    exportSeedPhrase: vi.fn().mockResolvedValue(Array(24).fill('abandon')),
    importSeedPhrase: vi.fn().mockResolvedValue({
      publicKey: 'a'.repeat(64),
      keyPair: { publicKey: new Uint8Array(32), secretKey: new Uint8Array(64) },
    }),
  },
  network: {
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    onPeer: vi.fn().mockReturnValue(() => {}),
    onMessage: vi.fn().mockReturnValue(() => {}),
    getStatus: vi.fn().mockResolvedValue({ connected: false, peers: 0, topics: [], bandwidth: { up: 0, down: 0 } }),
  },
  storage: {
    getPath: vi.fn().mockResolvedValue('/mock/path'),
    getSize: vi.fn().mockResolvedValue(0),
  },
  notifications: {
    show: vi.fn(),
    requestPermission: vi.fn().mockResolvedValue(true),
  },
  app: {
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
    getPlatform: vi.fn().mockReturnValue('win32'),
    openExternal: vi.fn(),
    getTheme: vi.fn().mockResolvedValue('dark'),
    onThemeChange: vi.fn().mockReturnValue(() => {}),
    getPendingDeepLink: vi.fn().mockResolvedValue(null),
    onDeepLink: vi.fn().mockReturnValue(() => {}),
  },
}

Object.defineProperty(window, 'asgard', {
  value: mockAsgardAPI,
  writable: true,
})
