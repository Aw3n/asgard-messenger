import { exec, execFile } from 'child_process'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

const RULE_NAME = 'Asgard P2P'
const FLAG_FILE = path.join(app.getPath('userData'), '.firewall-configured')

/**
 * Configure Windows Firewall to allow inbound P2P connections.
 * Runs once on first launch (flagged by .firewall-configured file).
 * If admin rights are not available, creates a .bat script the user can run as admin.
 *
 * CONFORMITÉ IPC : retourne une promesse qui résout (jamais de rejet) —
 * true = règle présente/ajoutée, false = droits admin requis (helper .bat créé).
 * L'ancienne version était fire-and-forget : le handler IPC répondait true
 * avant la fin du netsh, et le renderer déclenchait l'UAC inutilement.
 */
export function configureFirewall(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(true)

  return new Promise((resolve) => {
    // Skip if already configured
    if (fs.existsSync(FLAG_FILE)) {
      console.log('[Firewall] Already configured (flag file exists)')
      resolve(true)
      return
    }

    console.log('[Firewall] Checking Windows Firewall rules...')

    // Check if rule already exists
    exec(`netsh advfirewall firewall show rule name="${RULE_NAME}"`, (error, stdout) => {
      if (!error && stdout.includes(RULE_NAME)) {
        console.log('[Firewall] Rule already exists:', RULE_NAME)
        markConfigured()
        resolve(true)
        return
      }

      // Rule doesn't exist — try to add it directly
      console.log('[Firewall] Adding firewall rule:', RULE_NAME)
      const exePath = process.execPath
      const ruleCommand = `netsh advfirewall firewall add rule name="${RULE_NAME}" dir=in action=allow program="${exePath}" enable=yes profile=any`

      exec(ruleCommand, (addError) => {
        if (addError) {
          // Permission denied — create a .bat helper script the user can right-click > Run as admin
          console.warn('[Firewall] Direct add failed (need admin). Creating helper script...')
          createFirewallHelperScript(exePath)
          resolve(false)
        } else {
          console.log('[Firewall] Rule added successfully:', RULE_NAME)
          markConfigured()
          resolve(true)
        }
      })
    })
  })
}

/**
 * Create a .bat helper script that the user can run as admin to add the firewall rule.
 * The script is placed in the app data directory.
 */
function createFirewallHelperScript(exePath: string): void {
  const batPath = path.join(app.getPath('userData'), 'configure-firewall.bat')
  const batContent = `@echo off
echo ============================================
echo   Asgard - Configuration du firewall P2P
echo ============================================
echo.
echo Ajout de la regle firewall pour Asgard...
echo.
netsh advfirewall firewall add rule name="${RULE_NAME}" dir=in action=allow program="${exePath}" enable=yes profile=any
if %errorlevel% equ 0 (
    echo.
    echo [OK] Regle ajoutee avec succes !
    echo Vous pouvez fermer cette fenetre.
) else (
    echo.
    echo [ERREUR] Echec de l'ajout de la regle.
    echo Essayez de lancer ce script en tant qu'administrateur.
)
echo.
pause
`
  try {
    fs.writeFileSync(batPath, batContent)
    console.log('[Firewall] Helper script created at:', batPath)
  } catch (err) {
    console.warn('[Firewall] Failed to create helper script:', err)
  }
}

/**
 * Run the firewall helper script with admin elevation via UAC prompt.
 * Uses PowerShell Start-Process -Verb RunAs to trigger UAC dialog.
 */
export function runFirewallHelperAsAdmin(): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(false)
      return
    }

    const batPath = path.join(app.getPath('userData'), 'configure-firewall.bat')
    
    // Create script if it doesn't exist
    if (!fs.existsSync(batPath)) {
      createFirewallHelperScript(process.execPath)
    }

    // Use PowerShell to run the script as admin (triggers UAC)
    // ROBUSTESSE : execFile passe les arguments SANS la couche cmd.exe —
    // l'ancienne chaîne exec("powershell -Command \"Start-Process -FilePath \"chemin\"…\"\")
    // avait des guillemets imbriqués non échappés, cassés dès que le profil
    // Windows contient un espace (ex. C:\Users\Jean Dupont\…).
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', `Start-Process -FilePath "${batPath}" -Verb RunAs -Wait`],
      (error) => {
        if (error) {
          console.warn('[Firewall] UAC elevation failed or cancelled:', error.message)
          resolve(false)
        } else {
          console.log('[Firewall] Helper script executed with admin rights')
          // Check if rule was actually added
          checkFirewallRule().then((exists) => {
            if (exists) markConfigured()
            resolve(exists)
          })
        }
      }
    )
  })
}

/**
 * Check if the firewall rule exists.
 */
export function checkFirewallRule(): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(false)
      return
    }

    exec(`netsh advfirewall firewall show rule name="${RULE_NAME}"`, (error, stdout) => {
      resolve(!error && stdout.includes(RULE_NAME))
    })
  })
}

/**
 * Get the firewall status: 'configured' | 'needs-admin' | 'not-configured'
 * CONFORMITÉ TYPE : 'needs-admin' est désormais émis (l'ancien code ne le
 * retournait jamais) — la présence du helper configure-firewall.bat marque
 * que l'ajout direct a échoué faute de droits administrateur.
 */
export async function getFirewallStatus(): Promise<'configured' | 'needs-admin' | 'not-configured'> {
  if (process.platform !== 'win32') return 'configured' // Not applicable on other platforms

  if (fs.existsSync(FLAG_FILE)) return 'configured'

  const ruleExists = await checkFirewallRule()
  if (ruleExists) {
    markConfigured()
    return 'configured'
  }

  if (fs.existsSync(path.join(app.getPath('userData'), 'configure-firewall.bat'))) {
    return 'needs-admin'
  }

  return 'not-configured'
}

/**
 * Remove the firewall rule (for uninstaller).
 */
export function removeFirewallRule(): void {
  if (process.platform !== 'win32') return
  
  exec(`netsh advfirewall firewall delete rule name="${RULE_NAME}"`, (error) => {
    if (error) {
      console.warn('[Firewall] Failed to remove rule:', error.message)
    } else {
      console.log('[Firewall] Rule removed:', RULE_NAME)
    }
    // Remove flag file too
    try { fs.unlinkSync(FLAG_FILE) } catch {}
  })
}

function markConfigured(): void {
  try {
    fs.writeFileSync(FLAG_FILE, new Date().toISOString())
  } catch {}
}
