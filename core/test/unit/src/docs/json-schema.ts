/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { JsonKeyDescription } from "../../../../src/docs/json-schema.js"

describe("JsonKeyDescription", () => {
  it("correctly set the basic attributes of an object schema", () => {
    const desc = new JsonKeyDescription({
      schema: testJsonSchema,
      name: undefined,
      level: 0,
    })

    expect(desc.type).to.equal("object")
    expect(desc.internal).to.be.false
    expect(desc.deprecated).to.be.false
    expect(desc.experimental).to.be.false
    expect(desc.description).to.equal(testJsonSchema.description)
  })

  describe("getChildren", () => {
    it("should correctly handle object schemas", () => {
      const desc = new JsonKeyDescription({
        schema: testJsonSchema,
        name: "foo",
        level: 0,
      })
      const children = desc.getChildren()

      expect(children.length).to.equal(3)
      expect(children[0].type).to.equal("string")
      expect(children[1].type).to.equal("string")
      expect(children[2].type).to.equal("object")

      for (const c of children) {
        expect(c.parent).to.equal(desc)
      }
    })
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
