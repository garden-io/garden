#Requires -RunAsAdministrator
# This is the Garden installer for Windows. Here's a brief description of what
# it does:
#
# 1. Checks whether Hyper-V is enabled.
# 2. Checks whether Docker is installed.
# 3. Checks whether Kubernetes is the default orchestrator for Docker.
# 4. Check if Chocolatey is installed, installs it if missing.
# 5. Installs the listed dependencies using Chocolatey if they're not already
#    present (currently git, nodejs, rsync).
# 6. Installs or updates the windows-build-tools NPM package.
# 7. Installs or updates the garden-cli NPM package.
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
        Write-Host "- Hyper-V is being enabled. You will need to restart your computer for the changes to take effect (This is required for Docker for Windows to run)."
        # For testing, disable with: Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All
        Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All
    } else {
        Write-Host "- Hyper-V is enabled."
    }
    return $true
}

Function CheckDocker {
    if ((CheckIfExists("docker")) -eq $false) {
        Write-Host "- Docker is not installed. Please download and install the Edge release at: https://docs.docker.com/docker-for-windows/edge-release-notes/"
        return $false
    } else {
        Write-Host "- Docker is installed."
    }
    return $true
}

Function CheckKubernetes {
    $dockerConfigPath = (Join-Path $HOME .docker\config.json)
    $dockerConfigParsed = (Get-Content $dockerConfigPath | Out-String | ConvertFrom-Json)
    if ($dockerConfigParsed.stackOrchestrator -ne "kubernetes") {
        Write-Host "- Kubernetes is not enabled as the default orchestrator for Docker. Please enable it in the Kubernetes section of Docker for Windows's settings."
        return $false
    } else {
        Write-Host "- Kubernetes is enabled."
    }
    return $true
}

Function CheckChocolatey {
    if ((CheckIfExists("chocolatey")) -eq $false) {
        Write-Host "- Chocolatey not found. Installing it..."
        iex ((new-object net.webclient).DownloadString('http://chocolatey.org/install.ps1'))
    } else {
        Write-Host "- Chocolatey is installed."
    }
    return $true
}

Function CheckChocolateyDeps {
    param($array)
    $missing = @("-y")
    $install = $false
    for ($i=0; $i -lt $array.length; $i++) {
        if ((CheckIfExists($array[$i][0])) -eq $false) {
            Write-Host - Package $array[$i][1] not found. Installing...
            $missing = $missing + $array[$i][1]
            $install = $true
        } else {
            Write-Host - Package $array[$i][0] already present...
        }
    }
    if ($install) {
        & cinst $missing
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

function CheckIfExists {
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

# Start here.
Write-Host("
Hi! This script will install the Garden CLI, after checking and installing missing dependencies.
Please refer to our Getting Started guide at https://docs.garden.io/introduction/getting-started for details.

Please note that you may need to answer prompts during the installation.

*** Checking dependencies ***
")

if ((CheckHyperV) -eq $false) { return }
if ((CheckDocker) -eq $false) { return }
if ((CheckKubernetes) -eq $false) { return }
if ((CheckChocolatey) -eq $false) { return }

# chocDeps lists the chocolatey dependencies to be installed. It consists of
# pairs, where the first element is the package's CLI command (to check whether
# it's already installed), and the second is its respective Chocolatey package
# name.
$chocDeps = (("git","git"),
             ("rsync","rsync"),
             ("node","nodejs"),
CheckChocolateyDeps($chocDeps)
[Console]::ResetColor()

# Node Configuration.
Write-Host("- Installing/updating Node.js build dependencies")
$nodePath = Join-Path $env:programfiles 'nodejs'
$is64bit = (Get-WmiObject Win32_Processor).AddressWidth -eq 64
if ($is64bit) {$nodePath = Join-Path ${env:ProgramFiles(x86)} 'nodejs'}
$env:Path = "$($env:Path);$nodePath"

# installing >=4.0 ensures we're using Node.js 8.x or newer
npm install --global --update --production windows-build-tools@">=4.0"
npm config set msvs_version 2015 --global

# Install the garden-cli package
Write-Host("
*** Installing the Garden CLI ***
")
npm install --global --update garden-cli

Write-Host("
Garden CLI successfully installed!
You can now run the garden command in your shell.
Please head over to https://docs.garden.io for more information on how to get started.
")

# Notes for testing:
#
# npm uninstall -g garden-cli windows-build-tools
# choco uninstall git nodejs rsync
# rm -r -fo C:\ProgramData\chocolatey
#
# choco pack
# choco install garden-cli -dv -s .