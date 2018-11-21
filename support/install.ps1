#Requires -RunAsAdministrator
# This is the Garden installer for Windows. Here's a brief description of what
# it does:
#
# 1. Check if Chocolatey is installed, installs it if missing.
# 2. Installs and/or upgrades dependencies using Chocolatey.
# 3. Checks whether Hyper-V is enabled.
# 4. Checks whether Kubernetes is the default orchestrator for Docker.
# 5. Installs or updates the garden binary.
#
# To execute it run the following command in PowerShell:
# Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/garden-io/garden/master/garden-cli/support/install.ps1'))
#
# For more information visit https://docs.garden.io/

Function CheckHyperV {
    # if ((New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) -eq $false) {
    #     ContinueYN("To check whether Hyper-V is enabled (and enable it if necessary), please run as Administrator. If you choose to continue the Hyper-V check will be skipped.")
    #     return
    # }
    $hyperv = Get-WindowsOptionalFeature -FeatureName Microsoft-Hyper-V-All -Online
    if($hyperv.State -ne "Enabled") {
        Write-Host "- WARNING: Hyper-V is being enabled. You will need to restart your computer for the changes to take effect (This is required for Docker for Windows to run)."
        # For testing, disable with: Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All
        Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All
    } else {
        Write-Host "- Hyper-V is enabled."
    }
}

Function CheckKubernetes {
    $dockerConfigPath = (Join-Path $HOME .docker\config.json)
    $dockerConfigParsed = (Get-Content $dockerConfigPath | Out-String | ConvertFrom-Json)
    if ($dockerConfigParsed.stackOrchestrator -ne "kubernetes") {
        Write-Host "- WARNING: Kubernetes is not enabled as the default orchestrator for Docker. Please enable it in the Kubernetes section of Docker for Windows's settings."
    } else {
        Write-Host "- Kubernetes is enabled."
    }
}

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
Please refer to the Basics section of our documentation at https://docs.garden.io/basics for details.

Please note that you may need to answer prompts during the installation.

*** Checking dependencies ***
")

# Install Chocolatey if needed
CheckChocolatey

# Install choco dependencies
Write-Host "- Installing Chocolatey dependencies..."
choco upgrade -y git rsync docker-for-windows

[Console]::ResetColor()

# Check system configuration
CheckHyperV
CheckKubernetes

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

# Download and extract the archive to $gardenBinPath
# TODO: change this to point to the latest stable instead of the hard-coded version
$url = "https://github.com/garden-io/garden/releases/download/v0.8.0-rc4/garden-0.8.0-rc4-windows-amd64.zip"
$zipPath = "$gardenTmpPath\garden-0.8.0-rc4-windows-amd64.zip"

Write-Host "-> Downloading $url..."
if (-not ([Net.ServicePointManager]::SecurityProtocol).ToString().Contains([Net.SecurityProtocolType]::Tls12)) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol.toString() + ', ' + [Net.SecurityProtocolType]::Tls12
}
(New-Object System.Net.WebClient).DownloadFile($url, $zipPath)

Write-Host "-> Extracting archive..."
Expand-Archive $zipPath -DestinationPath $gardenTmpPath -Force
Copy-Item -Force -Recurse -Path "$gardenTmpPath/win-amd64/*" -Destination $gardenBinPath

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

Note: Please see the logs above for any warnings. If Docker for Windows was just installed and/or
      Hyper-V was just enabled, you may need to restart your computer before using Docker and Garden.
")
