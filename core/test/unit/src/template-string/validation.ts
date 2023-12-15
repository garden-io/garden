/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { z } from "zod"
import { parseTemplateCollection, parseTemplateString } from "../../../../src/template-string/template-string.js"
import { expect } from "chai"
import { GenericContext } from "../../../../src/config/template-contexts/base.js"
import { GardenConfig } from "../../../../src/template-string/validation.js"
import Joi from "@hapi/joi"
import { serialize } from "node:v8"
import { language } from "gray-matter"

// In the future we might
// const varsFromFirstConfig = firstConfig.atPath("var") // can contain lazy values
// const actionConfigWithVars = actionConfig.merge(firstConfig)

describe("GardenConfig", () => {
  it("takes parsed config collection, and offers a validate() method that returns a lazy config proxy with the correct type information", () => {
    const parsedConfig = parseTemplateCollection({
      value: {
        kind: "Deployment",
        type: "kubernetes",
        spec: {
          files: ["manifests/deployment.yaml"],
        },
      },
      source: { source: undefined },
    })

    const unrefinedConfig = new GardenConfig({
      parsedConfig,
      context: new GenericContext({}),
      opts: {},
    })

    const config = unrefinedConfig.refineWithZod(
      z.object({
        kind: z.literal("Deployment"),
        type: z.literal("kubernetes"),
        spec: z.object({
          files: z.array(z.string()),
        }),
      })
    )

    const proxy = config.getConfig()

    // proxy has type hints, no need to use bracket notation
    expect(proxy.spec.files[0]).to.equal("manifests/deployment.yaml")
  })

  it("if schema validation mutates the data structures, e.g. it has defaults, the original config object does not change", () => {
    const parsedConfig = parseTemplateCollection({
      value: {
        kind: "Deployment",
        type: "kubernetes",
        spec: {
          // replicas defaults to 1, but isn't specified here
          files: ["manifests/deployment.yaml"],
        },
      },
      source: { source: undefined },
    })

    const unrefinedConfig = new GardenConfig({
      parsedConfig,
      context: new GenericContext({}),
      opts: {},
    })

    const config = unrefinedConfig.refineWithZod(
      z.object({
        kind: z.literal("Deployment"),
        type: z.literal("kubernetes"),
        spec: z.object({
          // replicas defaults to 1
          replicas: z.number().default(1),
          files: z.array(z.string()),
        }),
      })
    )

    const proxy = config.getConfig()

    // const spec = proxy.spec

    // spec.replicas = 2

    // expect(proxy.spec.replicas).to.equal(2)

    // proxy has type hints, no need to use bracket notation
    expect(proxy.spec.replicas).to.equal(1)

    expect(proxy).to.deep.equal({
      kind: "Deployment",
      type: "kubernetes",
      spec: {
        files: ["manifests/deployment.yaml"],
        replicas: 1,
      },
    })

    const unrefinedProxy = unrefinedConfig.getConfig()

    // the unrefined config has not been mutated
    expect(unrefinedProxy).to.deep.equal({
      kind: "Deployment",
      type: "kubernetes",
      spec: {
        files: ["manifests/deployment.yaml"],
      },
    })
  })

  it("does not keep overrides when the context changes", () => {
    const parsedConfig = parseTemplateCollection({
      value: {
        replicas: "${var.replicas}",
      },
      source: { source: undefined },
    })

    const config1 = new GardenConfig({
      parsedConfig,
      context: new GenericContext({}),
      opts: {
        allowPartial: true,
      },
    }).refineWithZod(
      z.object({
        // if replicas is not specified, it defaults to 1
        replicas: z.number().default(1),
      })
    )

    const proxy1 = config1.getConfig()

    // replicas is specified, but it's using a variable that's not defined yet and the proxy is in `allowPartial` mode
    expect(proxy1.replicas).to.equal(1)

    // Now var.replicas is defined and the default from spec.replicas should not be used anymore.
    const config2 = config1
      .withContext(new GenericContext({ var: { replicas: 7 } }))
      .refineWithZod(
        z.object({
          // if replicas is not specified, it defaults to 1
          replicas: z.number().default(1),
        })
      )

      // You can even refine multiple times, and the types will be merged together.
      .refineWithZod(
        z.object({
          foobar: z.string().default("foobar"),
        })
      )

    const proxy2 = config2.getConfig()

    proxy2 satisfies { replicas: number; foobar: string }

    expect(proxy2.replicas).to.equal(7)
    expect(proxy2.foobar).to.equal("foobar")
  })

  it("allows specifying the full destination type at the beginning", () => {
    type DestinationType = {
      replicas: number
      enabled: boolean
    }

    const parsedConfig = parseTemplateCollection({
      value: {
        replicas: "${var.replicas}",
      },
      source: { source: undefined },
    })

    const config1 = new GardenConfig<DestinationType>({
      parsedConfig,
      context: new GenericContext({}),
      opts: {},
    })

    // not refined yet
    config1.value satisfies never

    config1.refineWithZod(
      z.object({
        replicas: z.number(),
      })
    )

    config1.value.replicas satisfies number
    config1.value.enabled satisfies never
  })

  it("can be used with any type assertion", () => {
    const context = new GenericContext({ var: { fruits: ["apple", "banana"] } })

    const isFruits = (value: any): value is { fruits: string[] } => {
      if (Array.isArray(value.fruits)) {
        return value.fruits.every((item) => {
          return typeof item === "string"
        })
      }
      return false
    }

    const parsedConfig = parseTemplateCollection({
      value: {
        fruits: "${var.fruits}",
      },
      source: { source: undefined },
    })

    const config = new GardenConfig({
      parsedConfig,
      context,
      opts: {
        allowPartial: true,
      },
    }).assertType(isFruits)

    const proxy = config.getConfig()

    proxy satisfies { fruits: string[] }

    expect(proxy.fruits).to.deep.equal(["apple", "banana"])
  })

  it("can be used with joi validators", () => {
    const fruitsSchema = Joi.object({ fruits: Joi.array().items(Joi.string()) })
    type Fruits = {
      fruits: string[]
    }

    const context = new GenericContext({ var: { fruits: ["apple", "banana"] } })

    const parsedConfig = parseTemplateCollection({
      value: {
        fruits: "${var.fruits}",
      },
      source: { source: undefined },
    })

    const config = new GardenConfig({
      parsedConfig,
      context,
      opts: {
        allowPartial: true,
      },
    }).refineWithJoi<Fruits>(fruitsSchema)

    const proxy = config.getConfig()

    proxy satisfies Fruits

    expect(proxy.fruits).to.deep.equal(["apple", "banana"])
  })

  describe("transformations", () => {
    it("allows arbitrary lazy transformations on the expected type. The actual values can only be accessed after refinement.", () => {
      type Landscape = {
        region: string
        trees: number
        water: boolean
        animals: { species: string }[]
      }

      const landscape = new GardenConfig<Landscape>({
        parsedConfig: parseTemplateCollection({
          value: {
            region: "Alps",
            defaultAnimalName: "${var.DEFAULT_NAME}",
            trees: 5,
            water: true,
            animals: [
              { species: "gazelle", id: "${uuid()}" },
              { species: "cow", id: "${uuid()}" },
            ],
          },
          source: { source: undefined },
        }),
        context: new GenericContext({}),
        opts: {},
      })

      const hasWater = landscape.atPath("water")

      hasWater satisfies GardenConfig<boolean>

      // The value has not been refined yet, so we must validate it before accessing
      // This is only a limitation imposed by the type system and can be circumvented by casting to any, if the programmer wishes.
      // If the value can't be resolved that would then result in a runtime error.
      hasWater.value satisfies never

      hasWater.refineWithZod(z.boolean())

      expect(hasWater.value).to.equal(true)

      const waterColor = hasWater.value ? "blue" : "transparent"
      expect(waterColor).to.equal("blue")

      const isAlps = landscape.atPath("country").transform((country) => country.value === "Alps")
      isAlps satisfies GardenConfig<boolean>

      const defaultedAnimalsAndRegion = landscape.transform((landscape) => ({
        region: landscape.atPath("region"),
        animals: landscape.atPath("animals").transform((animals) =>
          animals.map((animal) => ({
            species: animal.atPath("species"),
            name: animal.atPath("name").or(landscape.atPath("defaultAnimalName")),
          }))
        ),
      }))

      defaultedAnimalsAndRegion satisfies GardenConfig<{
        region: string
        animals: { species: string; name: string }[]
      }>

      expect(() => {
        landscape.transform((l) => ({ circular: l }))
      }).to.throw("Detected circular transformation")
    })
  })
})
