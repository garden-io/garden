/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join, resolve } from "path"
import { joi } from "../../config/common"
import { GenericProviderConfig, Provider } from "../../config/provider"
import { dedent } from "../../util/string"
import { STATIC_DIR } from "../../constants"
import { sdk } from "../../plugin/sdk"
import { registerCleanupFunction } from "../../util/util"
import { configureOTLPHttpExporter } from "../../util/tracing/tracing"

const defaultConfigPath = join(STATIC_DIR, "otel-collector", "otel-config.yaml")

interface OtelCollectorSpec {
  configPath: string
}

export interface OtelCollectorProviderConfig extends GenericProviderConfig {}

export type OtelCollectorProvider = Provider<OtelCollectorProviderConfig>

export const gardenPlugin = sdk.createGardenPlugin({
  name: "otel-collector",
  dependencies: [{ name: "exec" }],
  docs: dedent`
  Otel Collector
    `,

  createModuleTypes: [
    {
      name: "otel-collector",
      docs: dedent`
        Start the otel-collector
      `,
      needsBuild: false,
      schema: joi.object().keys({
        configFilePath: joi
          .posixPath()
          .relativeOnly()
          .subPathOnly()
          .required()
          .description("POSIX-style path to an otel collector config file."),
      }),
      handlers: {
        configure: async ({ moduleConfig }) => {
          moduleConfig.include = [moduleConfig.spec.configFilePath]
          return { moduleConfig }
        },

        convert: async (params) => {
          return { actions: [] }
        },
      },
    },
  ],
})

const s = sdk.schema

gardenPlugin.addTool({
  name: "otel-collector",
  version: "v0.80.0",
  description: "Otel collector service",
  type: "binary",
  _includeInGardenImage: false,
  builds: [
    // this version has no arm support yet. If you add a later release, please add the "arm64" architecture.
    {
      platform: "darwin",
      architecture: "amd64",
      url: "https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.80.0/otelcol-contrib_0.80.0_darwin_amd64.tar.gz",
      sha256: "2769c382a8296c73f57c0cfece4337599473b9bc7752e22ee4fcd8e4f1e549ce",
      extract: {
        format: "tar",
        targetPath: "otelcol-contrib",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: "https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.80.0/otelcol-contrib_0.80.0_darwin_arm64.tar.gz",
      sha256: "93149de30b8a47f7c7412a3cf2b5395662c56a5198ab5e942c320216d9a2fd80",
      extract: {
        format: "tar",
        targetPath: "otelcol-contrib",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: "https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.80.0/otelcol-contrib_0.80.0_linux_amd64.tar.gz",
      sha256: "6196e2ec1f8e632abb3c98505c5e111aec47ca86a6f25d9ef5afe538a7b445f0",
      extract: {
        format: "tar",
        targetPath: "otelcol-contrib",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: "https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.80.0/otelcol-contrib_0.80.0_windows_amd64.tar.gz",
      sha256: "b1a971a468da6d73926b9362029fde8f9142578d69179370ffb57ea35693452b",
      extract: {
        format: "tar",
        targetPath: "otelcol-contrib.exe",
      },
    },
  ],
})

const providerConfigSchema = s.object({
  configFilePath: s.string().describe(dedent`
  Optional configuration file path.
`),
})

export const provider = gardenPlugin.createProvider({ configSchema: providerConfigSchema, outputsSchema: s.object({}) })

provider.addHandler("getEnvironmentStatus", async ({ ctx }) => {
  console.log(`Calling environment status`)
  return { ready: false, outputs: {} }
})

provider.addHandler("prepareEnvironment", async ({ ctx, log }) => {
  log.info("Preparing the environment for the otel-collector")
  console.log(`Calling prepare env`)

  const configPath = resolve(ctx.projectRoot, ctx.provider.config.configFilePath)

  const collectorProcess = await ctx.tools["otel-collector.otel-collector"].spawn({
    log,
    args: ["--config", configPath],
    ignoreError: false,
  })

  // collectorProcess.stdout?.pipe(process.stdout)
  // collectorProcess.stderr?.pipe(process.stderr)

  console.log("Process started, initializing collector")
  // Automatically sends to localhost
  configureOTLPHttpExporter()

  registerCleanupFunction("kill-otel-collector", async () => {
    // TODO: force kill after timeout
    collectorProcess.kill()
  })

  return { status: { ready: true, disableCache: true, outputs: {} } }
})
