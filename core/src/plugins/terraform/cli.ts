/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ConfigurationError, RuntimeError } from "../../exceptions"
import { PluginToolSpec } from "../../types/plugin/tools"
import { TerraformProvider } from "./terraform"
import { PluginContext } from "../../plugin-context"
import which from "which"
import { CliWrapper } from "../../util/ext-tools"
import { LogEntry } from "../../logger/log-entry"

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
  "0.12.26": {
    name: "terraform-0-12-26",
    description: "The terraform CLI, v0.12.26",
    type: "binary",
    _includeInGardenImage: true,
    builds: [
      {
        platform: "darwin",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.12.26/terraform_0.12.26_darwin_amd64.zip",
        sha256: "79fb293324012bc981006e1527267987666dd80cff80b11f93fb0ab2e321c450",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.12.26/terraform_0.12.26_linux_amd64.zip",
        sha256: "607bc802b1c6c2a5e62cc48640f38aaa64bef1501b46f0ae4829feb51594b257",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "linux",
        architecture: "arm64",
        url: "https://releases.hashicorp.com/terraform/0.12.26/terraform_0.12.26_linux_arm.zip",
        sha256: "8036807501c16a5b643fa68cbee78ca6b2fa3ede43b56af7e9ff95bcf1302130",
        extract: {
          format: "zip",
          targetPath: "terraform",
        },
      },
      {
        platform: "windows",
        architecture: "amd64",
        url: "https://releases.hashicorp.com/terraform/0.12.26/terraform_0.12.26_windows_amd64.zip",
        sha256: "f232bf25dc32e618fbb692b98857d10a84e16e531e9ce5e87e060c1369bde092",
        extract: {
          format: "zip",
          targetPath: "terraform.exe",
        },
      },
    ],
  },
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
        platform: "linux",
        architecture: "arm64",
        url: "https://releases.hashicorp.com/terraform/0.13.3/terraform_0.13.3_linux_arm.zip",
        sha256: "c5274bcc6cc597467d9c90ee6f22281496d91da0bc1f899dd185f9c7bedaf207",
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
        sha256: "8a5ec04afcc9c2653bb927844eb76ad51e12bcaec0638103512d7b160dd530ea",
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
        platform: "linux",
        architecture: "arm64",
        url: "https://releases.hashicorp.com/terraform/0.14.7/terraform_0.14.7_linux_arm64.zip",
        sha256: "0a621f1dc411953b955aaf2d7d46b2f350bd3a85a2284ec994ae41419844120b",
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
}

export const supportedVersions = Object.keys(terraformCliSpecs)

// Default to latest Terraform version
export const defaultTerraformVersion = "0.13.3"
