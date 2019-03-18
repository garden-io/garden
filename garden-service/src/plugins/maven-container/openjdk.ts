/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Library, LibraryPlatformSpec } from "../../util/ext-tools"

const jdk8Version = "jdk8u202-b08"
const jdk11Version = "jdk-11.0.2+9"

function jdk8Spec(filename: string, sha256: string, targetPath: string[]): LibraryPlatformSpec {
  return {
    url: `https://github.com/AdoptOpenJDK/openjdk8-binaries/releases/download/${jdk8Version}/${filename}`,
    sha256,
    extract: {
      format: "tar",
      targetPath,
    },
  }
}

function jdk11Spec(filename: string, sha256: string, targetPath: string[]): LibraryPlatformSpec {
  return {
    url: `https://github.com/AdoptOpenJDK/openjdk11-binaries/releases/download/jdk-11.0.2%2B9/${filename}`,
    sha256,
    extract: {
      format: "tar",
      targetPath,
    },
  }
}

export const openJdks: { [version: number]: Library } = {
  8: new Library({
    name: "openjdk-8",
    specs: {
      darwin: jdk8Spec(
        "OpenJDK8U-jdk_x64_mac_hotspot_8u202b08.tar.gz",
        "059f7c18faa6722aa636bbd79bcdff3aee6a6da5b34940b072ea6e3af85bbe1d",
        [jdk8Version, "Contents", "Home"],
      ),
      linux: jdk8Spec(
        "OpenJDK8U-jdk_x64_linux_hotspot_8u202b08.tar.gz",
        "f5a1c9836beb3ca933ec3b1d39568ecbb68bd7e7ca6a9989a21ff16a74d910ab",
        [jdk8Version],
      ),
      win32: jdk8Spec(
        "OpenJDK8U-jdk_x64_windows_hotspot_8u202b08.zip",
        "2637dab3bc81274e19991eebc27684276b482dd71d0f84fedf703d4fba3576e5",
        [jdk8Version],
      ),
    },
  }),
  11: new Library({
    name: "openjdk-11",
    specs: {
      darwin: jdk11Spec(
        "OpenJDK11U-jdk_x64_mac_hotspot_11.0.2_9.tar.gz",
        "fffd4ed283e5cd443760a8ec8af215c8ca4d33ec5050c24c1277ba64b5b5e81a",
        [jdk11Version, "Contents", "Home"],
      ),
      linux: jdk11Spec(
        "OpenJDK11U-jdk_x64_linux_hotspot_11.0.2_9.tar.gz",
        "d02089d834f7702ac1a9776d8d0d13ee174d0656cf036c6b68b9ffb71a6f610e",
        [jdk11Version],
      ),
      win32: jdk11Spec(
        "OpenJDK11U-jdk_x64_windows_hotspot_11.0.2_9.zip",
        "bde1648333abaf49c7175c9ee8ba9115a55fc160838ff5091f07d10c4bb50b3a",
        [jdk11Version],
      ),
    },
  }),
}
