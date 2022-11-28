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
  "3.40.0": {
    name: "pulumi-3-40-0",
    description: "The pulumi CLI, v3.40.0",
    type: "binary",
    _includeInGardenImage: true,
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.40.0/pulumi-v3.40.0-darwin-x64.tar.gz",
        sha256: "3d48d917b64fb3a1380d47a5733726edb99c3a0f5565fe04cfa26ccb67cb415a",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "darwin",
        architecture: "arm64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.40.0/pulumi-v3.40.0-darwin-arm64.tar.gz",
        sha256: "f093cc460aa4a4773e6910db2b9a3ba71f6443b99194d8ad2752be66c4822861",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.40.0/pulumi-v3.40.0-linux-x64.tar.gz",
        sha256: "7abc0ccb17e6b0b1ed89be0897bd6a73cb3c6784d7fb5c2e20ad2a8d976c42fe",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.40.0/pulumi-v3.40.0-windows-x64.zip",
        sha256: "f0ca025d7a47175852ed5a6e7f7c4e97f1d1326c448bd172e81e7130bd447b74",
        extract: {
          format: "zip",
          targetPath: "pulumi/bin/pulumi.exe",
        },
      },
    ],
  },
  "3.39.4": {
    name: "pulumi-3-39-4",
    description: "The pulumi CLI, v3.39.4",
    type: "binary",
    _includeInGardenImage: false,
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.39.4/pulumi-v3.39.4-darwin-x64.tar.gz",
        sha256: "a563f7d7f3dbda84fae61316ef335e204606ac4e79f8e43ffb6103972b9c26ff",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "darwin",
        architecture: "arm64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.39.4/pulumi-v3.39.4-darwin-arm64.tar.gz",
        sha256: "20493f365df1d73417c8159b0259624f06afe7fa5bcb15305e47edbfb7c20eca",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.39.4/pulumi-v3.39.4-linux-x64.tar.gz",
        sha256: "dd3ad77debfb664bc9a79cc88789a091f1f4f420780a2feb622d31cda028ade9",
        extract: {
          format: "tar",
          targetPath: "pulumi/pulumi",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.39.4/pulumi-v3.39.4-windows-x64.zip",
        sha256: "fdea4e4caca4be39801f7e63bb36c9826a9965a36cac37cfa1244f5110d66864",
        extract: {
          format: "zip",
          targetPath: "pulumi/bin/pulumi.exe",
        },
      },
    ],
  },
  "3.25.1": {
    name: "pulumi-3-25-1",
    description: "The pulumi CLI, v3.24.1",
    type: "binary",
    _includeInGardenImage: false,
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
        platform: "darwin",
        architecture: "arm64",
        url: "https://github.com/pulumi/pulumi/releases/download/v3.25.1/pulumi-v3.25.1-darwin-arm64.tar.gz",
        sha256: "a5ab29db86733b5f730a0f352b407aed64b82337a222a0c7cd1492b55189e6c1",
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
export const defaultPulumiVersion = "3.40.0"
// export const defaultPulumiVersion = "3.25.1"
