; ── Asgard Firewall Configuration ──
; Automatically adds Windows Firewall rule to allow inbound P2P connections.
; Runs during install (with admin rights) and removes during uninstall.

!include LogicLib.nsh

; ── Install: Add firewall rule ──
!macro customInstall
  DetailPrint "Configuration du firewall Windows pour Asgard..."
  
  ; Delete existing rule first (clean slate)
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Asgard P2P"'
  
  ; Add inbound rule for the installed executable
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Asgard P2P" dir=in action=allow program="$INSTDIR\Asgard.exe" enable=yes profile=any'
  
  DetailPrint "Firewall configure avec succes."
!macroend

; ── Uninstall: Remove firewall rule ──
!macro customUnInstall
  DetailPrint "Suppression de la regle firewall Asgard..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Asgard P2P"'
  DetailPrint "Regle firewall supprimee."
!macroend
