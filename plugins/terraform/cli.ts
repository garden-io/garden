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
import { LogEntry, PluginContext } from "@garden-io/sdk/types"

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

  async getPath(_: LogEntry) {
    try {
      return await which("terraform")
    } catch (err) {
      throw new RuntimeError(`Terraform version is set to null, and terraform CLI could not be found on PATH`, {})
    }
  }
}

export const terraformCliSpecs: { [version: string]: PluginToolSpec } = {
  "0.13.3": {
    name: "terraform-0-13-3",
    description: "The terraform CLI, v0.13.3",
    type: "binary",
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.13.3/terraform_0.13.3_darwin_amd64.zip",
        sha256: "ccbfd3af8732a47b6bd32c419e1a52e41eb8a39ff7437afffbef438b5c0f92c3",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.13.3/terraform_0.13.3_linux_amd64.zip",
        sha256: "35c662be9d32d38815cde5fa4c9fa61a3b7f39952ecd50ebf92fd1b2ddd6109b",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.13.3/terraform_0.13.3_windows_amd64.zip",
        sha256: "e4aba639b2fb946c5c17b982c22c8ff3a7a3c07725978284ffc1cc651961da2c",
        extract: {
          format: "zip",
          targetPath: "terraform.exe",
        },
      },
    ],
  },
  "0.14.7": {
    name: "terraform-0-14-7",
    description: "The terraform CLI, v0.14.7",
    type: "binary",
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.14.7/terraform_0.14.7_darwin_amd64.zip",
        sha256: "bd4afbb92cfc99f3f7e81412536e1aa9bafd6544a87454286d9e9f6ab446179a",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.14.7/terraform_0.14.7_linux_amd64.zip",
        sha256: "6b66e1faf0ad4ece28c42a1877e95bbb1355396231d161d78b8ca8a99accc2d7",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.14.7/terraform_0.14.7_windows_amd64.zip",
        sha256: "1cc49c7522d3a6a583ad627aea2d2b4fb182312f4f97d70d445e2345e4a4f4d4",
        extract: {
          format: "zip",
          targetPath: "terraform.exe",
        },
      },
    ],
  },
  "1.0.5": {
    name: "terraform-1-0-5",
    description: "The terraform CLI, v1.0.5",
    type: "binary",
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/1.0.5/terraform_1.0.5_darwin_amd64.zip",
        sha256: "51b481f2cc02651c14854f57dc0c43c3918b19b6fc5e687295b98beee5d20271",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "darwin",
        architecture: "arm64",
        url: "https://releases.hashicorp.com/terraform/1.0.5/terraform_1.0.5_darwin_arm64.zip",
        sha256: "8fadd8bbcdcaf6452d9937af6b916572f481caabcc29ea9aac61c7f4759e133e",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/1.0.5/terraform_1.0.5_linux_amd64.zip",
        sha256: "7ce24478859ab7ca0ba4d8c9c12bb345f52e8efdc42fa3ef9dd30033dbf4b561",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/1.0.5/terraform_1.0.5_windows_amd64.zip",
        sha256: "37de2cd8153286e41b029a719f03b747058cda09576e3297d3d24e1d30e27a12",
        extract: {
          format: "zip",
          targetPath: "terraform.exe",
        },
      },
    ],
  },
  "1.2.9": {
    name: "terraform-1-2-9",
    description: "The terraform CLI, v1.2.9",
    type: "binary",
    _includeInGardenImage: true,
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
}

export const supportedVersions = Object.keys(terraformCliSpecs)

// Default to latest Terraform version
export const defaultTerraformVersion = "1.2.9"
