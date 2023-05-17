/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext, PluginToolSpec } from "@garden-io/sdk/types"

export const dockerComposeSpec: PluginToolSpec = {
  name: "docker-compose",
  description: "The Docker Compose CLI.",
  type: "binary",
  version: "2.18.0",
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: "https://github.com/docker/compose/releases/download/v2.18.0/docker-compose-darwin-x86_64",
      sha256: "42036608e33e8e905f0683693109d0a8f126a66d2e534611b15919e0ea32b35c",
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: "https://github.com/docker/compose/releases/download/v2.18.0/docker-compose-darwin-aarch64",
      sha256: "6b22a7f04ebc4693a60e3e6ae248c2cee715b69cef740d1ad39e520fbc632922",
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: "https://github.com/docker/compose/releases/download/v2.18.0/docker-compose-linux-x86_64",
      sha256: "02b69f1f23167fce126b16d9d6b645362f5a6fa7fc9a073d3d080e45e12d32fc",
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: "https://github.com/docker/compose/releases/download/v2.18.0/docker-compose-windows-x86_64.exe",
      sha256: "a98df8912c7a5cc7be00c1819a920e0ecdd5e2a7402bb390606c7f3f3b28b24e",
    },
  ],
}

export function compose(ctx: PluginContext) {
  return ctx.tools["docker-compose.docker-compose"]
}
