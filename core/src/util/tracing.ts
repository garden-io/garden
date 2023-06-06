import * as opentelemetry from "@opentelemetry/sdk-node"

export const tracer = opentelemetry.api.trace.getTracer("garden")
export const getActiveContext = () => opentelemetry.api.context.active()

