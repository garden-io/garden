/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { sdk } from "@garden-io/sdk"

export const dockerComposeSpec: sdk.types.PluginToolSpec = {
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

// TODO: Deduplicate. This was copied from core/src/plugins/container/container.ts.
export const dockerSpec: sdk.types.PluginToolSpec = {
  name: "docker",
  version: "20.10.9",
  description: "The official Docker CLI.",
  type: "binary",
  _includeInGardenImage: true,
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: "https://download.docker.com/mac/static/stable/x86_64/docker-20.10.9.tgz",
      sha256: "f045f816579a96a45deef25aaf3fc116257b4fb5782b51265ad863dcae21f879",
      extract: {
        format: "tar",
        targetPath: "docker/docker",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: "https://download.docker.com/mac/static/stable/aarch64/docker-20.10.9.tgz",
      sha256: "e41cc3b53b9907ee038c7a1ab82c5961815241180fefb49359d820d629658e6b",
      extract: {
        format: "tar",
        targetPath: "docker/docker",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: "https://download.docker.com/linux/static/stable/x86_64/docker-20.10.9.tgz",
      sha256: "caf74e54b58c0b38bb4d96c8f87665f29b684371c9a325562a3904b8c389995e",
      extract: {
        format: "tar",
        targetPath: "docker/docker",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: "https://github.com/rgl/docker-ce-windows-binaries-vagrant/releases/download/v20.10.9/docker-20.10.9.zip",
      sha256: "360ca42101d453022eea17747ae0328709c7512e71553b497b88b7242b9b0ee4",
      extract: {
        format: "zip",
        targetPath: "docker/docker.exe",
      },
    },
  ],
}

export function compose(ctx: sdk.types.PluginContext) {
  return ctx.tools["docker-compose.docker-compose"]
}

export function docker(ctx: sdk.types.PluginContext) {
  return ctx.tools["docker-compose.docker"]
}
