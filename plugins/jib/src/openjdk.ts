/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ToolBuildSpec } from "@garden-io/core/src/plugin/tools.js"
import type { PluginToolSpec } from "@garden-io/sdk/build/src/types.js"
import { posix } from "path"

interface JdkBinary {
  filename: string
  sha256: string
}

interface JdkVersion {
  lookupName: string
  description: string
  baseUrl: string
  versionName: string
  mac_amd64: JdkBinary
  mac_arm64?: JdkBinary
  linux_amd64: JdkBinary
  linux_arm64: JdkBinary
  windows: JdkBinary
}

const jdk8VersionName = "jdk8u292-b10"
const jdk8Version: JdkVersion = {
  lookupName: "openjdk-8",
  description: `The OpenJDK 8 library, ${jdk8VersionName}`,
  baseUrl: "https://github.com/AdoptOpenJDK/openjdk8-binaries/releases/download/jdk8u292-b10/",
  versionName: jdk8VersionName,
  mac_amd64: {
    filename: "OpenJDK8U-jdk_x64_mac_hotspot_8u292b10.tar.gz",
    sha256: "5646fbe9e4138c902c910bb7014d41463976598097ad03919e4848634c7e8007",
  },
  linux_amd64: {
    filename: "OpenJDK8U-jdk_x64_linux_hotspot_8u292b10.tar.gz",
    sha256: "0949505fcf42a1765558048451bb2a22e84b3635b1a31dd6191780eeccaa4ada",
  },
  linux_arm64: {
    filename: "OpenJDK8U-jdk_aarch64_linux_hotspot_8u292b10.tar.gz",
    sha256: "a29edaf66221f7a51353d3f28e1ecf4221268848260417bc562d797e514082a8",
  },
  windows: {
    filename: "OpenJDK8U-jdk_x64_windows_hotspot_8u292b10.zip",
    sha256: "2405e11f9f3603e506cf7ab01fcb67a3e3a1cf3e7858e14d629a72c9a24c6c42",
  },
}

const jdk11VersionName = "jdk-11.0.9.1+1"
const jdk11Version: JdkVersion = {
  lookupName: "openjdk-11",
  description: `The OpenJDK 11 library, ${jdk11VersionName}`,
  baseUrl: "https://github.com/AdoptOpenJDK/openjdk11-binaries/releases/download/jdk-11.0.9.1%2B1/",
  versionName: jdk11VersionName,
  mac_amd64: {
    filename: "OpenJDK11U-jdk_x64_mac_hotspot_11.0.9.1_1.tar.gz",
    sha256: "96bc469f9b02a3b84382a0685b0bd7935e1ad1bd82a0aab9befb5b42a17cbd77",
  },
  linux_amd64: {
    filename: "OpenJDK11U-jdk_x64_linux_hotspot_11.0.9.1_1.tar.gz",
    sha256: "e388fd7f3f2503856d0b04fde6e151cbaa91a1df3bcebf1deddfc3729d677ca3",
  },
  linux_arm64: {
    filename: "OpenJDK11U-jdk_aarch64_linux_hotspot_11.0.9.1_1.tar.gz",
    sha256: "e9cea040cdf5d9b0a2986feaf87662e1aef68e876f4d66664cb2be36e26db412",
  },
  windows: {
    filename: "OpenJDK11U-jdk_x64_windows_hotspot_11.0.9.1_1.zip",
    sha256: "fea633dc37f007cb6b1e1af1874da63ad3d5e31817e583048287c67010dce5c8",
  },
}

const jdk13VersionName = "jdk-13+33"
const jdk13Version: JdkVersion = {
  lookupName: "openjdk-13",
  description: `[DEPRECATED] The OpenJDK 13 library, ${jdk13VersionName}`,
  baseUrl: "https://github.com/AdoptOpenJDK/openjdk13-binaries/releases/download/jdk-13%2B33/",
  versionName: jdk13VersionName,
  mac_amd64: {
    filename: "OpenJDK13U-jdk_x64_mac_hotspot_13_33.tar.gz",
    sha256: "f948be96daba250b6695e22cb51372d2ba3060e4d778dd09c89548889783099f",
  },
  linux_amd64: {
    filename: "OpenJDK13U-jdk_x64_linux_hotspot_13_33.tar.gz",
    sha256: "e562caeffa89c834a69a44242d802eae3523875e427f07c05b1902c152638368",
  },
  linux_arm64: {
    filename: "OpenJDK13U-jdk_aarch64_linux_hotspot_13_33.tar.gz",
    sha256: "74f4110333ac4239564ed864b1d7d69b7af32af39efcfbde9816e1486cb5ae07",
  },
  windows: {
    filename: "OpenJDK13U-jdk_x64_windows_hotspot_13_33.zip",
    sha256: "65d71a954167d538c7a260e64d9868ceffe60edd1108817a9c44fddf60d13569",
  },
}

