import fs from 'fs'
import path from 'path'

const root = process.cwd()
const srcDir = path.join(root, 'src')
const translationsFile = path.join(srcDir, 'i18n', 'translations.ts')

const targetFiles = [
  'src/features/chat/components/ConversationList.tsx',
  'src/features/calls/components/CallView.tsx',
  'src/features/contacts/components/ContactDetailView.tsx',
  'src/features/contacts/components/ContactInviteModal.tsx',
  'src/features/contacts/components/QRCodeModal.tsx',
  'src/features/groups/components/GroupView.tsx',
  'src/features/groups/components/CreateGroupModal.tsx',
  'src/features/groups/components/GroupSettings.tsx',
  'src/features/groups/components/MemberList.tsx',
  'src/features/groups/components/GroupItem.tsx',
  'src/features/groups/components/ChannelList.tsx',
  'src/features/chat/components/MessageBubble.tsx',
  'src/features/chat/components/MessageEditModal.tsx',
  'src/features/chat/components/ForwardModal.tsx',
  'src/features/chat/components/FileAttachment.tsx',
  'src/features/chat/components/FileTransferProgress.tsx',
  'src/features/chat/components/VoiceMessageRecorder.tsx',
  'src/features/chat/components/MarkdownRenderer.tsx',
  'src/components/overlays/IncomingCallOverlay.tsx',
  'src/features/settings/components/BlockedPeersManager.tsx',
  'src/features/settings/components/DownloadHistory.tsx',
  'src/features/settings/components/FavoritesManager.tsx',
  'src/features/settings/components/FileTransferManager.tsx',
  'src/features/settings/components/ShareLinksManager.tsx',
  'src/features/settings/components/ThemeSelector.tsx',
  'src/features/settings/components/TrashManager.tsx',
  'src/components/panels/ConversationInfoPanel.tsx',
  'src/components/panels/FilesPanel.tsx',
  'src/components/panels/LinksPanel.tsx',
  'src/components/panels/MembersPanel.tsx',
  'src/components/panels/RightPanel.tsx',
]

// Read translations
const translationsContent = fs.readFileSync(translationsFile, 'utf8')
const allKeys = new Set()
const keyRegex = /"([^"]+)":\s*"/g
let match
while ((match = keyRegex.exec(translationsContent)) !== null) {
  allKeys.add(match[1])
}

const hardcodedStrings = []
const missingKeys = []
const usedKeysPerFile = {}

for (const relFile of targetFiles) {
  const filePath = path.join(root, relFile)
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ File not found: ${relFile}`)
    continue
  }
  const content = fs.readFileSync(filePath, 'utf8')
  const usedKeys = new Set()
  usedKeysPerFile[relFile] = usedKeys

  // Find t('key') or t("key")
  const tRegex = /t\(\s*['"]([^'"]+)['"]\s*(?:,\s*\{)?/g
  let tMatch
  while ((tMatch = tRegex.exec(content)) !== null) {
    const key = tMatch[1]
    usedKeys.add(key)
    if (!allKeys.has(key)) {
      missingKeys.push({ file: relFile, key })
    }
  }

  // Find hardcoded strings in JSX text (basic detection)
  const jsxTextRegex = />([^<]{2,})</g
  let jsxMatch
  while ((jsxMatch = jsxTextRegex.exec(content)) !== null) {
    const text = jsxMatch[1].trim()
    // Ignore whitespace-only, numbers, template literals, and obvious non-text
    if (text && !/^\d+$/.test(text) && !/^\s*[-·•]\s*$/.test(text) && text.length > 1) {
      // Check if it's inside a string literal (attribute)
      const before = content.slice(Math.max(0, jsxMatch.index - 50), jsxMatch.index)
      const after = content.slice(jsxMatch.index + jsxMatch[0].length, jsxMatch.index + jsxMatch[0].length + 50)
      // Skip if looks like CSS class or path
      if (!text.includes('className') && !text.includes('http') && !text.startsWith('M') && !text.startsWith('data:')) {
        hardcodedStrings.push({ file: relFile, text })
      }
    }
  }
}

console.log('\n=== AUDIT I18N ===\n')

console.log(`Total keys in translations.ts: ${allKeys.size}`)
console.log(`Files audited: ${targetFiles.length}`)

if (missingKeys.length === 0) {
  console.log('\n✅ No missing translation keys')
} else {
  console.log(`\n❌ Missing keys (${missingKeys.length}):`)
  const byKey = {}
  for (const { file, key } of missingKeys) {
    if (!byKey[key]) byKey[key] = []
    byKey[key].push(file)
  }
  for (const [key, files] of Object.entries(byKey)) {
    console.log(`  - ${key}`)
    for (const f of files) console.log(`      ${f}`)
  }
}

if (hardcodedStrings.length === 0) {
  console.log('\n✅ No hardcoded strings detected')
} else {
  console.log(`\n⚠️ Potential hardcoded strings (${hardcodedStrings.length}):`)
  for (const { file, text } of hardcodedStrings) {
    console.log(`  [${file}] "${text}"`)
  }
}

// Save detailed report
const reportPath = path.join(root, 'scripts', 'audit-i18n-report.json')
fs.writeFileSync(reportPath, JSON.stringify({
  totalKeys: allKeys.size,
  missingKeys: [...new Set(missingKeys.map(m => m.key))],
  missingKeysDetails: missingKeys,
  hardcodedStrings,
  usedKeysPerFile: Object.fromEntries(Object.entries(usedKeysPerFile).map(([k, v]) => [k, [...v]]))
}, null, 2))
console.log(`\nReport saved to: ${reportPath}`)
