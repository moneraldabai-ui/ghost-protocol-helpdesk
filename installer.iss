; ============================================================================
; GHOST PROTOCOL - Inno Setup Installer Script
; ============================================================================
;
; HOW TO COMPILE:
;   1. Install Inno Setup 6.x from https://jrsoftware.org/isinfo.php
;   2. Build the Electron app first:  npm run electron:build
;   3. Open this file in Inno Setup Compiler (ISCC)
;   4. Click Build > Compile (Ctrl+F9)
;   5. The installer will be created in the "release\installer" folder
;
; OR from command line:
;   iscc installer.iss
;
; PREREQUISITES:
;   - The Electron app must be built first (release\win-unpacked\ must exist)
;   - Inno Setup 6.x must be installed (iscc.exe in PATH)
;
; ============================================================================

; ----------------------------------------------------------------------------
; [Setup] - Core installer configuration
; ----------------------------------------------------------------------------
[Setup]
; Unique application identifier (do not change after first release)
AppId={{B7F3E8A1-4D2C-4F6B-9A1E-8C3D5F7A2B4E}
AppName=Ghost Protocol
AppVersion=1.0.0
AppVerName=Ghost Protocol 1.0.0
AppPublisher=M. O. N. E. R
AppContact=moner.aldabai@gmail.com
AppCopyright=Copyright © 2026 MONER INTELLIGENCE SYSTEMS

; Installation directories
DefaultDirName={autopf}\GhostProtocol
DefaultGroupName=Ghost Protocol
DisableProgramGroupPage=yes

; License and info displayed during installation
LicenseFile=LICENSE.txt

; Installer output configuration
OutputDir=release\installer
OutputBaseFilename=GhostProtocol-1.0.0-Setup
SetupIconFile=src\assets\ghost-protocol.ico
UninstallDisplayIcon={app}\ghost-protocol.ico
UninstallDisplayName=Ghost Protocol

; Compression — lzma2 solid for best ratio
Compression=lzma2
SolidCompression=yes
CompressionThreads=auto

; Visual style
WizardStyle=modern
WizardSizePercent=110

; Privileges — requires administrator
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog

; Architecture — 64-bit only
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

; Minimum Windows version: Windows 10 (10.0.17763)
MinVersion=10.0.17763

; Uninstaller settings
Uninstallable=yes
CreateUninstallRegKey=yes

; Prevent running installer while app is open
AppMutex=GhostProtocolAppMutex

; Misc
AllowNoIcons=yes
ShowLanguageDialog=auto
DisableWelcomePage=no
DisableDirPage=no

; ----------------------------------------------------------------------------
; [Languages] - Installer language support
; ----------------------------------------------------------------------------
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

; ----------------------------------------------------------------------------
; [CustomMessages] - All user-facing strings (easy to edit/localize)
; ----------------------------------------------------------------------------
[CustomMessages]
; English
english.AppDescription=Ghost Protocol — IT Intelligence Suite by M. O. N. E. R
english.LaunchAfterInstall=Launch Ghost Protocol
english.CreateDesktopShortcut=Create a desktop shortcut
english.AppIsRunning=Ghost Protocol is currently running. Please close it before continuing.
english.WindowsVersionError=Ghost Protocol requires Windows 10 or later.
english.InstallingRuntime=Installing required components...
english.FullInstall=Full Installation
english.FullInstallDescription=Install Ghost Protocol with all components

; ----------------------------------------------------------------------------
; [Types] - Installation types
; ----------------------------------------------------------------------------
[Types]
Name: "full"; Description: "{cm:FullInstall}"

; ----------------------------------------------------------------------------
; [Components] - Installable components
; ----------------------------------------------------------------------------
[Components]
Name: "main"; Description: "{cm:FullInstallDescription}"; Types: full; Flags: fixed

; ----------------------------------------------------------------------------
; [Tasks] - Optional tasks the user can select
; ----------------------------------------------------------------------------
[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopShortcut}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

; ----------------------------------------------------------------------------
; [Files] - Source files to include in the installer
;
; NOTE: This points to the Electron Builder output at release\win-unpacked\.
;       Make sure to run "npm run electron:build" before compiling this script.
; ----------------------------------------------------------------------------
[Files]
Source: "release\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "src\assets\ghost-protocol.ico"; DestDir: "{app}"; Flags: ignoreversion

; ----------------------------------------------------------------------------
; [Icons] - Start Menu and Desktop shortcuts
; ----------------------------------------------------------------------------
[Icons]
; Start Menu shortcut
Name: "{group}\Ghost Protocol"; Filename: "{app}\GHOST PROTOCOL.exe"; IconFilename: "{app}\ghost-protocol.ico"; IconIndex: 0; Comment: "{cm:AppDescription}"

; Start Menu uninstall shortcut
Name: "{group}\Uninstall Ghost Protocol"; Filename: "{uninstallexe}"; IconFilename: "{app}\ghost-protocol.ico"; IconIndex: 0

; Desktop shortcut (optional, based on user task selection)
Name: "{autodesktop}\Ghost Protocol"; Filename: "{app}\GHOST PROTOCOL.exe"; IconFilename: "{app}\ghost-protocol.ico"; IconIndex: 0; Tasks: desktopicon; Comment: "{cm:AppDescription}"

; ----------------------------------------------------------------------------
; [Registry] - Windows registry entries for app identification
; ----------------------------------------------------------------------------
[Registry]
; Application registration
Root: HKLM; Subkey: "SOFTWARE\M.O.N.E.R\Ghost Protocol"; ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"; Flags: uninsdeletekey
Root: HKLM; Subkey: "SOFTWARE\M.O.N.E.R\Ghost Protocol"; ValueType: string; ValueName: "Version"; ValueData: "1.0.0"; Flags: uninsdeletekey
Root: HKLM; Subkey: "SOFTWARE\M.O.N.E.R\Ghost Protocol"; ValueType: string; ValueName: "Publisher"; ValueData: "M. O. N. E. R"; Flags: uninsdeletekey

; App Paths registration (allows launching from Run dialog)
Root: HKLM; Subkey: "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\GHOST PROTOCOL.exe"; ValueType: string; ValueName: ""; ValueData: "{app}\GHOST PROTOCOL.exe"; Flags: uninsdeletekey
Root: HKLM; Subkey: "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\GHOST PROTOCOL.exe"; ValueType: string; ValueName: "Path"; ValueData: "{app}"; Flags: uninsdeletekey

; ----------------------------------------------------------------------------
; [Run] - Post-install actions
; ----------------------------------------------------------------------------
[Run]
Filename: "{app}\GHOST PROTOCOL.exe"; Description: "{cm:LaunchAfterInstall}"; Flags: nowait postinstall skipifsilent shellexec

; ----------------------------------------------------------------------------
; [UninstallDelete] - Additional cleanup on uninstall
; ----------------------------------------------------------------------------
[UninstallDelete]
; Clean up any log files or cached data created at runtime
Type: filesandordirs; Name: "{app}\logs"
Type: filesandordirs; Name: "{app}\cache"

; ----------------------------------------------------------------------------
; [Code] - Pascal Script for custom installer logic
; ----------------------------------------------------------------------------
[Code]

// Check if Ghost Protocol is currently running
function IsAppRunning(): Boolean;
var
  ResultCode: Integer;
begin
  // Use tasklist to check if the process is running
  Result := False;
  if Exec('cmd.exe', '/C tasklist /FI "IMAGENAME eq GHOST PROTOCOL.exe" | find /I "GHOST PROTOCOL.exe"',
           '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    Result := (ResultCode = 0);
  end;
end;

// Verify minimum Windows version (Windows 10 build 17763+)
function IsWindowsVersionValid(): Boolean;
var
  Version: TWindowsVersion;
begin
  GetWindowsVersionEx(Version);
  // Windows 10 = Major 10, Minor 0, Build >= 17763
  Result := (Version.Major > 10) or
            ((Version.Major = 10) and (Version.Build >= 17763));
end;

// Called before installation begins
function InitializeSetup(): Boolean;
begin
  Result := True;

  // Check Windows version
  if not IsWindowsVersionValid() then
  begin
    MsgBox(CustomMessage('WindowsVersionError'), mbError, MB_OK);
    Result := False;
    Exit;
  end;

  // Check if app is already running
  if IsAppRunning() then
  begin
    MsgBox(CustomMessage('AppIsRunning'), mbError, MB_OK);
    Result := False;
    Exit;
  end;
end;

// Called before uninstallation begins
function InitializeUninstall(): Boolean;
var
  ResultCode: Integer;
begin
  Result := True;

  // Check if app is running before uninstall
  if Exec('cmd.exe', '/C tasklist /FI "IMAGENAME eq GHOST PROTOCOL.exe" | find /I "GHOST PROTOCOL.exe"',
           '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if ResultCode = 0 then
    begin
      MsgBox(CustomMessage('AppIsRunning'), mbError, MB_OK);
      Result := False;
    end;
  end;
end;
