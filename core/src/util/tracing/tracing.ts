import * as opentelemetry from "@opentelemetry/sdk-node"
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http"
import { gardenEnv } from "../../constants"
import { getSessionContext } from "./context"
import { prefixWithGardenNamespace } from "./util"

export const tracer = opentelemetry.api.trace.getTracer("garden")

// Singleton we initialize either when we get the SDK the first time
// or when we call `initTracing` explicitly
// We do this to ensure that the SDK can be initialized as the first thing in the application
// so that it can integrate its instrumentation before any other imports happened
let otelSDK: opentelemetry.NodeSDK | undefined

export const getOtelSDK: () => opentelemetry.NodeSDK = () => {
  if (!otelSDK) {
    return initTracing()
  } else {
    return otelSDK
  }
}

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
    autoDetectResources: false,
  })

  otelSDK.start()

  return otelSDK
}
