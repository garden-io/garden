/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../util/string.js"
import type { GetDashboardPageParams } from "../../plugin/handlers/Provider/getDashboardPage.js"
import type { ExecaChildProcess } from "execa"
import { execa } from "execa"
import getPort from "get-port"
import { getK8sProvider } from "../kubernetes/util.js"
import { createGardenPlugin } from "../../plugin/plugin.js"
import { reportDeprecatedFeatureUsage } from "../../util/deprecations.js"

let octantProc: ExecaChildProcess
let octantPort: number

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "octant",
    dependencies: [{ name: "kubernetes" }],
    docs: dedent`
    **DEPRECATED:** This plugin will be removed in a future version.

    Adds [Octant](https://github.com/vmware-tanzu/octant) to the Garden dashboard, as well as a \`garden tools octant\` command.
  `,
    dashboardPages: [
      {
        name: "octant",
        title: "Octant",
        description: "The Octant admin UI for Kubernetes",
        newWindow: false,
      },
    ],
    handlers: {
      async getDashboardPage({ ctx, log }: GetDashboardPageParams) {
        reportDeprecatedFeatureUsage({
          log,
          deprecation: "octantPlugin",
        })

        if (!octantProc) {
          const tool = ctx.tools["octant.octant"]
          const k8sProvider = getK8sProvider(ctx.provider.dependencies)
          const path = await tool.ensurePath(log)

          octantPort = await getPort()
          const host = "127.0.0.1:" + octantPort

          const args = ["--disable-open-browser", "--listener-addr", host]

          if (k8sProvider.config.kubeconfig) {
            args.push("--kubeconfig", k8sProvider.config.kubeconfig)
          }
          if (k8sProvider.config.context) {
            args.push("--context", k8sProvider.config.context)
          }
          if (k8sProvider.config.namespace?.name) {
            args.push("--namespace", k8sProvider.config.namespace.name)
          }

          octantProc = execa(path, args, { buffer: false, cleanup: true })

          return new Promise((resolve, reject) => {
            let resolved = false

            // Wait for dashboard to be available
            octantProc.stderr?.on("data", (data) => {
              if (data.toString().includes("Dashboard is available")) {
                resolved = true
                resolve({ url: "http://" + host })
              }
            })

            void octantProc.on("error", (err) => {
              !resolved && reject(err)
            })

            void octantProc.on("close", (err) => {
              // TODO: restart process
              !resolved && reject(err)
            })
          })
        } else {
          return { url: "http://127.0.0.1:" + octantPort }
        }
      },
    },
    tools: [
      {
        name: "octant",
        version: "0.25.1",
        description: "[DEPRECATED] A web admin UI for Kubernetes, v0.25.1",
        type: "binary",
        _includeInGardenImage: false,
        builds: [
          {
            platform: "darwin",
            architecture: "arm64",
            url: "https://github.com/vmware-tanzu/octant/releases/download/v0.25.1/octant_0.25.1_macOS-arm64.tar.gz",
            sha256: "9528d1a3e00f1bf0180457a347aac6963dfdc3faa3a85970b93932a352fb38cf",
            extract: {
              format: "tar",
              targetPath: "octant_0.25.1_macOS-arm64/octant",
            },
          },
          {
            platform: "darwin",
            architecture: "amd64",
            url: "https://github.com/vmware-tanzu/octant/releases/download/v0.25.1/octant_0.25.1_macOS-64bit.tar.gz",
            sha256: "97b1510362d99c24eeef98b61ca327e6e5323c99a1c774bc8e60751d3c923b33",
            extract: {
              format: "tar",
              targetPath: "octant_0.25.1_macOS-64bit/octant",
            },
          },
          {
            platform: "linux",
            architecture: "arm64",
            url: "https://github.com/vmware-tanzu/octant/releases/download/v0.25.1/octant_0.25.1_Linux-arm64.tar.gz",
            sha256: "a3eb4973a0c869267e3916bd43e0b41b2bbc73b898376b795a617299c7b2a623",
            extract: {
              format: "tar",
              targetPath: "octant_0.25.1_Linux-arm64/octant",
            },
          },
          {
            platform: "linux",
            architecture: "amd64",
            url: "https://github.com/vmware-tanzu/octant/releases/download/v0.25.1/octant_0.25.1_Linux-64bit.tar.gz",
            sha256: "b12bb6752e43f4e0fe54278df8e98dee3439c4066f66cdb7a0ca4a1c7d8eaa1e",
            extract: {
              format: "tar",
              targetPath: "octant_0.25.1_Linux-64bit/octant",
            },
          },
          {
            platform: "windows",
            architecture: "amd64",
            url: "https://github.com/vmware-tanzu/octant/releases/download/v0.25.1/octant_0.25.1_Windows-64bit.zip",
            sha256: "b1e8f372f64c79ff04d69d19f11773936b67447a3abd5a496fbdfef10b6b6d19",
            extract: {
              format: "tar",
              targetPath: "octant_0.25.1_Windows-64bit/octant.exe",
            },
          },
        ],
      },
    ],
  })
