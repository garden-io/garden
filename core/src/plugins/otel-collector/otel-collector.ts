/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import type { BaseProviderConfig, Provider } from "../../config/provider.js"
import { dedent } from "../../util/string.js"
import { sdk } from "../../plugin/sdk.js"
import { registerCleanupFunction } from "../../util/util.js"
import { configureNoOpExporter, configureOTLPHttpExporter } from "../../util/open-telemetry/tracing.js"
import type { OtelExportersConfig } from "./config.js"
import { getOtelCollectorConfigFile } from "./config.js"
import YAML from "yaml"
import { makeTempDir } from "../../util/fs.js"
import fsExtra from "fs-extra"

const { writeFile } = fsExtra
import { streamLogs, waitForLogLine, waitForProcessExit } from "../../util/process.js"
import getPort from "get-port"
import { wrapActiveSpan } from "../../util/open-telemetry/spans.js"
import { dataDogValidator } from "./config/datadog.js"
import { honeycombValidator } from "./config/honeycomb.js"
import { loggingValidator } from "./config/logging.js"
import { newRelicValidator } from "./config/newrelic.js"
import { otlpHttpValidator } from "./config/otlphttp.js"
import { toGardenError } from "../../exceptions.js"

const OTEL_CONFIG_NAME = "otel-config.yaml"

export type OtelCollectorProviderConfig = BaseProviderConfig
export type OtelCollectorProvider = Provider<OtelCollectorProviderConfig>

export const gardenPlugin = sdk.createGardenPlugin({
  name: "otel-collector",
  dependencies: [{ name: "exec" }],
  docs: dedent`
  This provider enables gathering and exporting [OpenTelemetry](https://opentelemetry.io/) data for the Garden execution.

  It provides detailed insights into what a Garden command is doing at any given time and can be used for alerting on performance regressions or debugging performance issues.

  It does that by running an [OpenTelemetry Collector](https://github.com/open-telemetry/opentelemetry-collector) on the local machine for the duration of the command execution, which then exports the gathered data to the desired service.

  Currently supported exporters are [Datadog](https://www.datadoghq.com/), [Newrelic](https://newrelic.com/), [Honeycomb](https://www.honeycomb.io/) and 'OTLP HTTP'.

  `,
})

const s = sdk.schema

const otelCollectorVersion = "0.80.0"
gardenPlugin.addTool({
  name: "otel-collector",
  version: `v${otelCollectorVersion}`,
  description: `Otel collector service, v${otelCollectorVersion}`,
  type: "binary",
  _includeInGardenImage: false,
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: `https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${otelCollectorVersion}/otelcol-contrib_${otelCollectorVersion}_darwin_amd64.tar.gz`,
      sha256: "2769c382a8296c73f57c0cfece4337599473b9bc7752e22ee4fcd8e4f1e549ce",
      extract: {
        format: "tar",
        targetPath: "otelcol-contrib",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: `https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${otelCollectorVersion}/otelcol-contrib_${otelCollectorVersion}_darwin_arm64.tar.gz`,
      sha256: "93149de30b8a47f7c7412a3cf2b5395662c56a5198ab5e942c320216d9a2fd80",
      extract: {
        format: "tar",
        targetPath: "otelcol-contrib",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: `https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${otelCollectorVersion}/otelcol-contrib_${otelCollectorVersion}_linux_amd64.tar.gz`,
      sha256: "6196e2ec1f8e632abb3c98505c5e111aec47ca86a6f25d9ef5afe538a7b445f0",
      extract: {
        format: "tar",
        targetPath: "otelcol-contrib",
      },
    },
    {
      platform: "linux",
      architecture: "arm64",
      url: `https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${otelCollectorVersion}/otelcol-contrib_${otelCollectorVersion}_linux_arm64.tar.gz`,
      sha256: "19d878166dbc39821f11b6a7c2ed896726c8d5ac6c15108b66d8e874efa8db85",
      extract: {
        format: "tar",
        targetPath: "otelcol-contrib",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: `https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${otelCollectorVersion}/otelcol-contrib_${otelCollectorVersion}_windows_amd64.tar.gz`,
      sha256: "b1a971a468da6d73926b9362029fde8f9142578d69179370ffb57ea35693452b",
      extract: {
        format: "tar",
        targetPath: "otelcol-contrib.exe",
      },
    },
  ],
})

const providerConfigSchema = s.object({
  exporters: s.array(
    s.union([loggingValidator, otlpHttpValidator, newRelicValidator, dataDogValidator, honeycombValidator])
  ),
})

export const provider = gardenPlugin.createProvider({ configSchema: providerConfigSchema, outputsSchema: s.object({}) })

provider.addHandler("getEnvironmentStatus", async () => {
  return { ready: false, outputs: {} }
})

provider.addHandler("prepareEnvironment", async ({ ctx, log }) => {
  const scopedLog = log.createLog({ name: "otel-collector" })
  scopedLog.debug("Preparing the environment for the otel-collector")

  const allExporters: OtelExportersConfig[] = ctx.provider.config.exporters
  const exporters: OtelExportersConfig[] = allExporters.filter((exporter) => exporter.enabled)

  if (exporters.length === 0) {
    scopedLog.debug("No OTEL exporters are enabled, otel-collector is not needed.")
    configureNoOpExporter()
    return { status: { ready: true, disableCache: true, outputs: {} } }
  }

  // Find an open port for where we run the receiver
  // By convention the default is 4318
  // but in case that's occupied we use a random one
  const otlpReceiverPort = await getPort({
    port: 4318,
  })

  // NOTE: we explicitly use IPv4 localhost to make sure the external
  // otel-collector binds to the same localhost as the exporter uses
  const localhost = "127.0.0.1"
  const receiverEndpoint = `${localhost}:${otlpReceiverPort}`
  scopedLog.debug(`Using endpoint ${receiverEndpoint} for the receiver`)

  const configFile = getOtelCollectorConfigFile({
    exporters,
  })

  const configFileYaml = YAML.stringify(configFile)
  const tempDir = await makeTempDir()
  const configPath = join(tempDir.path, OTEL_CONFIG_NAME)
  scopedLog.debug(`Creating temporary config in ${configPath}`)
  await writeFile(configPath, configFileYaml)

  scopedLog.silly(() => "Starting collector process")
  const collectorProcess = await wrapActiveSpan("fetchAndRun", () =>
    ctx.tools["otel-collector.otel-collector"].spawn({
      log,
      args: ["--config", configPath, "--set", `receivers.otlp.protocols.http.endpoint=${receiverEndpoint}`],
    })
  )

  const processExited = waitForProcessExit({ proc: collectorProcess })

  scopedLog.debug("Waiting for collector process start")

  streamLogs({
    ctx,
    name: "otel-collector-process",
    proc: collectorProcess,
    level: "silly",
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
      url: `http://${localhost}:${otlpReceiverPort}/v1/traces`,
    })

    registerCleanupFunction("kill-otel-collector", async () => {
      scopedLog.debug("Shutting down otel-collector.")
      collectorProcess.kill()
      scopedLog.debug("Waiting for process to terminate")
      await processExited
      scopedLog.debug("Process exited")
    })

    return { status: { ready: true, disableCache: true, outputs: {} } }
  } catch (error) {
    // TODO: We might not want to fail if the collector didn't initialize correctly
    scopedLog.error("otel-collector failed to initialize")
    scopedLog.error({ error: toGardenError(error) })
    return { status: { ready: false, disableCache: true, outputs: {} } }
  }
})
