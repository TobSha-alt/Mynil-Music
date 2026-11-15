#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{8D6B2A1E-9C4F-4E21-9A7B-4F31E6E1F820}
AppName=Mynil Music
AppVersion={#AppVersion}
AppPublisher=Mynil Music
DefaultDirName={localappdata}\Programs\Mynil Music
DefaultGroupName=Mynil Music
AllowNoIcons=yes
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

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\..\Mynil-win\*"; DestDir: "{app}\Mynil-win"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\backend\*"; DestDir: "{app}\backend"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\dist\*"; DestDir: "{app}\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\package.json"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Mynil Music"; Filename: "{app}\Mynil-win\Mynil.exe"; IconFilename: "{app}\Mynil-win\Mynil.exe"
Name: "{autodesktop}\Mynil Music"; Filename: "{app}\Mynil-win\Mynil.exe"; IconFilename: "{app}\Mynil-win\Mynil.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Mynil-win\Mynil.exe"; Description: "{cm:LaunchProgram,Mynil Music}"; Flags: nowait postinstall skipifsilent
