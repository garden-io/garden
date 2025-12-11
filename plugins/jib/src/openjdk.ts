/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
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
  baseUrlOverride?: string
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

const jdk8VersionName = "jdk8u472-b08"
const jdk8Version: JdkVersion = {
  lookupName: "openjdk-8",
  description: `The OpenJDK 8 library, ${jdk8VersionName}`,
  baseUrl: "https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u472-b08/",
  versionName: jdk8VersionName,
  mac_amd64: {
    filename: "OpenJDK8U-jdk_x64_mac_hotspot_8u472b08.tar.gz",
    sha256: "b6fec006d29f843f9daf062aa1384bdc01b1658aab2e09f519c7341eb4281e4c",
  },
  linux_amd64: {
    filename: "OpenJDK8U-jdk_x64_linux_hotspot_8u472b08.tar.gz",
    sha256: "5becaa4ac660e844c5a39e2ebc39ff5ac824c37ff1b625af8c8b111dc13c3592",
  },
  linux_arm64: {
    filename: "OpenJDK8U-jdk_aarch64_linux_hotspot_8u472b08.tar.gz",
    sha256: "e2aff19d85d2441e409d6cbdf12ef7c2acabb0de73bca4207947135dcaa935a2",
  },
  windows: {
    filename: "OpenJDK8U-jdk_x64_windows_hotspot_8u472b08.zip",
    sha256: "cbafb089f7c8a3e873607c8f4fe40e4943297f641d27806e055e782c82a33985",
  },
}

