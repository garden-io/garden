/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { GenericProviderConfig, Provider } from "../../config/provider"
import { dedent } from "../../util/string"
import { sdk } from "../../plugin/sdk"
import { registerCleanupFunction } from "../../util/util"
import { configureOTLPHttpExporter } from "../../util/tracing/tracing"
import { OtelExportersConfig, getOtelCollectorConfigFile } from "./config"
import YAML from "yaml"
import { makeTempDir } from "../../util/fs"
import { writeFile } from "fs-extra"
import { LogLineTimeoutError, streamLogs, waitForLogLine } from "../../util/process"
import getPort from "get-port"
import { wrapActiveSpan } from "../../util/tracing/spans"

const OTEL_CONFIG_NAME = "otel-config.yaml"
const WAIT_TIMEOUT_FOR_DATADOG_EXPORT = 3000

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

const baseValidator = s.object({
  name: s.string(),
  enabled: s.boolean(),
})

const otlpHttpValidator = baseValidator.merge(
  s.object({
    name: s.literal("otlphttp"),
    endpoint: s.string().url(),
    headers: s.record(s.string().min(1), s.number()).optional(),
  })
)

const newRelicValidator = baseValidator.merge(
  s.object({
    name: s.literal("newrelic"),
    endpoint: s.string().url().default("https://otlp.nr-data.net:4318"),
    apiKey: s.string().min(1),
  })
)

const dataDogValidator = baseValidator.merge(
  s.object({
    name: s.literal("datadog"),
    site: s.string().min(1).default("datadoghq.com"),
    apiKey: s.string().min(1),
  })
)

const providerConfigSchema = s.object({
  exporters: s.array(s.union([otlpHttpValidator, newRelicValidator, dataDogValidator])),
})

export const provider = gardenPlugin.createProvider({ configSchema: providerConfigSchema, outputsSchema: s.object({}) })

provider.addHandler("getEnvironmentStatus", async ({ ctx }) => {
  return { ready: false, outputs: {} }
})

provider.addHandler("prepareEnvironment", async ({ ctx, log }) => {
  const scopedLog = log.createLog({ name: "otel-collector" })
  scopedLog.debug("Preparing the environment for the otel-collector")

  // Find an open port for where we run the receiver
  // By convention the default is 4318
  // but in case that's occupied we use a random one
  const otlpReceiverPort = await getPort({
    port: 4318,
  })

  scopedLog.debug(`Using port ${otlpReceiverPort} for the receiver`)

  // If the config file path isn't given in the provider config
  // we create one ourselves with a default
  //
  // TODO: Add code that fetches config from cloud here
  // and then adds it to the config file
  const exporters: OtelExportersConfig[] = ctx.provider.config.exporters

  const hasDatadogExporter = exporters.some((exporter) => exporter.name === "datadog")

  const configFile = getOtelCollectorConfigFile({
    otlpReceiverPort,
    exporters,
  })

  const configFileYaml = YAML.stringify(configFile)
  const tempDir = await makeTempDir()
  const configPath = join(tempDir.path, OTEL_CONFIG_NAME)
  scopedLog.debug(`Creating temporary config in ${configPath}`)
  await writeFile(configPath, configFileYaml)

  scopedLog.silly("Starting collector process")
  const collectorProcess = await wrapActiveSpan("fetchAndRun", () =>
    ctx.tools["otel-collector.otel-collector"].spawn({
      log,
      args: ["--config", configPath],
    })
  )

  scopedLog.debug("Waiting for collector process start")

  streamLogs({
    ctx,
    name: "otel-collector-process",
    proc: collectorProcess,
  })

  try {
    await wrapActiveSpan("waitUntilReady", () =>
      waitForLogLine({
        successLog: "Everything is ready. Begin running and processing data.",
        errorLog: "collector server run finished with error",
        process: collectorProcess,
      })
    )

    // Once the collector is started, the config is loaded and we can clean up the temporary directory
    scopedLog.debug("Cleaning up config directory")
    await tempDir?.cleanup()

    scopedLog.debug("Collector process started. Switching exporter over to otel-collector.")

    configureOTLPHttpExporter({
      url: `http://localhost:${otlpReceiverPort}/v1/traces`,
    })

    registerCleanupFunction("kill-otel-collector", async () => {
      scopedLog.debug("Shutting down otel-collector.")
      if (hasDatadogExporter){
        scopedLog.debug("Waiting for final datadog sync.")
        try {
          await waitForLogLine({
            process: collectorProcess,
            successLog: "Flushed traces to the API",
            timeout: WAIT_TIMEOUT_FOR_DATADOG_EXPORT,
          })
        } catch (err) {
          if (!(err instanceof LogLineTimeoutError)) {
            throw err
          }
        }
      }
      scopedLog.debug("Killing process")
      collectorProcess.kill()
    })

    return { status: { ready: true, disableCache: true, outputs: {} } }
  } catch (err) {
    // TODO: We might not want to fail if the collector didn't initialize correctly
    scopedLog.error("otel-collector failed to initialize")
    return { status: { ready: false, disableCache: true, outputs: {} } }
  }
})
