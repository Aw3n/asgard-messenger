# ⚡ Asgard — Decentralized P2P Messenger

> No servers. No accounts. No surveillance. Pure peer-to-peer messaging secured by cryptography.

![Asgard](https://img.shields.io/badge/version-1.0.0-blue?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Windows%2011-0078d4?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-100%25-3178c6?style=flat-square)

---

## Overview

Asgard is a modern decentralized messenger that leverages the **Pear Runtime / Holepunch** ecosystem to provide fully serverless, end-to-end encrypted communication. It is a spiritual successor to Keet with its own visual identity and completely original codebase.

### Philosophy

- 🔐 **Zero Trust** — Private keys never leave your device
- 🌐 **Serverless** — All communication is peer-to-peer via Hyperswarm
- 🛡️ **Privacy First** — No accounts, no emails, no phone numbers
- ⚡ **Performance** — Handles 100K+ messages with virtualized rendering

---

## Architecture

```
Asgard/
├── electron/                  # Electron main process (Node.js)
│   ├── main.ts                # App entry, BrowserWindow + Mica effect
│   ├── preload.ts             # Secure contextBridge API
│   ├── tray.ts                # System tray
│   ├── ipc/
│   │   └── handlers.ts        # All IPC channel handlers
│   └── services/
│       ├── IdentityService.ts # Ed25519 key management
│       └── NetworkService.ts  # Hyperswarm P2P networking
│
└── src/                       # React renderer process
    ├── types/                 # Global TypeScript types
    │   ├── identity.ts
    │   ├── message.ts
    │   ├── conversation.ts
    │   ├── contact.ts
    │   ├── group.ts
    │   ├── network.ts
    │   ├── ui.ts
    │   └── electron.ts        # Window.asgard type declarations
    │
    ├── stores/                # Zustand state management
    │   ├── identityStore.ts   # Local identity + profile
    │   ├── messageStore.ts    # All messages (immer)
    │   ├── conversationStore.ts
    │   ├── contactStore.ts
    │   ├── networkStore.ts
    │   └── uiStore.ts         # Theme, modals, toasts
    │
    ├── services/              # Business logic layer
    │   ├── CryptoService.ts   # Web Crypto API (sign/verify/encrypt)
    │   ├── P2PService.ts      # Hyperswarm bridge + message signing
    │   └── ChatService.ts     # Chat orchestration
    │
    ├── components/            # Reusable UI components
    │   ├── ui/
    │   │   ├── Avatar.tsx     # Deterministic gradient avatars
    │   │   ├── Button.tsx     # Framer Motion buttons
    │   │   ├── Input.tsx
    │   │   └── Toast.tsx      # Toast notification system
    │   └── layout/
    │       ├── AppShell.tsx   # Root layout
    │       ├── TitleBar.tsx   # Custom Windows 11 title bar
    │       └── Sidebar.tsx    # Navigation rail
    │
    └── features/              # Feature modules
        ├── onboarding/        # First-run identity creation
        ├── chat/              # Conversations + messages
        ├── contacts/          # Contact management
        ├── groups/            # Group chat (Discord-like)
        ├── calls/             # Audio/video calls
        └── settings/          # App configuration
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 31 + Mica effect |
| Frontend | React 18 + TypeScript 5 |
| Build | Vite 5 |
| Styling | TailwindCSS 3 + Framer Motion |
| State | Zustand 4 + Immer |
| Routing | React Router 6 |
| Lists | React Virtuoso (virtualized) |
| P2P Network | Hyperswarm 4 |
| Storage | Hypercore 11 + Hyperbee |
| Blobs | Hyperblobs |
| Multiplexing | Protomux |
| Cryptography | Web Crypto API (Ed25519, AES-GCM) |
| Testing | Vitest + Testing Library |

---

## P2P Network Architecture

```
User A                              User B
  │                                   │
  ├─ Hyperswarm                       ├─ Hyperswarm
  │   └─ join(topic)                  │   └─ join(topic)
  │                                   │
  └─ Holepunch NAT Traversal ─────────┘
              │
     [Direct P2P connection]
              │
  ProtocolMessage {
    type, payload,
    from, signature,  ← Ed25519 signed
    seq               ← Replay protection
  }
```

**Topic derivation**: `SHA-256("asgard:conversation:" + sorted([pkA, pkB]))`  
Both parties arrive at the same topic independently — no coordination server needed.

---

## Security Model

| Threat | Mitigation |
|--------|-----------|
| MITM | Ed25519 message signing — every message is verified |
| Replay attacks | Monotonic sequence numbers + deduplication cache |
| Identity spoofing | Public key IS the identity — cryptographically bound |
| Key theft | Private keys stored in Electron userData, non-extractable |
| Spam/Flood | Peer firewall + blocked contacts list |
| Data corruption | Hypercore integrity checks (Merkle trees) |

---

## Installation

### Prerequisites
- Node.js 20+
- npm 10+
- Windows 11 (for Mica effect)

### Development

```bash
# Clone the repository
git clone https://github.com/your-org/asgard.git
cd asgard

# Install dependencies
npm install

# Start development (Vite + Electron)
npm run dev
```

### Build & Package

```bash
# Build renderer + electron
npm run build

# Package as Windows installer (.exe)
npm run package
```

The installer will be output to `release/`.

---

## Running Tests

```bash
# Run all tests once
npm run test

# Watch mode
npm run test:watch

# With UI
npm run test:ui
```

---

## Development Guide

### Adding a New Feature

1. Create a feature directory: `src/features/my-feature/`
2. Structure: `components/`, `hooks/`, `services/`, `store/`, `types/`
3. Register routes in `src/App.tsx`
4. Add navigation in `src/components/layout/Sidebar.tsx`

### Adding a New IPC Channel

1. Add handler in `electron/ipc/handlers.ts`
2. Expose API in `electron/preload.ts`
3. Add TypeScript types in `src/types/electron.ts`

### Extending P2P Protocol

1. Add new `ProtocolMessageType` in `src/types/network.ts`
2. Handle in `src/services/ChatService.ts`
3. Listen in `p2pService.on('message:your:type', ...)`

---

## Design System

### Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `asgard-black` | `#0A0A0F` | App background |
| `asgard-glacier` | `#4FC3F7` | Primary accent |
| `asgard-nordic` | `#1565C0` | Buttons, highlights |
| `asgard-cyan` | `#00E5FF` | Glow effects |
| `asgard-text-primary` | `#E8EAF6` | Main text |

### Key CSS Classes

```css
.mica-bg        /* Mica backdrop blur effect */
.glass          /* Frosted glass card */
.glow-blue      /* Nordic blue glow */
.message-bubble-own    /* Sent message bubble */
.message-bubble-other  /* Received message bubble */
.aurora-border  /* Gradient border effect */
```

---

## Roadmap

- [x] Identity creation (Ed25519)
- [x] P2P messaging (Hyperswarm)
- [x] Message signing + verification
- [x] Replay attack protection
- [x] Contact management
- [x] Conversation persistence (Zustand)
- [x] Typing indicators
- [x] Reactions
- [x] Message editing/deletion
- [x] Windows 11 Mica effect
- [ ] File/image transfer (Hyperblobs)
- [ ] Group channels (Discord-style)
- [ ] Voice/video calls (WebRTC over Hyperswarm)
- [ ] Screen sharing
- [ ] QR code identity sharing
- [ ] Message search (Hyperbee index)
- [ ] Auto-updates

---

## License

MIT — See [LICENSE](LICENSE) for details.

---

*Built with ❄️ by the Asgard team. Powered by [Holepunch](https://holepunch.to/).*
