/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const parse = (await import("joi-to-json")) as any
import { zodToJsonSchema } from "zod-to-json-schema"

import { buildActionConfigSchema } from "../actions/build.js"
import { type ActionDefinitionMap } from "../plugins.js"
import { type ObjectSchema } from "@hapi/joi"
import { deployActionConfigSchema } from "../actions/deploy.js"
import { runActionConfigSchema } from "../actions/run.js"
import { testActionConfigSchema } from "../actions/test.js"
import { findByName, isTruthy } from "../util/util.js"
import { type GardenPluginSpec } from "../plugin/plugin.js"
import { projectSchema } from "../config/project.js"
import { workflowConfigSchema } from "../config/workflow.js"
import { configTemplateSchema } from "../config/config-template.js"
import { renderTemplateConfigSchema } from "../config/render-template.js"
import { isObjectLike } from "lodash-es"

const mockSchema = {
  type: "object",
  properties: {
    apiVersion: {
      description: "The schema version of this config (currently unused).",
    },
    type: {
      type: "string",
      description: "foo",
      pattern: "^(?![0-9]+$)(?!.*-$)(?!-)[a-z0-9-]{1,63}$",
    },
    name: {
      type: "string",
      description: "Bar",
      pattern: "^(?!garden)(?=.{1,63}$)[a-z][a-z0-9]*(-[a-z0-9]+)*$",
    },
    description: { type: "string", description: "A description of the action." },
    source: {
      type: "object",
      description: "some description",
      properties: {
        path: {
          type: "posixPath",
          description: "some description",
        },
      },
    },
  },
}

const extraObjectKeys = [
  {
    name: "$merge",
    description: "Merge stuff",
  },
  {
    name: "$if",
    description: "If statements",
  },
  {
    name: "$else",
    description: "Else statements",
  },
  {
    name: "$then",
    description: "Then statements",
  },
  {
    name: "$forEach",
    description: "For each statements",
  },
  {
    name: "$return",
    description: "Return statements",
  },
  {
    name: "$filter",
    description: "Filter statements",
  },
  {
    name: "$concat",
    description: "Concat lists",
  },
]

// const specialProperties = {
//   properties: {
//     $merge: {
//       type: "string",
//       description: "Merge stuff",
//     },
//     $if: {
//       type: "string",
//       description: "If statements",
//     },
//     $else: {
//       type: "string",
//       description: "Else statements",
//     },
//     $then: {
//       type: "string",
//       description: "Then statements",
//     },
//     $forEach: {
//       type: "string",
//       description: "For each statements",
//     },
//     $return: {
//       type: "string",
//       description: "Return statements",
//     },
//     $filter: {
//       type: "string",
//       description: "Filter statements",
//     },
//     $concat: {
//       type: "string",
//       description: "Concat lists",
//     },
//   },
// }

/**
 * Visit every node in the JSON graph and modify as needed. This is required because the generated
 * schemas don't quite cut it so we need to massage them into shape.
 *
 * Checkout the actual implementation for details.
 */
function transformJson(obj: unknown, transformations: { [key: string]: string }) {
  if (typeof obj !== "object" || obj === null) {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => transformJson(item, transformations))
  }

  return Object.entries(obj).reduce((acc, [key, value]) => {
    // An internal key that we omit. This will cause trouble if there's actually a config field call "internal" but AFAICT this
    // is what we do in other cases, e.g. when generating docs.
    if (key === "internal") {
      return acc
    }

    // We can't really do required because template strings, e.g. $merge can add required fields
    // TODO @eysi: Can we be smarter here and e.g. validate if $merge et al are not present?
    if (key === "required" && Array.isArray(value)) {
      value = undefined
    }

    // The Joi/Zod schemas define what patterns (i.e. regexes) are allowed for keys in key-value pairs
    // like `buildArgs`. This doesn't jive well with the JSON schema so we basically disable those here.
    if (isObjectLike(value) && value.patternProperties) {
      value.properties = undefined
      value.patternProperties = undefined
      value.additionalProperties = true
    }

    // Remove regex patterns so that template strings work. That is, we want `namespace: ${environment.namespace}` to
    // work even if ${xyz} is not a valid namespace name.
    // TODO @eysi: Detect the regex and update so that it works whether you're using template strings or not.
    if (key === "pattern" && typeof value === "string") {
      value = undefined
    }

    // Map format: uri to format: uri-reference
    if (key === "format" && typeof value === "string" && value === "uri") {
      value = "uri-reference"
    }

    // The "not" key is trouble so we skip it
    if (key === "not") {
      value = undefined
    }

    // TODO @eysi: Validate that enums work with template strings
    // if (isObjectLike(value) && value.enum && Array.isArray(value.enum)) {
    //   value.enum = undefined
    // }

    // Add Garden special properties like `$merge`
    if (isObjectLike(value) && value.properties && typeof value.properties === "object") {
      // Add $merge to the properties if it doesn't exist already
      for (const extraKey of extraObjectKeys) {
        if (!value.properties[extraKey.name]) {
          value.properties[extraKey.name] = {
            type: "string",
            description: extraKey.description,
          }
        }
      }
    }

    // Transform some illegal custom types to a legal type (e.g. "posixPath" => "string")
    let newValue: any
    if (key === "type" && typeof value === "string" && value in transformations) {
      newValue = transformations[value]
    } else if (isObjectLike(value)) {
      newValue = transformJson(value, transformations)
    } else {
      newValue = value
    }

    const templateStringType = {
      type: "string",
      // TODO @eysi: Validate this regex
      pattern: "^\\$\\{[^}]+\\}$",
    }

    const validTypes = ["string", "number", "integer", "boolean", "array", "object", "null"]

    // Any type can be a template string type
    // Need to make sure we're looking at a JSON schema type, and not say, a Garden config field named "type"
    // And we're using the new value after it's been cast to a valid JSON schema type
    if (
      isObjectLike(newValue) &&
      newValue.type &&
      typeof newValue.type === "string" &&
      validTypes.includes(newValue.type)
    ) {
      acc[key] = {
        anyOf: [newValue, templateStringType],
      }
    } else {
      acc[key] = newValue
    }

    return acc
  }, {})
}

