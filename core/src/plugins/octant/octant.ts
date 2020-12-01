/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../util/string"
import { GetDashboardPageParams } from "../../types/plugin/provider/getDashboardPage"
import execa, { ExecaChildProcess } from "execa"
import getPort from "get-port"
import { getK8sProvider } from "../kubernetes/util"
import { createGardenPlugin } from "../../types/plugin/plugin"

let octantProc: ExecaChildProcess
let octantPort: number

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "octant",
    dependencies: ["kubernetes"],
    docs: dedent`
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
        if (!octantProc) {
          const tool = ctx.tools["octant.octant"]
          const k8sProvider = getK8sProvider(ctx.provider.dependencies)
          const path = await tool.getPath(log)

          octantPort = await getPort()
          const host = "127.0.0.1:" + octantPort

          const args = ["--disable-open-browser", "--listener-addr", host]

          if (k8sProvider.config.kubeconfig) {
            args.push("--kubeconfig", k8sProvider.config.kubeconfig)
          }
          if (k8sProvider.config.context) {
            args.push("--context", k8sProvider.config.context)
          }
          if (k8sProvider.config.namespace) {
            args.push("--namespace", k8sProvider.config.namespace)
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

            octantProc.on("error", (err) => {
              !resolved && reject(err)
            })

            octantProc.on("close", (err) => {
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
        description: "A web admin UI for Kubernetes.",
        type: "binary",
        _includeInGardenImage: false,
        builds: [
          {
            platform: "darwin",
            architecture: "amd64",
            url: "https://github.com/vmware-tanzu/octant/releases/download/v0.15.0/octant_0.15.0_macOS-64bit.tar.gz",
            sha256: "63d03320e058eab4ef7ace6eb17c00e56f8fab85a202843295922535d28693a8",
            extract: {
              format: "tar",
              targetPath: "octant_0.15.0_macOS-64bit/octant",
            },
          },
          {
            platform: "linux",
            architecture: "amd64",
            url: "https://github.com/vmware-tanzu/octant/releases/download/v0.15.0/octant_0.15.0_Linux-64bit.tar.gz",
            sha256: "475c420c42f4d5f44650b1fb383f7e830e3939cbcc28e84ef49a6269dc3f658e",
            extract: {
              format: "tar",
              targetPath: "octant_0.15.0_Linux-64bit/octant",
            },
          },
          {
            platform: "windows",
            architecture: "amd64",
            url: "https://github.com/vmware-tanzu/octant/releases/download/v0.15.0/octant_0.15.0_Windows-64bit.zip",
            sha256: "963f50c196a56390127b01eabb49abaf0604f49a8c879ce4f28562d8d825b84d",
            extract: {
              format: "tar",
              targetPath: "octant_0.15.0_Windows-64bit/octant.exe",
            },
          },
        ],
      },
    ],
  })
