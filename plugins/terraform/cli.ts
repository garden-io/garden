/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { TerraformProvider } from "."
import which from "which"
import { ConfigurationError, RuntimeError } from "@garden-io/sdk/exceptions"
import { CliWrapper, PluginToolSpec } from "@garden-io/sdk/util/ext-tools"
import { Log, PluginContext } from "@garden-io/sdk/types"

export function terraform(ctx: PluginContext, provider: TerraformProvider) {
  const version = provider.config.version

  if (version === null) {
    return new GlobalTerraform()
  } else {
    const cli = ctx.tools["terraform.terraform-" + version.replace(/\./g, "-")]

    if (!cli) {
      throw new ConfigurationError(`Unsupported Terraform version: ${version}`, {
        version,
        supportedVersions,
      })
    }

    return cli
  }
}

export class GlobalTerraform extends CliWrapper {
  constructor() {
    super("terraform", "terraform")
  }

  async getPath(_: Log) {
    try {
      return await which("terraform")
    } catch (err) {
      throw new RuntimeError(`Terraform version is set to null, and terraform CLI could not be found on PATH`, {})
    }
  }
}

export const terraformCliSpecs: { [version: string]: PluginToolSpec } = {
  "1.2.9": {
    name: "terraform-1-2-9",
    description: "The terraform CLI, v1.2.9",
    type: "binary",
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/1.2.9/terraform_1.2.9_darwin_amd64.zip",
        sha256: "84a678ece9929cebc34c7a9a1ba287c8b91820b336f4af8437af7feaa0117b7c",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "darwin",
        architecture: "arm64",
        url: "https://releases.hashicorp.com/terraform/1.2.9/terraform_1.2.9_darwin_arm64.zip",
        sha256: "bc3b94b53cdf1be3c4988faa61aad343f48e013928c64bfc6ebeb61657f97baa",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/1.2.9/terraform_1.2.9_linux_amd64.zip",
        sha256: "0e0fc38641addac17103122e1953a9afad764a90e74daf4ff8ceeba4e362f2fb",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/1.2.9/terraform_1.2.9_windows_amd64.zip",
        sha256: "1425bbe982251dde58104dab3d41f48a51d8735122bdb3790b3b3686c57ebfa2",
        extract: {
          format: "zip",
          targetPath: "terraform.exe",
        },
      },
    ],
  },
  "1.4.6": {
    name: "terraform-1-4-6",
    description: "The terraform CLI, v1.4.6",
    type: "binary",
    _includeInGardenImage: true,
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/1.4.6/terraform_1.4.6_darwin_amd64.zip",
        sha256: "5d8332994b86411b049391d31ad1a0785dfb470db8b9c50617de28ddb5d1f25d",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "darwin",
        architecture: "arm64",
        url: "https://releases.hashicorp.com/terraform/1.4.6/terraform_1.4.6_darwin_arm64.zip",
        sha256: "30a2f87298ff9f299452119bd14afaa8d5b000c572f62fa64baf432e35d9dec1",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/1.4.6/terraform_1.4.6_linux_amd64.zip",
        sha256: "e079db1a8945e39b1f8ba4e513946b3ab9f32bd5a2bdf19b9b186d22c5a3d53b",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/1.4.6/terraform_1.4.6_windows_amd64.zip",
        sha256: "f666aa1388f94c9b86ea01cb884ba53b9132d2cec3d9cac976ad93a2aba901d5",
        extract: {
          format: "zip",
          targetPath: "terraform.exe",
        },
      },
    ],
  },
}

export const supportedVersions = Object.keys(terraformCliSpecs)

// Default to latest Terraform version
export const defaultTerraformVersion = "1.4.6"
