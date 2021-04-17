#Requires -RunAsAdministrator
# This is the Garden installer for Windows. Here's a brief description of what
# it does:
#
# 1. Check if Chocolatey is installed, installs it if missing.
# 2. Installs and/or upgrades dependencies using Chocolatey.
# 3. Installs or updates the garden binary.
#
# To execute it run the following command in PowerShell:
# Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/garden-io/garden/master/support/install.ps1'))
#
# For more information visit https://docs.garden.io/

Function CheckChocolatey {
    if ((CheckIfExists("chocolatey")) -eq $false) {
        Write-Host "- Chocolatey not found. Installing it..."
        iex ((new-object net.webclient).DownloadString('http://chocolatey.org/install.ps1'))
    } else {
        Write-Host "- Chocolatey is installed."
    }
}

Function ContinueYN ($message) {
    Write-Host "$message" -ForegroundColor Yellow
    Write-Host -NoNewLine "Continue? (Y/N) "
    $response = Read-Host
    if ( $response -ne "Y" ) { Exit }
}

Function Pause ($message) {
    Write-Host "$message" -ForegroundColor Yellow
    $x = $host.ui.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

Function CheckIfExists {
    Param ($command)
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'stop'
    try {
        if (Get-Command $command) {
            return $true
        }
    } Catch {
        return $false
    }
    Finally {
        $ErrorActionPreference=$oldPreference
    }
}

# Elevate to Admin.
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host("This script needs to be run as an Administrator. Please start a PowerShell windows as an Administrator and run the script again.")
    return
}

$ErrorActionPreference = "Stop"

# Start here.
Write-Host("
Hi! This script will install the Garden CLI, after checking and installing missing dependencies.
Please refer to the Installation section of our documentation at https://docs.garden.io/installation for details.

Please note that you may need to answer prompts during the installation.

*** Checking dependencies ***
")

# Install Chocolatey if needed
CheckChocolatey

# Install choco dependencies
Write-Host "- Installing Chocolatey dependencies..."
choco upgrade -y git rsync

[Console]::ResetColor()

# Install the garden binary
$homedir = Resolve-Path "~"
$gardenHomePath = "$homedir\.garden"
$gardenBinPath = "$gardenHomePath\bin"
$gardenTmpPath = "$gardenHomePath\tmp"

Write-Host("
*** Installing the Garden CLI to $gardenBinPath and adding to PATH ***
")

# Make sure paths exists
md -Force $gardenHomePath | Out-Null
md -Force $gardenBinPath | Out-Null
md -Force $gardenTmpPath | Out-Null

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Download and extract the archive to $gardenBinPath
$latestRelease = Invoke-WebRequest "https://github.com/garden-io/garden/releases/latest" -UseBasicParsing -Headers @{"Accept"="application/json"}
# The releases are returned in the format {"id":3622206,"tag_name":"hello-1.0.0.11",...}, we have to extract the tag_name.
$json = $latestRelease.Content | ConvertFrom-Json
$latestVersion = $json.tag_name

$url = "https://github.com/garden-io/garden/releases/download/$latestVersion/garden-$latestVersion-windows-amd64.zip"
$zipPath = "$gardenTmpPath\garden-$latestVersion-windows-amd64.zip"

Write-Host "-> Downloading $url..."
if (-not ([Net.ServicePointManager]::SecurityProtocol).ToString().Contains([Net.SecurityProtocolType]::Tls12)) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol.toString() + ', ' + [Net.SecurityProtocolType]::Tls12
}
(New-Object System.Net.WebClient).DownloadFile($url, $zipPath)

Write-Host "-> Extracting archive..."
Expand-Archive $zipPath -DestinationPath $gardenTmpPath -Force
Copy-Item -Force -Recurse -Path "$gardenTmpPath/windows-amd64/*" -Destination $gardenBinPath

# Make sure $gardenBinPath is in the user's PATH
if (!($env:path.ToLower() -like "*$gardenBinPath*".ToLower())) {
    Write-Host "-> Adding $gardenBinPath to your PATH (you may need to restart your console sessions for it to take effect)"
    $oldPath = (Get-ItemProperty -Path 'Registry::HKEY_LOCAL_MACHINE\System\CurrentControlSet\Control\Session Manager\Environment' -Name PATH).path
    $newPath = "$oldPath;$gardenBinPath"
    Set-ItemProperty -Path 'Registry::HKEY_LOCAL_MACHINE\System\CurrentControlSet\Control\Session Manager\Environment' -Name PATH -Value $newPath
    $env:path = "$env:path;$gardenBinPath"

    # notify all windows of environment block change
    $HWND_BROADCAST = [IntPtr] 0xffff;
    $WM_SETTINGCHANGE = 0x1a;
    $result = [UIntPtr]::Zero

    if (-not ("Win32.NativeMethods" -as [Type]))
    {
        # import sendmessagetimeout from win32
        Add-Type -Namespace Win32 -Name NativeMethods -MemberDefinition @"
        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        public static extern IntPtr SendMessageTimeout(
        IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam,
        uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
"@
    }
    [Win32.Nativemethods]::SendMessageTimeout($HWND_BROADCAST, $WM_SETTINGCHANGE, [UIntPtr]::Zero, "Environment", 2, 5000, [ref] $result);

} else {
    Write-Host "-> $gardenBinPath is already in your PATH"
}

Write-Host("
Garden CLI successfully installed!
You can now run the garden command in your shell (you may need to restart your sessions for changes to PATH to take effect).
Please head over to https://docs.garden.io for more information on how to get started.
")