const jdk11VersionName = "jdk-11.0.29+7"
const jdk11Version: JdkVersion = {
  lookupName: "openjdk-11",
  description: `The OpenJDK 11 library, ${jdk11VersionName}`,
  baseUrl: "https://github.com/adoptium/temurin11-binaries/releases/download/jdk-11.0.29%2B7/",
  versionName: jdk11VersionName,
  mac_amd64: {
    filename: "OpenJDK11U-jdk_x64_mac_hotspot_11.0.29_7.tar.gz",
    sha256: "4bad4982a355b6996e5ebe92b4c7e33bb4ba92ea0ea0fe274cbc994918ce86ff",
  },
  mac_arm64: {
    filename: "OpenJDK11U-jdk_aarch64_mac_hotspot_11.0.29_7.tar.gz",
    sha256: "c6dd4f100ca6953db86470349e762db20903da5ca275b902390352e7dd4b8e0c",
  },
  linux_amd64: {
    filename: "OpenJDK11U-jdk_x64_linux_hotspot_11.0.29_7.tar.gz",
    sha256: "3c8f2b53dd137cd86e54f40df96fd0fc56df72c749c06469e7eab216503bc7cf",
  },
  linux_arm64: {
    filename: "OpenJDK11U-jdk_aarch64_linux_hotspot_11.0.29_7.tar.gz",
    sha256: "71e00cd0ab4371a4e9d67d1a2ca3e8ed2f126dff6a6ab152a6ecdec60100fbdd",
  },
  windows: {
    filename: "OpenJDK11U-jdk_x64_windows_hotspot_11.0.29_7.zip",
    sha256: "c21b63f6391b9d8f8aa969fb99250de797539cfb54232f5d4d371993f0c235b5",
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

const jdk17VersionName = "jdk-17.0.17+10"
const jdk17Version: JdkVersion = {
  lookupName: "openjdk-17",
  description: `The OpenJDK 17 library, ${jdk17VersionName}`,
  baseUrl: "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.17%2B10/",
  versionName: jdk17VersionName,
  mac_amd64: {
    filename: "OpenJDK17U-jdk_x64_mac_hotspot_17.0.17_10.tar.gz",
    sha256: "a2a7bfd3a767fcaf35a2e96cc562e6a63cd695e08c1a896222303c4e978da3d6",
  },
  mac_arm64: {
    filename: "OpenJDK17U-jdk_aarch64_mac_hotspot_17.0.17_10.tar.gz",
    sha256: "856059de21518c2ff6eba6126ffc93390affe363c3ee205b3146a3bac3be0aa5",
  },
  linux_amd64: {
    filename: "OpenJDK17U-jdk_x64_linux_hotspot_17.0.17_10.tar.gz",
    sha256: "992f96e7995075ac7636bb1a8de52b0c61d71ed3137fafc979ab96b4ab78dd75",
  },
  linux_arm64: {
    filename: "OpenJDK17U-jdk_aarch64_linux_hotspot_17.0.17_10.tar.gz",
    sha256: "dc29ca6d35beb4419b4b00419b8a3dfbf5ae551e1ae2b046b516d9a579d04533",
  },
  windows: {
    filename: "OpenJDK17U-jdk_x64_windows_hotspot_17.0.17_10.zip",
    sha256: "dcf0064efec7e515a5e3b56e7532f1a1c125510303c6c9e60af8878e3f7347fe",
  },
}

const jdk21VersionName = "jdk-21.0.9+10"
const jdk21Version: JdkVersion = {
  lookupName: "openjdk-21",
  description: `The OpenJDK 21 library, ${jdk21VersionName}`,
  baseUrl: "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.9%2B10/",
  versionName: jdk21VersionName,
  mac_amd64: {
    filename: "OpenJDK21U-jdk_x64_mac_hotspot_21.0.9_10.tar.gz",
    sha256: "f803a3f5bce141f23ac699dfcda06a721f4b74f53bacb0f4bbe9bfcad54427d8",
  },
  mac_arm64: {
    filename: "OpenJDK21U-jdk_aarch64_mac_hotspot_21.0.9_10.tar.gz",
    sha256: "55a40abeb0e174fdc70f769b34b50b70c3967e0b12a643e6a3e23f9a582aac16",
  },
  linux_amd64: {
    filename: "OpenJDK21U-jdk_x64_linux_hotspot_21.0.9_10.tar.gz",
    sha256: "810d3773df7e0d6c4394e4e244b264c8b30e0b05a0acf542d065fd78a6b65c2f",
  },
  linux_arm64: {
    filename: "OpenJDK21U-jdk_aarch64_linux_hotspot_21.0.9_10.tar.gz",
    sha256: "edf0da4debe7cf475dbe320d174d6eed81479eb363f41e38a2efb740428c603a",
  },
  windows: {
    filename: "OpenJDK21U-jdk_x64_windows_hotspot_21.0.9_10.zip",
    sha256: "1c67df516e9795c0b09f5714bfe151da2e3cc988082042f5bbb60d75e4e63fb5",
  },
}

function getUrl(jdkVersion: JdkVersion, jdkBinary: JdkBinary): string {
  return (jdkBinary.baseUrlOverride ?? jdkVersion.baseUrl) + jdkBinary.filename
}

function openJdkSpec(jdkVersion: JdkVersion): PluginToolSpec {
  const macBuilds: ToolBuildSpec[] = [
    {
      platform: "darwin",
      architecture: "amd64",
      url: getUrl(jdkVersion, jdkVersion.mac_amd64),
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
      url: getUrl(jdkVersion, jdkVersion.mac_arm64),
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
        url: getUrl(jdkVersion, jdkVersion.linux_amd64),
        sha256: jdkVersion.linux_amd64.sha256,
        extract: {
          format: "tar",
          targetPath: jdkVersion.versionName,
        },
      },
      {
        platform: "linux",
        architecture: "arm64",
        url: getUrl(jdkVersion, jdkVersion.linux_arm64),
        sha256: jdkVersion.linux_arm64.sha256,
        extract: {
          format: "tar",
          targetPath: jdkVersion.versionName,
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: getUrl(jdkVersion, jdkVersion.windows),
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

const jdk23VersionName = "jdk-23.0.2+7"
const jdk23Version: JdkVersion = {
  lookupName: "openjdk-23",
  description: `The OpenJDK 23 library, ${jdk23VersionName}`,
  baseUrl: "https://github.com/adoptium/temurin23-binaries/releases/download/jdk-23.0.2%2B7/",
  versionName: jdk23VersionName,
  mac_amd64: {
    filename: "OpenJDK23U-jdk_x64_mac_hotspot_23.0.2_7.tar.gz",
    sha256: "97fca2e90668351f248f149d4e96e16875094eba6716a8dd1dcf163be9e19085",
  },
  mac_arm64: {
    filename: "OpenJDK23U-jdk_aarch64_mac_hotspot_23.0.2_7.tar.gz",
    sha256: "749993e751f085c7ae713140066a90800075e4aeedfac50a5ed0c5457131c5a0",
  },
  linux_amd64: {
    filename: "OpenJDK23U-jdk_x64_linux_hotspot_23.0.2_7.tar.gz",
    sha256: "870ac8c05c6fe563e7a3878a47d0234b83c050e83651d2c47e8b822ec74512dd",
  },
  linux_arm64: {
    filename: "OpenJDK23U-jdk_aarch64_linux_hotspot_23.0.2_7.tar.gz",
    sha256: "fb43ae1202402842559cb6223886ec1663b90ffbec48479abbcb92c92c9012eb",
  },
  windows: {
    filename: "OpenJDK23U-jdk_x64_windows_hotspot_23.0.2_7.zip",
    sha256: "2171b4660d3e1056fb4a5f4b7e515fff986b8e7e0cf06c9f3e1f79d435ec7d18",
  },
}

export const openJdkSpecs: PluginToolSpec[] = [
  openJdkSpec(jdk8Version),
  openJdkSpec(jdk11Version),
  openJdkSpec(jdk13Version),
  openJdkSpec(jdk17Version),
  openJdkSpec(jdk21Version),
  openJdkSpec(jdk23Version),
]
