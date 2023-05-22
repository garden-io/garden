/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import which from "which"

import { CliWrapper } from "@garden-io/sdk/util/ext-tools"
import { ConfigurationError, RuntimeError } from "@garden-io/sdk/exceptions"
import { Log, PluginContext, PluginToolSpec } from "@garden-io/sdk/types"
import { PulumiProvider } from "./config"

/**
 * We're using functionality in the pulumi CLI that's experimental as of February 2022, which is enabled by
 * setting the `PULUMI_EXPERIMENTAL` env var to `true` when calling the command.
 */
export const defaultPulumiEnv = {
  PULUMI_EXPERIMENTAL: "true",
  // This suppresses the "warning: A new version of Pulumi is available" output when running pulumi commands.
  PULUMI_SKIP_UPDATE_CHECK: "true",
  // TODO: Make user explicitly pick which (or all) env vars to merge in here?
  ...process.env,
}

export function pulumi(ctx: PluginContext, provider: PulumiProvider) {
  const version = provider.config.version

  if (version === null) {
    return new GlobalPulumi()
  } else {
    const cli = ctx.tools["pulumi.pulumi-" + version.replace(/\./g, "-")]

    if (!cli) {
      throw new ConfigurationError(`Unsupported pulumi version: ${version}`, {
        version,
        supportedVersions,
      })
    }

    return cli
  }
}

export class GlobalPulumi extends CliWrapper {
  constructor() {
    super("pulumi", "pulumi/pulumi")
  }

  async getPath(_: Log) {
    try {
      return await which("pulumi")
    } catch (err) {
      throw new RuntimeError(`Pulumi version is set to null, and pulumi CLI could not be found on PATH`, {})
    }
  }
}

export const pulumiCliSPecs: { [version: string]: PluginToolSpec } = {
  "3.64.0": {
    name: "pulumi-3-64-0",
    description: "The pulumi CLI, v3.64.0",
    type: "binary",
    _includeInGardenImage: true,
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.64.0/pulumi-v3.64.0-darwin-x64.tar.gz",
        sha256: "ee62df4a40ab7cb016491f529e0256761a8ced6962dea28f88409d692cafcc82",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "darwin",
        architecture: "arm64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.64.0/pulumi-v3.64.0-darwin-arm64.tar.gz",
        sha256: "a531dc361dd016a72c22476d2981f71cc9892d210d11c19b4e1fcc8d6c629d1a",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.64.0/pulumi-v3.64.0-linux-x64.tar.gz",
        sha256: "2560cce127c838c8367541e9493ec12ae9a3144884f98c2afb99b01a14b6b0f7",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.64.0/pulumi-v3.64.0-windows-x64.zip",
        sha256: "b0424ad34a2abbd196f78b62cac9a72bafe080c84c6068bede3a4e31e48a0a48",
        extract: {
          format: "zip",
          targetPath: "pulumi/bin/pulumi.exe",
        },
      },
    ],
  },
  "3.48.0": {
    name: "pulumi-3-48-0",
    description: "The pulumi CLI, v3.48.0",
    type: "binary",
    _includeInGardenImage: false,
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.48.0/pulumi-v3.48.0-darwin-x64.tar.gz",
        sha256: "77c9580af73f8f0e0e4e04e3c791acb43cca8c0eab28ddb54c6d865beab20eff",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "darwin",
        architecture: "arm64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.48.0/pulumi-v3.48.0-darwin-arm64.tar.gz",
        sha256: "4963b9a2dbe09eaba2e30f7823dfacbe878023767550ea312668f579a61473fd",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.48.0/pulumi-v3.48.0-linux-x64.tar.gz",
        sha256: "4ef798dff47dce7a45d7799e389cafc199b8eaf7d817b65e49e96aa058e20206",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.48.0/pulumi-v3.48.0-windows-x64.zip",
        sha256: "d68ff65973094a160f58143dfc2bb682f9a50c73a9cc840397816708fcf51419",
        extract: {
          format: "zip",
          targetPath: "pulumi/bin/pulumi.exe",
        },
      },
    ],
  },
}

export const supportedVersions = Object.keys(pulumiCliSPecs)

// Default to latest pulumi version
export const defaultPulumiVersion = "3.64.0"