function convertSchema2Json(schema: ObjectSchema) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let jsonSchema: any
  const isZodSchema = findByName(schema["_rules"] || [], "zodSchema")
  if (isZodSchema) {
    jsonSchema = zodToJsonSchema(schema["_singleRules"].get("zodSchema").args.zodSchema, {
      $refStrategy: "none",
    })
  } else {
    // The logicalOpParser=true basically means it doesn't try and be smart with Joi conditionals and such
    // and basically falls back to just validating key names and value types
    jsonSchema = parse.default(schema, "json", {}, { logicalOpParser: false })
  }

  return jsonSchema
}

function makeActionJsonSchemas(actionTypeDefinitions: ActionDefinitionMap) {
  const baseSchemas = {
    Build: buildActionConfigSchema(),
    Run: runActionConfigSchema(),
    Deploy: deployActionConfigSchema(),
    Test: testActionConfigSchema(),
  }

  const jsonSchemas = Object.entries(actionTypeDefinitions).flatMap(([kind, types]) => {
    const baseSchema = baseSchemas[kind] as ObjectSchema
    const baseJsonSchema = convertSchema2Json(baseSchema)

    return Object.entries(types)
      .map(([type, definition]) => {
        const specJsonSchema = convertSchema2Json(definition.spec.schema)
        const fullJsonSchema = {
          ...baseJsonSchema,
          properties: {
            ...baseJsonSchema.properties,
            spec: specJsonSchema,
          },
        }

        const jsonSchema = {
          if: {
            properties: {
              kind: { const: kind },
              type: { const: type },
            },
            required: ["type"],
          },
          then: fullJsonSchema,
        }

        return jsonSchema
      })
      .filter(isTruthy)
  })

  return jsonSchemas
}

function makeProjectJsonSchema(plugins: GardenPluginSpec[]) {
  const baseProjectJsonSchema = convertSchema2Json(projectSchema())

  const providerJsonSchemas = plugins
    .map((p) => {
      if (!p.configSchema) {
        return null
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let providerJsonSchema = convertSchema2Json(p.configSchema)
      if (providerJsonSchema.$defs?.providerConfig) {
        // This applies to non-Zod provider schemas
        providerJsonSchema = providerJsonSchema.$defs.providerConfig
      }

      return {
        if: {
          properties: { name: { const: p.name } },
        },
        then: providerJsonSchema,
      }
    })
    .filter(isTruthy)

  const fullJsonSchema = {
    ...baseProjectJsonSchema,
    properties: {
      ...baseProjectJsonSchema.properties,
      providers: {
        type: "array",
        items: {
          type: "object",
          required: ["name"],
          properties: {
            name: {
              type: "string",
            },
          },
          allOf: providerJsonSchemas,
        },
      },
    },
  }

  return fullJsonSchema
}

export function genJsonSchema(actionTypeDefinitions: ActionDefinitionMap, plugins: GardenPluginSpec[]) {
  const tranformOpts = {
    posixPath: "string",
    gitUrl: "string",
    uri: "string",
    environment: "string",
    sparseArray: "array",
    // TODO @eysi: Do we need to map this?
    alternatives: "object",
    actionReference: "string",
    any: "object",
    // Because template strings (need to find a way to make this boolean if value is not template string)
  }

  const projectJsonSchema = transformJson(makeProjectJsonSchema(plugins), tranformOpts)
  const actionJsonSchemas = transformJson(makeActionJsonSchemas(actionTypeDefinitions), tranformOpts)
  const workflowJsonSchema = transformJson(convertSchema2Json(workflowConfigSchema()), tranformOpts)
  const configTemplateJsonSchema = transformJson(convertSchema2Json(configTemplateSchema()), tranformOpts)
  const renderTemplateJsonSchema = transformJson(convertSchema2Json(renderTemplateConfigSchema()), tranformOpts)
  const configKinds = [
    "Project",
    "Build",
    "Deploy",
    "Run",
    "Test",
    "Workflow",
    "ConfigTemplate",
    "RenderTemplate",
    "Module",
  ]

  const jsonSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    required: ["kind", "name"],
    properties: {
      kind: {
        type: "string",
        enum: configKinds,
      },
      name: {
        type: "string",
        pattern: "^[a-z0-9-]+$",
      },
    },
    allOf: [
      {
        if: {
          properties: { kind: { const: "Project" } },
        },
        then: projectJsonSchema,
      },
      {
        if: {
          properties: { kind: { const: "Workflow" } },
        },
        then: workflowJsonSchema,
      },
      {
        if: {
          properties: { kind: { const: "ConfigTemplate" } },
        },
        then: configTemplateJsonSchema,
      },
      {
        if: {
          properties: { kind: { const: "RenderTemplate" } },
        },
        then: renderTemplateJsonSchema,
      },
      {
        // We don't validate modules
        if: {
          properties: { kind: { const: "Module" } },
        },
        then: {
          type: "object",
          additionalProperties: true,
        },
      },
      ...actionJsonSchemas,
    ],
  }

  return jsonSchema
}
