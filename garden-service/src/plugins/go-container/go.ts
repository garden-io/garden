/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BinaryCmd, LibraryPlatformSpec } from "../../util/ext-tools"

const macos: LibraryPlatformSpec = {
  url: "https://dl.google.com/go/go1.13.1.darwin-amd64.tar.gz",
  sha256: "f3985fced3adecb62dd1e636cfa5eb9fea8f3e98101d9fcc4964d8f1ec255b7f",
  extract: {
    format: "tar",
    targetPath: ["go", "bin", "go"],
  },
}

const penguin: LibraryPlatformSpec = {
  url: "https://dl.google.com/go/go1.13.1.linux-amd64.tar.gz",
  sha256: "94f874037b82ea5353f4061e543681a0e79657f787437974214629af8407d124",
  extract: {
    format: "tar",
    targetPath: ["go", "bin", "go"],
  },
}

const windows: LibraryPlatformSpec = {
  url: "https://dl.google.com/go/go1.13.1.windows-386.zip",
  sha256: "bc0010efa39d5d46e2d7c7bbb702ca37796d95b395003e22080414076556c590",
  extract: {
    format: "zip",
    targetPath: ["go", "bin", "go"],
  },
}

export const go = new BinaryCmd({
  name: "go",
  specs: {
    darwin: macos,
    linux: penguin,
    win32: windows,
  },
})
