/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginToolSpec } from "../../types/plugin/tools"

const spec = {
  url: "http://mirror.23media.de/apache/maven/maven-3/3.6.0/binaries/apache-maven-3.6.0-bin.tar.gz",
  sha256: "6a1b346af36a1f1a491c1c1a141667c5de69b42e6611d3687df26868bc0f4637",
  extract: {
    format: "tar",
    targetPath: "apache-maven-3.6.0/bin/mvn",
  },
}

export const mavenSpec: PluginToolSpec = {
  name: "maven",
  description: "The Maven CLI.",
  type: "binary",
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      ...spec,
    },
    {
      platform: "linux",
      architecture: "amd64",
      ...spec,
    },
    {
      platform: "windows",
      architecture: "amd64",
      ...spec,
    },
  ],
}
