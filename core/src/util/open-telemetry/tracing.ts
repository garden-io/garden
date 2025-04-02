/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as opentelemetry from "@opentelemetry/sdk-node"
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http"
import { gardenEnv } from "../../constants.js"
import { getSessionContext } from "./context.js"
import { prefixWithGardenNamespace } from "./util.js"
import { ReconfigurableExporter } from "./exporters/reconfigurable-exporter.js"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import type { OTLPExporterNodeConfigBase } from "@opentelemetry/otlp-exporter-base"
import { NoOpExporter } from "./exporters/no-op-exporter.js"

export const tracer = opentelemetry.api.trace.getTracer("garden")
export const reconfigurableExporter = new ReconfigurableExporter()
const hasOtelEnvConfiguration = !!process.env.OTEL_TRACES_EXPORTER

// Singleton we initialize either when we get the SDK the first time
// or when we call `initTracing` explicitly
// We do this to ensure that the SDK can be initialized as the first thing in the application
// so that it can integrate its instrumentation before any other imports happened
let otelSDK: opentelemetry.NodeSDK | undefined

/**
 * Gets the Node OTEL SDK singleton.
 * Initializes it if it hasn't been initialized already.
 * @returns The `NodeSDK`
 */
export const getOtelSDK: () => opentelemetry.NodeSDK = () => {
  if (!otelSDK) {
    return initTracing()
  } else {
    return otelSDK
  }
}

/**
 * Used to check if OTEL has been properly configured, either via the OTEL_ env vars or by
 * setting a target exporter for the ReconfigurableExporter.
 *
 * This is needed because attempting to shut down OTEL will hang if no target exporter has been set.
 *
 * @returns boolean
 */
export function isOtelExporterConfigured() {
  return hasOtelEnvConfiguration || reconfigurableExporter.hasTargetExporter()
}

/**
 * Initializes the tracing and auto-instrumentations.
 * Should be called as early as possible in the application initialization
 * so that it can inject its instrumentations before other libraries may add their custom wrappers.
 * @returns The `NodeSDK`
 */
export function initTracing(): opentelemetry.NodeSDK {
  if (otelSDK) {
    return otelSDK
  }

  if (!gardenEnv.GARDEN_ENABLE_TRACING) {
    process.env.OTEL_SDK_DISABLED = "true"
  }

  otelSDK = new opentelemetry.NodeSDK({
    serviceName: "garden-cli",
    instrumentations: [
      new HttpInstrumentation({
        applyCustomAttributesOnSpan: () => {
          return prefixWithGardenNamespace(getSessionContext())
        },
        ignoreOutgoingRequestHook: (request) => {
          return Boolean(
            request.hostname?.includes("segment.io") ||
              (request.hostname?.includes("garden.io") &&
                (request.path?.includes("/events") || request.path?.includes("/version")))
          )
        },
      }),
    ],
    traceExporter: hasOtelEnvConfiguration ? undefined : reconfigurableExporter,
    autoDetectResources: false,
  })

  otelSDK.start()

  return otelSDK
}

export function configureOTLPHttpExporter(config?: OTLPExporterNodeConfigBase | undefined): void {
  const exporter = new OTLPTraceExporter(config)
  reconfigurableExporter.setTargetExporter(exporter)
}

export function configureNoOpExporter(): void {
  const exporter = new NoOpExporter()
  reconfigurableExporter.setTargetExporter(exporter)
}
