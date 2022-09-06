/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// FIXME: figure out why the hell this causes builds to fail
// import { PluginToolSpec } from "@garden-io/sdk/types"
import { posix } from "path"
import { PluginToolSpec } from "@garden-io/core/build/src/types/plugin/tools"

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
  linux: JdkBinary
  windows: JdkBinary
}

const jdk8Version: JdkVersion = {
  lookupName: "openjdk-8",
  description: "The OpenJDK 8 library.",
  baseUrl: "https://github.com/AdoptOpenJDK/openjdk8-binaries/releases/download/jdk8u292-b10/",
  versionName: "jdk8u292-b10",
  mac_amd64: {
    filename: "OpenJDK8U-jdk_x64_mac_hotspot_8u292b10.tar.gz",
    sha256: "5646fbe9e4138c902c910bb7014d41463976598097ad03919e4848634c7e8007",
  },
  linux: {
    filename: "OpenJDK8U-jdk_x64_linux_hotspot_8u292b10.tar.gz",
    sha256: "0949505fcf42a1765558048451bb2a22e84b3635b1a31dd6191780eeccaa4ada",
  },
  windows: {
    filename: "OpenJDK8U-jdk_x64_windows_hotspot_8u292b10.zip",
    sha256: "2405e11f9f3603e506cf7ab01fcb67a3e3a1cf3e7858e14d629a72c9a24c6c42",
  },
}

const jdk11Version: JdkVersion = {
  lookupName: "openjdk-11",
  description: "The OpenJDK 11 library.",
  baseUrl: "https://github.com/AdoptOpenJDK/openjdk11-binaries/releases/download/jdk-11.0.9.1%2B1/",
  versionName: "jdk-11.0.9.1+1",
  mac_amd64: {
    filename: "OpenJDK11U-jdk_x64_mac_hotspot_11.0.9.1_1.tar.gz",
    sha256: "96bc469f9b02a3b84382a0685b0bd7935e1ad1bd82a0aab9befb5b42a17cbd77",
  },
  linux: {
    filename: "OpenJDK11U-jdk_x64_linux_hotspot_11.0.9.1_1.tar.gz",
    sha256: "e388fd7f3f2503856d0b04fde6e151cbaa91a1df3bcebf1deddfc3729d677ca3",
  },
  windows: {
    filename: "OpenJDK11U-jdk_x64_windows_hotspot_11.0.9.1_1.zip",
    sha256: "fea633dc37f007cb6b1e1af1874da63ad3d5e31817e583048287c67010dce5c8",
  },
}

const jdk13Version: JdkVersion = {
  lookupName: "openjdk-13",
  description: "The OpenJDK 13 library.",
  baseUrl: "https://github.com/AdoptOpenJDK/openjdk13-binaries/releases/download/jdk-13%2B33/",
  versionName: "jdk-13+33",
  mac_amd64: {
    filename: "OpenJDK13U-jdk_x64_mac_hotspot_13_33.tar.gz",
    sha256: "f948be96daba250b6695e22cb51372d2ba3060e4d778dd09c89548889783099f",
  },
  linux: {
    filename: "OpenJDK13U-jdk_x64_linux_hotspot_13_33.tar.gz",
    sha256: "e562caeffa89c834a69a44242d802eae3523875e427f07c05b1902c152638368",
  },
  windows: {
    filename: "OpenJDK13U-jdk_x64_windows_hotspot_13_33.zip",
    sha256: "65d71a954167d538c7a260e64d9868ceffe60edd1108817a9c44fddf60d13569",
  },
}

const jdk17Version: JdkVersion = {
  lookupName: "openjdk-17",
  description: "The OpenJDK 17 library.",
  baseUrl: "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.4.1%2B1/",
  versionName: "jdk-17.0.4.1+1",
  mac_amd64: {
    filename: "OpenJDK17U-jdk_x64_mac_hotspot_17.0.4.1_1.tar.gz",
    sha256: "ac21a5a87f7cfa00212ab7c41f7eb80ca33640d83b63ad850be811c24095d61a",
  },
  mac_arm64: {
    filename: "OpenJDK17U-jdk_aarch64_mac_hotspot_17.0.4.1_1.tar.gz",
    sha256: "3a976943a9e6a635e68e2b06bd093fc096aad9f5894acda673d3bea0cb3a6f38",
  },
  linux: {
    filename: "OpenJDK17U-jdk_x64_linux_hotspot_17.0.4.1_1.tar.gz",
    sha256: "5fbf8b62c44f10be2efab97c5f5dbf15b74fae31e451ec10abbc74e54a04ff44",
  },
  windows: {
    filename: "OpenJDK17U-jdk_x64_windows_hotspot_17.0.4.1_1.zip",
    sha256: "3860d2ed7405674baeb0f9f4c71377421716759fe4301e92bdd4dd43c0442dc3",
  },
}

function openJdkSpec(jdkVersion: JdkVersion): PluginToolSpec {
  const macBuilds = [
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
      url: jdkVersion.baseUrl + jdkVersion.mac_amd64.filename,
      sha256: jdkVersion.mac_amd64.sha256,
      extract: {
        format: "tar",
        targetPath: posix.join(jdkVersion.versionName, "Contents", "Home"),
      },
    })
  }

  return {
    name: jdkVersion.lookupName,
    description: jdkVersion.description,
    type: "library",
    builds: [
      {
        platform: "linux",
        architecture: "amd64",
        url: jdkVersion.baseUrl + jdkVersion.linux.filename,
        sha256: jdkVersion.linux.sha256,
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
      ...macBuilds
    ],
  }
}

export const openJdkSpecs: PluginToolSpec[] = [
  openJdkSpec(jdk8Version),
  openJdkSpec(jdk11Version),
  openJdkSpec(jdk13Version),
  openJdkSpec(jdk17Version),
]
