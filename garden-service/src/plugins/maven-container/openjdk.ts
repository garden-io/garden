/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Library } from "../../util/ext-tools"

const jdk8Version = "jdk8u202-b08"
const jdk11Version = "jdk-11.0.2+9"
const jdk13Version = "jdk-13+33"

const jdk8Base = `https://github.com/AdoptOpenJDK/openjdk8-binaries/releases/download/${jdk8Version}/`
const jdk11Base = "https://github.com/AdoptOpenJDK/openjdk11-binaries/releases/download/jdk-11.0.2%2B9/"
const jdk13Base = "https://github.com/AdoptOpenJDK/openjdk13-binaries/releases/download/jdk-13%2B33/"

export const openJdks: { [version: number]: Library } = {
  8: new Library({
    name: "openjdk-8",
    specs: {
      darwin: {
        url: jdk8Base + "OpenJDK8U-jdk_x64_mac_hotspot_8u202b08.tar.gz",
        sha256: "059f7c18faa6722aa636bbd79bcdff3aee6a6da5b34940b072ea6e3af85bbe1d",
        extract: {
          format: "tar",
          targetPath: [jdk8Version, "Contents", "Home"],
        },
      },
      linux: {
        url: jdk8Base + "OpenJDK8U-jdk_x64_linux_hotspot_8u202b08.tar.gz",
        sha256: "f5a1c9836beb3ca933ec3b1d39568ecbb68bd7e7ca6a9989a21ff16a74d910ab",
        extract: {
          format: "tar",
          targetPath: [jdk8Version],
        },
      },
      win32: {
        url: jdk8Base + "OpenJDK8U-jdk_x64_windows_hotspot_8u202b08.zip",
        sha256: "2637dab3bc81274e19991eebc27684276b482dd71d0f84fedf703d4fba3576e5",
        extract: {
          format: "zip",
          targetPath: [jdk8Version],
        },
      },
    },
  }),
  11: new Library({
    name: "openjdk-11",
    specs: {
      darwin: {
        url: jdk11Base + "OpenJDK11U-jdk_x64_mac_hotspot_11.0.2_9.tar.gz",
        sha256: "fffd4ed283e5cd443760a8ec8af215c8ca4d33ec5050c24c1277ba64b5b5e81a",
        extract: {
          format: "tar",
          targetPath: [jdk11Version, "Contents", "Home"],
        },
      },
      linux: {
        url: jdk11Base + "OpenJDK11U-jdk_x64_linux_hotspot_11.0.2_9.tar.gz",
        sha256: "d02089d834f7702ac1a9776d8d0d13ee174d0656cf036c6b68b9ffb71a6f610e",
        extract: {
          format: "tar",
          targetPath: [jdk11Version],
        },
      },
      win32: {
        url: jdk11Base + "OpenJDK11U-jdk_x64_windows_hotspot_11.0.2_9.zip",
        sha256: "bde1648333abaf49c7175c9ee8ba9115a55fc160838ff5091f07d10c4bb50b3a",
        extract: {
          format: "zip",
          targetPath: [jdk11Version],
        },
      },
    },
  }),
  13: new Library({
    name: "openjdk-13",
    specs: {
      darwin: {
        url: jdk13Base + "OpenJDK13U-jdk_x64_mac_hotspot_13_33.tar.gz",
        sha256: "f948be96daba250b6695e22cb51372d2ba3060e4d778dd09c89548889783099f",
        extract: {
          format: "tar",
          targetPath: [jdk13Version, "Contents", "Home"],
        },
      },
      linux: {
        url: jdk13Base + "OpenJDK13U-jdk_x64_linux_hotspot_13_33.tar.gz",
        sha256: "e562caeffa89c834a69a44242d802eae3523875e427f07c05b1902c152638368",
        extract: {
          format: "tar",
          targetPath: [jdk13Version],
        },
      },
      win32: {
        url: jdk13Base + "OpenJDK13U-jdk_x64_windows_hotspot_13_33.zip",
        sha256: "65d71a954167d538c7a260e64d9868ceffe60edd1108817a9c44fddf60d13569",
        extract: {
          format: "zip",
          targetPath: [jdk13Version],
        },
      },
    },
  }),
}
