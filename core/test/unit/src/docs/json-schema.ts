/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { normalizeJsonSchema } from "../../../../src/docs/json-schema"

describe("normalizeJsonSchema", () => {
  it("should normalize a type=oject JSON Schema", () => {
    const keys = normalizeJsonSchema(testJsonSchema)

    expect(keys).to.eql([
      {
        type: "string",
        name: "apiVersion",
        allowedValuesOnly: false,
        defaultValue: "v1",
        deprecated: false,
        description: testJsonSchema.properties.apiVersion.description,
        experimental: false,
        fullKey: "apiVersion",
        formattedExample: undefined,
        formattedName: "apiVersion",
        formattedType: "string",
        hasChildren: false,
        internal: false,
        level: 0,
        parent: undefined,
        required: false,
      },
      {
        type: "string",
        name: "kind",
        allowedValuesOnly: true,
        defaultValue: undefined,
        deprecated: false,
        description: testJsonSchema.properties.kind.description,
        experimental: false,
        fullKey: "kind",
        formattedExample: undefined,
        formattedName: "kind",
        formattedType: "string",
        hasChildren: false,
        internal: false,
        level: 0,
        parent: undefined,
        required: false,
        allowedValues: '"PersistentVolumeClaim"',
      },
      {
        type: "object",
        name: "metadata",
        allowedValuesOnly: false,
        defaultValue: undefined,
        deprecated: false,
        description: testJsonSchema.properties.metadata.description,
        experimental: false,
        fullKey: "metadata",
        formattedExample: undefined,
        formattedName: "metadata",
        formattedType: "object",
        hasChildren: true,
        internal: false,
        level: 0,
        parent: undefined,
        required: false,
      },
      {
        type: "string",
        name: "lastTransitionTime",
        allowedValuesOnly: false,
        defaultValue: undefined,
        deprecated: false,
        description: testJsonSchema.properties.metadata.properties.lastTransitionTime.description,
        experimental: false,
        fullKey: "metadata.lastTransitionTime",
        formattedExample: undefined,
        formattedName: "lastTransitionTime",
        formattedType: "string",
        hasChildren: false,
        internal: false,
        level: 1,
        parent: {
          type: "object",
          name: "metadata",
          allowedValuesOnly: false,
          defaultValue: undefined,
          deprecated: false,
          description: testJsonSchema.properties.metadata.description,
          experimental: false,
          fullKey: "metadata",
          formattedExample: undefined,
          formattedName: "metadata",
          formattedType: "object",
          hasChildren: true,
          internal: false,
          level: 0,
          parent: undefined,
          required: false,
        },
        required: false,
      },
    ])
  })
})

export const testJsonSchema = {
  description: "PersistentVolumeClaim is a user's request for and claim to a persistent volume",
  properties: {
    apiVersion: {
      description:
        "APIVersion defines the versioned schema of this representation of an object. Servers should convert recognized schemas to the latest internal value, and may reject unrecognized values. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources",
      type: ["string", "null"],
      default: "v1",
    },
    kind: {
      description:
        "Kind is a string value representing the REST resource this object represents. Servers may infer this from the endpoint the client submits requests to. Cannot be updated. In CamelCase. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds",
      type: ["string", "null"],
      enum: ["PersistentVolumeClaim"],
    },
    metadata: {
      description:
        "ObjectMeta is metadata that all persisted resources must have, which includes all objects users must create.",
      properties: {
        lastTransitionTime: {
          description:
            "Time is a wrapper around time.Time which supports correct marshaling to YAML and JSON.  Wrappers are provided for many of the factory methods that the time package offers.",
          format: "date-time",
          type: ["string", "null"],
          example: "2020-01-01T00:00:00",
        },
      },
      type: ["object", "null"],
    },
  },
  type: "object",
  $schema: "http://json-schema.org/schema#",
}
