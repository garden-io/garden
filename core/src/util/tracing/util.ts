import * as opentelemetry from "@opentelemetry/sdk-node"

export function prefixWithGardenNamespace(data: opentelemetry.api.Attributes): opentelemetry.api.Attributes {
  const unprefixed = Object.entries(data)

  return Object.fromEntries(
    unprefixed.map(([key, value]) => {
      return [`garden.${key}`, value]
    })
  )
}
