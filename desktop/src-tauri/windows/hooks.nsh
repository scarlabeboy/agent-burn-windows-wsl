; Removes the Windows startup entry when the app is uninstalled, so no entry is left
; pointing at a missing executable. The value name matches the autostart plugin setup in main.rs.
!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Agent Burn Windows"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Agent Burn Windows"
!macroend
