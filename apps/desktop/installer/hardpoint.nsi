; Hardpoint per-user installer (no admin rights needed).
; Note: Windows file names are case-insensitive, so the CLI ships as hardpoint-cli.exe
; (hardpoint.exe would overwrite Hardpoint.exe).
; Built by apps/desktop/installer/build-windows.sh from a cross-compiled Windows build.
; Installs to %LOCALAPPDATA%\Programs\Hardpoint, registers hardpoint:// links, adds shortcuts
; and an entry in Settings > Apps. Uninstalling keeps your library, backups and settings
; (%APPDATA%\hardpoint) so mods stay recoverable.

Unicode true
!include "MUI2.nsh"

!ifndef VERSION
  !define VERSION "0.1.0"
!endif
!ifndef SRC
  !define SRC "stage"
!endif
!ifndef OUT
  !define OUT "Hardpoint_${VERSION}_x64-setup.exe"
!endif

Name "Hardpoint"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\Hardpoint"
InstallDirRegKey HKCU "Software\Hardpoint" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "Hardpoint ${VERSION}"

!define MUI_ICON "${SRC}\icon.ico"
!define MUI_UNICON "${SRC}\icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\Hardpoint.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Open Hardpoint"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Hardpoint"

Section "Hardpoint" SecMain
  SetOutPath "$INSTDIR"
  ; Close a running copy so files can be replaced on upgrade.
  nsExec::Exec 'taskkill /IM Hardpoint.exe /F'
  File "${SRC}\Hardpoint.exe"
  File "${SRC}\WebView2Loader.dll"
  File "${SRC}\hardpoint-cli.exe"
  File "${SRC}\icon.ico"
  File "${SRC}\README.txt"
  WriteUninstaller "$INSTDIR\Uninstall Hardpoint.exe"

  CreateShortCut "$SMPROGRAMS\Hardpoint.lnk" "$INSTDIR\Hardpoint.exe" "" "$INSTDIR\icon.ico"
  CreateShortCut "$DESKTOP\Hardpoint.lnk" "$INSTDIR\Hardpoint.exe" "" "$INSTDIR\icon.ico"

  ; hardpoint:// links from the hub website open the app.
  WriteRegStr HKCU "Software\Classes\hardpoint" "" "URL:Hardpoint"
  WriteRegStr HKCU "Software\Classes\hardpoint" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\hardpoint\DefaultIcon" "" "$INSTDIR\Hardpoint.exe,0"
  WriteRegStr HKCU "Software\Classes\hardpoint\shell\open\command" "" '"$INSTDIR\Hardpoint.exe" "%1"'

  WriteRegStr HKCU "Software\Hardpoint" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "Hardpoint"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "Hardpoint contributors"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall Hardpoint.exe"'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM Hardpoint.exe /F'
  Delete "$INSTDIR\Hardpoint.exe"
  Delete "$INSTDIR\WebView2Loader.dll"
  Delete "$INSTDIR\hardpoint-cli.exe"
  Delete "$INSTDIR\icon.ico"
  Delete "$INSTDIR\README.txt"
  Delete "$INSTDIR\Uninstall Hardpoint.exe"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\Hardpoint.lnk"
  Delete "$DESKTOP\Hardpoint.lnk"
  DeleteRegKey HKCU "Software\Classes\hardpoint"
  DeleteRegKey HKCU "Software\Hardpoint"
  DeleteRegKey HKCU "${UNINST_KEY}"
SectionEnd