const jdk17VersionName = "jdk-17.0.4.1+1"
const jdk17Version: JdkVersion = {
  lookupName: "openjdk-17",
  description: `The OpenJDK 17 library, ${jdk17VersionName}`,
  baseUrl: "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.4.1%2B1/",
  versionName: jdk17VersionName,
  mac_amd64: {
    filename: "OpenJDK17U-jdk_x64_mac_hotspot_17.0.4.1_1.tar.gz",
    sha256: "ac21a5a87f7cfa00212ab7c41f7eb80ca33640d83b63ad850be811c24095d61a",
  },
  mac_arm64: {
    filename: "OpenJDK17U-jdk_aarch64_mac_hotspot_17.0.4.1_1.tar.gz",
    sha256: "3a976943a9e6a635e68e2b06bd093fc096aad9f5894acda673d3bea0cb3a6f38",
  },
  linux_amd64: {
    filename: "OpenJDK17U-jdk_x64_linux_hotspot_17.0.4.1_1.tar.gz",
    sha256: "5fbf8b62c44f10be2efab97c5f5dbf15b74fae31e451ec10abbc74e54a04ff44",
  },
  linux_arm64: {
    filename: "OpenJDK17U-jdk_aarch64_linux_hotspot_17.0.4.1_1.tar.gz",
    sha256: "3c7460de77421284b38b4e57cb1bd584a6cef55c34fc51a12270620544de2b8a",
  },
  windows: {
    filename: "OpenJDK17U-jdk_x64_windows_hotspot_17.0.4.1_1.zip",
    sha256: "3860d2ed7405674baeb0f9f4c71377421716759fe4301e92bdd4dd43c0442dc3",
  },
}

const jdk21VersionName = "jdk-21.0.3+9"
const jdk21Version: JdkVersion = {
  lookupName: "openjdk-21",
  description: `The OpenJDK 21 library, ${jdk21VersionName}`,
  baseUrl: "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.3%2B9/",
  versionName: jdk21VersionName,
  mac_amd64: {
    filename: "OpenJDK21U-jdk_x64_mac_hotspot_21.0.3_9.tar.gz",
    sha256: "f777103aab94330d14a29bd99f3a26d60abbab8e2c375cec9602746096721a7c",
  },
  mac_arm64: {
    filename: "OpenJDK21U-jdk_aarch64_mac_hotspot_21.0.3_9.tar.gz",
    sha256: "b6be6a9568be83695ec6b7cb977f4902f7be47d74494c290bc2a5c3c951e254f",
  },
  linux_amd64: {
    filename: "OpenJDK21U-jdk_x64_linux_hotspot_21.0.3_9.tar.gz",
    sha256: "fffa52c22d797b715a962e6c8d11ec7d79b90dd819b5bc51d62137ea4b22a340",
  },
  linux_arm64: {
    filename: "OpenJDK21U-jdk_aarch64_linux_hotspot_21.0.3_9.tar.gz",
    sha256: "7d3ab0e8eba95bd682cfda8041c6cb6fa21e09d0d9131316fd7c96c78969de31",
  },
  windows: {
    filename: "OpenJDK21U-jdk_x64_windows_hotspot_21.0.3_9.zip",
    sha256: "c43a66cff7a403d56c5c5e1ff10d3d5f95961abf80f97f0e35380594909f0e4d",
  },
}

function openJdkSpec(jdkVersion: JdkVersion): PluginToolSpec {
  const macBuilds: ToolBuildSpec[] = [
    {
      platform: "darwin",
      architecture: "amd64",
      url: jdkVersion.baseUrl + jdkVersion.mac_amd64.filename,
      sha256: jdkVersion.mac_amd64.sha256,
      extract: {
        format: "tar",
        targetPath: posix.join(jdkVersion.versionName, "Contents", "Home"),
      },
    },
  ]

  if (jdkVersion.mac_arm64) {
    macBuilds.push({
      platform: "darwin",
      architecture: "arm64",
      url: jdkVersion.baseUrl + jdkVersion.mac_arm64.filename,
      sha256: jdkVersion.mac_arm64.sha256,
      extract: {
        format: "tar",
        targetPath: posix.join(jdkVersion.versionName, "Contents", "Home"),
      },
    })
  }

  return {
    name: jdkVersion.lookupName,
    version: jdkVersion.versionName,
    description: jdkVersion.description,
    type: "library",
    builds: [
      {
        platform: "linux",
        architecture: "amd64",
        url: jdkVersion.baseUrl + jdkVersion.linux_amd64.filename,
        sha256: jdkVersion.linux_amd64.sha256,
        extract: {
          format: "tar",
          targetPath: jdkVersion.versionName,
        },
      },
      {
        platform: "linux",
        architecture: "arm64",
        url: jdkVersion.baseUrl + jdkVersion.linux_arm64.filename,
        sha256: jdkVersion.linux_arm64.sha256,
        extract: {
          format: "tar",
          targetPath: jdkVersion.versionName,
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: jdkVersion.baseUrl + jdkVersion.windows.filename,
        sha256: jdkVersion.windows.sha256,
        extract: {
          format: "zip",
          targetPath: jdkVersion.versionName,
        },
      },
      ...macBuilds,
    ],
  }
}

export const openJdkSpecs: PluginToolSpec[] = [
  openJdkSpec(jdk8Version),
  openJdkSpec(jdk11Version),
  openJdkSpec(jdk13Version),
  openJdkSpec(jdk17Version),
  openJdkSpec(jdk21Version),
]
