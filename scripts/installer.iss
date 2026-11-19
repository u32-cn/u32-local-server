; u32-local-server Windows 安装包 (Inno Setup 6)
; 用法：iscc scripts/installer.iss
; 需先运行 node scripts/build-icon.js 和 node scripts/build-sea.js

#define AppName "u32-local-server"
#define AppVersion "1.7.0"
#define AppPublisher "vtxf"
#define AppExeName "u32-ls.exe"
#define AppDir "{userpf}\u32-local-server"

[Setup]
AppId={{U32LS-A1B2-C3D4-E5F6-0123456789AB}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={#AppDir}
DefaultGroupName={#AppName}
OutputDir=..\dist
OutputBaseFilename=u32-local-server-setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\resources\ls.ico
; exe 未签名时首次运行 SmartScreen 可能提示；如需正式签名，在 [Setup] 加 SignTool

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\dist\{#AppExeName}"; DestDir: "{app}"; Flags: ignoreversion
; 图标随包分发：开始菜单快捷方式用；托盘图标由 exe 从嵌入资源释放到用户目录
Source: "..\resources\ls.ico"; DestDir: "{app}\resources"; Flags: ignoreversion

[InstallDelete]
; 清理旧版的双快捷方式（改名/合并入口后 Inno 不会自动删除历史 .lnk）
Type: files; Name: "{group}\u32-local-server 控制台.lnk"
Type: files; Name: "{group}\u32-local-server 系统托盘.lnk"

[Icons]
; 单一入口：点击即启动服务 + 托盘（launch 幂等），不写 PATH
Name: "{group}\u32-local-server"; Filename: "{app}\{#AppExeName}"; Parameters: "launch"; IconFilename: "{app}\resources\ls.ico"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"; IconFilename: "{app}\resources\ls.ico"

[Run]
; 注册开机自启 + 右键菜单；随后 launch（启动服务 + 托盘），安装完即可用
Filename: "{app}\{#AppExeName}"; Parameters: "register"; Flags: runhidden; \
  Description: "注册开机自启与右键菜单"; StatusMsg: "Registering auto-start..."
Filename: "{app}\{#AppExeName}"; Parameters: "launch"; Flags: runhidden; \
  Description: "启动服务与托盘图标"; StatusMsg: "Starting service and tray..."

[UninstallRun]
; 托盘是独立进程，卸载时只清理注册表；托盘进程可用菜单「退出托盘」结束
Filename: "{app}\{#AppExeName}"; Parameters: "unregister"; Flags: runhidden; RunOnceId: "U32LSUnregister"
