#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{9F7C3B2F-1D5A-4F32-8B9C-5E42F7F2A931}
AppName=Mynil Mono
AppVersion={#AppVersion}
AppPublisher=Mynil Music
DefaultDirName={localappdata}\Programs\Mynil Mono
DefaultGroupName=Mynil Mono
AllowNoIcons=yes
DisableDirPage=no
DisableProgramGroupPage=no
OutputDir=..\..\release
OutputBaseFilename=Mynil-Mono-Setup-{#AppVersion}-win-x64
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
Name: "core"; Description: "Mynil Mono Core Application (Monochrome Edition)"; Types: full compact custom; Flags: fixed
Name: "shortcuts"; Description: "Shortcuts"; Types: full
Name: "shortcuts\desktop"; Description: "Desktop Shortcut"; Types: full
Name: "shortcuts\startmenu"; Description: "Start Menu Shortcut"; Types: full
Name: "startup"; Description: "Start Mynil Mono automatically when Windows starts"; Types: custom

[Files]
Source: "..\..\MynilMono-win\*"; DestDir: "{app}\MynilMono-win"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: core
Source: "..\..\backend\*"; DestDir: "{app}\backend"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: core
Source: "..\..\dist\*"; DestDir: "{app}\dist"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: core
Source: "..\..\package.json"; DestDir: "{app}"; Flags: ignoreversion; Components: core

[Icons]
Name: "{group}\Mynil Mono"; Filename: "{app}\MynilMono-win\Mynil.exe"; IconFilename: "{app}\MynilMono-win\Mynil.exe"; Components: shortcuts\startmenu
Name: "{autodesktop}\Mynil Mono"; Filename: "{app}\MynilMono-win\Mynil.exe"; IconFilename: "{app}\MynilMono-win\Mynil.exe"; Components: shortcuts\desktop

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "MynilMono"; ValueData: """{app}\MynilMono-win\Mynil.exe"""; Flags: uninsdeletevalue; Components: startup

[Run]
Filename: "{app}\MynilMono-win\Mynil.exe"; Description: "{cm:LaunchProgram,Mynil Mono}"; Flags: nowait postinstall skipifsilent
