#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{8D6B2A1E-9C4F-4E21-9A7B-4F31E6E1F820}
AppName=Sona
AppVersion={#AppVersion}
AppPublisher=Sona
DefaultDirName={localappdata}\Programs\Sona
DefaultGroupName=Sona
AllowNoIcons=yes
OutputDir=..\..\release
OutputBaseFilename=Sona-Setup-{#AppVersion}-win-x64
SetupIconFile=..\..\native\windows\sona.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\..\Sona-win\*"; DestDir: "{app}\Sona-win"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\backend\*"; DestDir: "{app}\backend"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\dist\*"; DestDir: "{app}\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\package.json"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Sona"; Filename: "{app}\Sona-win\Sona.exe"; IconFilename: "{app}\Sona-win\Sona.exe"
Name: "{autodesktop}\Sona"; Filename: "{app}\Sona-win\Sona.exe"; IconFilename: "{app}\Sona-win\Sona.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Sona-win\Sona.exe"; Description: "{cm:LaunchProgram,Sona}"; Flags: nowait postinstall skipifsilent
