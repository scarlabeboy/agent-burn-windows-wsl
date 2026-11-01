; Runs at the end of the uninstaller. Tauri's template already removes the Windows startup entry
; ("Agent Burn Windows", the name set in main.rs) on a real uninstall and keeps it on an update;
; this hook must not undo that, so everything here is skipped during an update ($UpdateMode).
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    ; Windows keeps the on/off state of a startup entry in a second place; remove it too.
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${PRODUCTNAME}"
    ; The installer's own keys (install folder, language). The template removes them only when
    ; the app data is deleted too, which left them behind when the data was kept.
    DeleteRegKey HKCU "${MANUPRODUCTKEY}"
    DeleteRegKey /ifempty HKCU "${MANUKEY}"
  ${EndIf}
!macroend
