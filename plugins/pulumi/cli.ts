/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import which from "which"

import { CliWrapper } from "@garden-io/sdk/util/ext-tools"
import { ConfigurationError, RuntimeError } from "@garden-io/sdk/exceptions"
import { LogEntry, PluginContext, PluginToolSpec } from "@garden-io/sdk/types"
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

  async getPath(_: LogEntry) {
    try {
      return await which("pulumi")
    } catch (err) {
      throw new RuntimeError(`Pulumi version is set to null, and pulumi CLI could not be found on PATH`, {})
    }
  }
}

export const pulumiCliSPecs: { [version: string]: PluginToolSpec } = {
  "3.25.1": {
    name: "pulumi-3-25-1",
    description: "The pulumi CLI, v3.24.1",
    type: "binary",
    _includeInGardenImage: true,
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.25.1/pulumi-v3.25.1-darwin-x64.tar.gz",
        sha256: "c91ef64aedcd10a925858a21fc4b52f9a566b4f14bc0d175c0c51c7745cdd175",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.25.1/pulumi-v3.25.1-linux-x64.tar.gz",
        sha256: "71e94634492b54e09810649f3753a5b414f4a1895b012ee445c275f1a0f94c5c",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.25.1/pulumi-v3.25.1-windows-x64.zip",
        sha256: "60d891f65e69e0eb14acb26e0a8a102d54ebc432060631f867c44b84cde09bdb",
        extract: {
          format: "zip",
          targetPath: "pulumi/bin/pulumi.exe",
        },
      },
    ],
  },
  "3.24.1": {
    name: "pulumi-3-24-1",
    description: "The pulumi CLI, v3.24.1",
    type: "binary",
    _includeInGardenImage: true,
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.24.1/pulumi-v3.24.1-darwin-x64.tar.gz",
        sha256: "1bfafd10f189c4e57b9961ddf899055efb55649e7403fc1bdd33c89e5a9cce1c",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.24.1/pulumi-v3.24.1-linux-x64.tar.gz",
        sha256: "9341c23c1b0266a39ebc6dab2f36b20041226143481714cb0ba8bfbf3ef7ae7e",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.24.1/pulumi-v3.24.1-windows-x64.zip",
        sha256: "7ccaace585dfd9b44659c876ac87c33ea892cd91c34cb7ad00081cec8032a329",
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
export const defaultPulumiVersion = "3.25.1"
