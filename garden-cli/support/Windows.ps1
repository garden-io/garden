# This is the Garden installer for Windows. Here's a brief description of what
# it does:
#
# 1. Checks whether Hyper-V is enabled.
# 2. Checks whether Docker is installed.
# 3. Checks whether Kubernetes is the default orchestrator for Docker.
# 4. Installs Stern.
# 5. Installs the Chocolatey package manager.
# 6. Installs the listed dependencies using Chocolatey if they're not already 
#    present (currently git, nodejs, rsync, and kubernetes-helm).
# 7. Installs the windows-build-tools NPM package.
# 8. Install the garden-cli NPM package.
#
# To execute it run the following command in PowerShell:
# Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString('https://garden.io/Windows.ps1'))
#
# For more information visit https://docs.garden.io/

Function CheckHyperV {
    # if ((New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) -eq $false) {
    #     ContinueYN("To check whether Hyper-V is enabled (and enable it if necessary), please run as Administrator. If you choose to continue the Hyper-V check will be skipped.")
    #     return
    # }
    $hyperv = Get-WindowsOptionalFeature -FeatureName Microsoft-Hyper-V-All -Online
    if($hyperv.State -ne "Enabled") {
        Write-Host "- Hyper-V is being enabled. Please restart afterwards and run this installer again."
        # For testing, disable with: Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All
        Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All
        Exit
    } else {
        Write-Host "- Hyper-V is enabled."
    }
}

Function CheckDocker {
    if ((CheckIfExists("docker")) -eq $false) {
        Write-Host "- Docker is not installed. Please download the Edge release at: https://docs.docker.com/docker-for-windows/edge-release-notes/"
        Exit
    } else {
        Write-Host "- Docker is installed."
    }
}

Function CheckKubernetes {
    $dockerConfigPath = (Join-Path $HOME .docker\config.json)
    $dockerConfigParsed = (Get-Content $dockerConfigPath | Out-String | ConvertFrom-Json)
    if ($dockerConfigParsed.stackOrchestrator -ne "kubernetes") { 
        Write-Host "- Kubernetes is not enabled as the default orchestrator for Docker. Please enable it on the Kubernetes section of Docker for Windows's settings."
        Exit
    } else {
        Write-Host "- Kubernetes is enabled."
    }
}

Function CheckStern {
    if ((CheckIfExists("stern")) -eq $false) {
        Write-Host "- Stern not found. Installing it..."
        [Net.ServicePointManager]::SecurityProtocol = "tls12, tls11, tls"
        Invoke-WebRequest -Uri "https://github.com/wercker/stern/releases/download/1.7.0/stern_windows_amd64.exe" -OutFile "$Env:SystemRoot\system32\stern.exe"
    ​} else {
        Write-Host "- Stern is installed."
    }
}

Function CheckChocolatey {
    if ((CheckIfExists("chocolatey")) -eq $false) {
        Write-Host "Chocolatey not found. Installing it..."
        iex ((new-object net.webclient).DownloadString('http://chocolatey.org/install.ps1'))
    } else {
        Write-Host "- Chocolatey is installed."
    }
}

Function CheckChocolateyDeps {
    param($array)
    $newArray = @("-y")
    for ($i=0; $i -lt $array.length; $i++) {
        if ((CheckIfExists($array[$i][0])) -eq $false) {
            Write-Host - Package $array[$i][1] not found. Installing...
            $newArray = $newArray + $array[$i][1]
        } else {
            Write-Host - Package $array[$i][0] already present...
        }
    }
    & cinst $newArray
}

Function RemoveItemFromArray() {
    param ($array, $itemToDelete)
    $newArray = @()
    foreach ($item in $array) {
        if ($item -ne $itemToDelete) {
            $newArray = $newArray += $item
        }
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
    Start-Process powershell.exe "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    Exit 
}

# Start here.
CheckHyperV
CheckDocker
CheckKubernetes
CheckStern
CheckChocolatey

# chocDeps lists the chocolatey dependencies to be installed. It consists of
# pairs, where the first element is the package's CLI command (to check whether
# it's already installed), and the second is its respective Chocolatey package
# name.
$chocDeps = (("git","git"),
             ("rsync","rsync"),
             ("node","nodejs"),
             ("helm","kubernetes-helm"))
CheckChocolateyDeps($chocDeps)

# Node Configuration.
$nodePath = Join-Path $env:programfiles 'nodejs'
$is64bit = (Get-WmiObject Win32_Processor).AddressWidth -eq 64
if ($is64bit) {$nodePath = Join-Path ${env:ProgramFiles(x86)} 'nodejs'}
$env:Path = "$($env:Path);$nodePath"

npm install --global --update --production windows-build-tools
npm config set msvs_version 2015 --global
npm install --global --update garden-cli
Pause("Process finished. Press any key to finish.")

# Notes for testing:
#
# npm uninstall -g garden-cli windows-build-tools
# choco uninstall git nodejs rsync kubernetes-helm
# rm -r -fo C:\ProgramData\chocolatey
#
# choco pack
# choco install garden-cli -dv -s .