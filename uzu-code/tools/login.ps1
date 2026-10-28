# Run "uzu login" with the per-user Node.js on PATH
# Node.js was installed per-user by winget, so add it to PATH here.
$node = "C:\Users\user\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.20.0-win-x64"
$env:Path = "$node;" + $env:Path
Set-Location (Split-Path $PSScriptRoot -Parent)
& "$node\npx.cmd" uzu login @args
