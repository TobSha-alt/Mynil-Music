#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{8D6B2A1E-9C4F-4E21-9A7B-4F31E6E1F820}
AppName=Mynil Music
AppVersion={#AppVersion}
AppPublisher=Mynil Music
AppPublisherURL=https://github.com/TobSha-alt/Mynil-Music
AppSupportURL=https://github.com/TobSha-alt/Mynil-Music/issues
AppUpdatesURL=https://github.com/TobSha-alt/Mynil-Music/releases
VersionInfoVersion={#AppVersion}.0
VersionInfoCompany=Mynil Music
VersionInfoDescription=Mynil Music Setup
VersionInfoCopyright=Copyright (C) 2026 Mynil Music
DefaultDirName={localappdata}\Programs\Mynil Music
DefaultGroupName=Mynil Music
AllowNoIcons=yes
DisableDirPage=no
DisableProgramGroupPage=no
OutputDir=..\..\release
OutputBaseFilename=Mynil-Setup-{#AppVersion}-win-x64
SetupIconFile=..\..\native\windows\sona.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Types]
Name: "full"; Description: "Full installation (recommended)"
Name: "compact"; Description: "Compact installation (core app only)"
Name: "custom"; Description: "Custom installation"; Flags: iscustom

[Components]
Name: "core"; Description: "Mynil Music Core Application (Player, Lyrics, Offline Store & Sync)"; Types: full compact custom; Flags: fixed
Name: "shortcuts"; Description: "Shortcuts"; Types: full
Name: "shortcuts\desktop"; Description: "Desktop Shortcut"; Types: full
Name: "shortcuts\startmenu"; Description: "Start Menu Shortcut"; Types: full
Name: "startup"; Description: "Start Mynil Music automatically when Windows starts"; Types: custom
Name: "protocol"; Description: "Register mynil:// URL protocol handler"; Types: full custom

[Files]
Source: "..\..\Mynil-win\*"; DestDir: "{app}\Mynil-win"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: core
Source: "..\..\backend\*"; DestDir: "{app}\backend"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: core
Source: "..\..\dist\*"; DestDir: "{app}\dist"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: core
Source: "..\..\package.json"; DestDir: "{app}"; Flags: ignoreversion; Components: core

[Icons]
Name: "{group}\Mynil Music"; Filename: "{app}\Mynil-win\Mynil.exe"; IconFilename: "{app}\Mynil-win\Mynil.exe"; Components: shortcuts\startmenu
Name: "{autodesktop}\Mynil Music"; Filename: "{app}\Mynil-win\Mynil.exe"; IconFilename: "{app}\Mynil-win\Mynil.exe"; Components: shortcuts\desktop

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "MynilMusic"; ValueData: """{app}\Mynil-win\Mynil.exe"""; Flags: uninsdeletevalue; Components: startup
Root: HKCU; Subkey: "Software\Classes\mynil"; ValueType: string; ValueName: ""; ValueData: "URL:Mynil Music Protocol"; Flags: uninsdeletekey; Components: protocol
Root: HKCU; Subkey: "Software\Classes\mynil"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""; Components: protocol
Root: HKCU; Subkey: "Software\Classes\mynil\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: """{app}\Mynil-win\Mynil.exe"",0"; Components: protocol
Root: HKCU; Subkey: "Software\Classes\mynil\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\Mynil-win\Mynil.exe"" ""%1"""; Components: protocol

[Run]
Filename: "{app}\Mynil-win\Mynil.exe"; Description: "{cm:LaunchProgram,Mynil Music}"; Flags: nowait postinstall skipifsilent
