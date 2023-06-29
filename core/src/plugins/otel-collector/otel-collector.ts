/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join, resolve as resolvePath } from "path"
import { GenericProviderConfig, Provider } from "../../config/provider"
import { dedent } from "../../util/string"
import { sdk } from "../../plugin/sdk"
import { registerCleanupFunction } from "../../util/util"
import { configureOTLPHttpExporter } from "../../util/tracing/tracing"
import { ChildProcess } from "child_process"
import { OTEL_CONFIG_FILE } from "./config"
import YAML from "yaml"
import { makeTempDir } from "../../util/fs"
import { writeFile } from "fs-extra"
import { DirectoryResult } from "tmp-promise"

const OTEL_CONFIG_NAME = "otel-config.yaml"
export interface OtelCollectorProviderConfig extends GenericProviderConfig {}

export type OtelCollectorProvider = Provider<OtelCollectorProviderConfig>

export const gardenPlugin = sdk.createGardenPlugin({
  name: "otel-collector",
  dependencies: [{ name: "exec" }],
  docs: dedent`
  Otel Collector
    `,
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
  configFilePath: s.string().optional().describe(dedent`
    Optional configuration file path.
  `),
})

export const provider = gardenPlugin.createProvider({ configSchema: providerConfigSchema, outputsSchema: s.object({}) })

provider.addHandler("getEnvironmentStatus", async ({ ctx }) => {
  return { ready: false, outputs: {} }
})

async function waitForLogLine({
  successLog,
  errorLog,
  process
}: {
  successLog: string
  errorLog: string
  process: ChildProcess
}): Promise<void> {
  let stdOutString = ""
  let stdErrString = ""

  return new Promise((resolve, reject) => {
    function hasError(string: string): boolean {
      return stdOutString.includes(errorLog) || stdErrString.includes(errorLog)
    }

    function hasSuccess(string: string): boolean {
      return stdOutString.includes(successLog) || stdErrString.includes(successLog)
    }

    process.stdout?.on("data", (chunk) => {
      stdOutString = stdOutString + chunk
      if (hasSuccess(stdOutString)) {
        resolve()
      } else if (hasError(stdOutString)) {
        reject()
      }
    })

    process.stderr?.on("data", (chunk) => {
      stdErrString = stdErrString + chunk
      if (hasSuccess(stdOutString)) {
        resolve()
      } else if (hasError(stdOutString)) {
        reject()
      }
    })
  })
}

provider.addHandler("prepareEnvironment", async ({ ctx, log }) => {
  const scopedLog = log.createLog({ name: "otel-collector" })
  scopedLog.silly("Preparing the environment for the otel-collector")

  let configPath
  let tempDir: DirectoryResult | undefined
  if (ctx.provider.config.configFilePath) {
    configPath = resolvePath(ctx.projectRoot, ctx.provider.config.configFilePath)
    scopedLog.silly(`Config path provided, loading from ${configPath}`)
  } else {
    // If the config file path isn't given in the provider config
    // we create one ourselves with a default
    //
    // TODO: Add code that fetches config from cloud here
    // and then adds it to the config file
    const configFileYaml = YAML.stringify(OTEL_CONFIG_FILE)
    tempDir = await makeTempDir()
    configPath = join(tempDir.path, OTEL_CONFIG_NAME)
    scopedLog.silly(`Config path not provided, creating temporary one in ${configPath}`)
    await writeFile(configPath, configFileYaml)
  }

  scopedLog.silly("Starting collector process")
  const collectorProcess = await ctx.tools["otel-collector.otel-collector"].spawn({
    log,
    args: ["--config", configPath],
  })

  try {
    scopedLog.silly("Waiting for collector process start")
    await waitForLogLine({
      successLog: "Everything is ready. Begin running and processing data.",
      errorLog: "collector server run finished with error",
      process: collectorProcess,
    })

    // Once the collector is started, the config is loaded and we can clean up the temporary directory
    scopedLog.silly("Cleaning up config directory")
    await tempDir?.cleanup()

    scopedLog.silly("Collector process started. Switching exporter over to otel-collector.")

    // TODO: Currently set to 4319 to have Jaeger and the collector co-exist on the same machine
    // This should be changed back to the default
    // Automatically sends to localhost:4318 without config value
    configureOTLPHttpExporter({
      url: "http://0.0.0.0:4319/v1/traces",
    })

    registerCleanupFunction("kill-otel-collector", async () => {
      scopedLog.silly("Shutting down otel-collector.")
      // TODO: force kill after timeout
      collectorProcess.kill()
    })

    return { status: { ready: true, disableCache: true, outputs: {} } }
  } catch (err) {
    // TODO: We might not want to fail if the collector didn't initialize correctly
    scopedLog.error("otel-collector failed to initialize")
    return { status: { ready: false, disableCache: true, outputs: {} } }
  }
})
