/** Durées proposées pour couper les alertes d'une conversation. */
export const MUTE_DURATIONS = [
  { translationKey: 'chat.muteFor1Hour', durationMs: 60 * 60 * 1000 },
  { translationKey: 'chat.muteFor8Hours', durationMs: 8 * 60 * 60 * 1000 },
  { translationKey: 'chat.muteFor1Week', durationMs: 7 * 24 * 60 * 60 * 1000 },
] as const
