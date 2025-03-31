/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  renderSchemaDescriptionYaml,
  renderConfigReference,
  renderMarkdownLink,
  sanitizeYamlStringForGitBook,
} from "../../../../src/docs/config.js"
import { expect } from "chai"
import type { JoiDescription } from "../../../../src/config/common.js"
import { joiArray, joi, joiEnvVars } from "../../../../src/config/common.js"
import { buildDependencySchema } from "../../../../src/config/module.js"
import { JoiKeyDescription } from "../../../../src/docs/joi-schema.js"
import { BaseKeyDescription, flattenSchema } from "../../../../src/docs/common.js"
import { dedent } from "../../../../src/util/string.js"

describe("docs config module", () => {
  const servicePortSchema = joi
    .number()
    .default((parent) => (parent ? parent.containerPort : undefined))
    .example("8080")
    .description("description")

  const testObject = joi
    .object()
    .keys({
      testKeyA: joi.number().required().description("key a"),
      testKeyB: joi.string().valid("b").description("key b"),
    })
    .description("test object")

  const testArray = joiArray(servicePortSchema).description("test array")

  const portSchema = () =>
    joi
      .object()
      .keys({
        containerPort: joi.number().required().description("description"),
        servicePort: servicePortSchema,
        testObject,
        testArray,
      })
      .required()

  function normalizeJoiSchemaDescription(joiDescription: JoiDescription) {
    return flattenSchema(
      new JoiKeyDescription({
        joiDescription,
        name: joiDescription.name,
        level: 0,
      })
    )
  }

  describe("sanitizeYamlStringForGitBook", () => {
    it("should remove lines that start with ```", () => {
      const yaml = dedent`
      # Example:
      #
      # \`\`\`yaml
      # scan:
      #   exclude:
      #     - node_modules/**/*
      #     - vendor/**/*
      # \`\`\`
      #
      # but our present story is ended.
    `
      const js = dedent`
      # Example:
      #
      # \`\`\`javascript
      # scan:
      #   exclude:
      #     - node_modules/**/*
      #     - vendor/**/*
      # \`\`\`
      #
      # but our present story is ended.
    `
      const empty = dedent`
      # Example:
      #
      # \`\`\`
      # scan:
      #   exclude:
      #     - node_modules/**/*
      #     - vendor/**/*
      # \`\`\`
      #
      # but our present story is ended.
    `
      const expected = dedent`
      # Example:
      #
      # scan:
      #   exclude:
      #     - node_modules/**/*
      #     - vendor/**/*
      #
      # but our present story is ended.
    `
      expect(sanitizeYamlStringForGitBook(yaml)).to.equal(expected)
      expect(sanitizeYamlStringForGitBook(js)).to.equal(expected)
      expect(sanitizeYamlStringForGitBook(empty)).to.equal(expected)
    })
  })

  describe("renderSchemaDescriptionYaml", () => {
    it("should render the yaml with the full description", () => {
      const schemaDescriptions = normalizeJoiSchemaDescription(portSchema().describe() as JoiDescription)
      const yaml = renderSchemaDescriptionYaml(schemaDescriptions, { renderRequired: true })
      expect(yaml).to.equal(dedent`
        # description
        #
        # Type: number
        #
        # Required.
        containerPort:

        # description
        #
        # Type: number
        #
        # Example: "8080"
        #
        # Optional.
        servicePort:

        # test object
        #
        # Type: object
        #
        # Optional.
        testObject:
          # key a
          #
          # Type: number
          #
          # Required.
          testKeyA:

          # key b
          #
          # Type: string
          #
          # Required.
          # Allowed values: "b"
          #
          testKeyB:

        # test array
        #
        # Type: array[number]
        #
        # Optional.
        testArray: []
      `)
    })
    it("should optionally render the yaml with a basic description", () => {
      const schemaDescriptions = normalizeJoiSchemaDescription(portSchema().describe() as JoiDescription)
      const yaml = renderSchemaDescriptionYaml(schemaDescriptions, { renderBasicDescription: true })
      expect(yaml).to.equal(dedent`
        # description
        containerPort:

        # description
        servicePort:

        # test object
        testObject:
          # key a
          testKeyA:

          # key b
          testKeyB:

        # test array
        testArray: []
      `)
    })
    it("should optionally skip the commented description above the key", () => {
      const schemaDescriptions = normalizeJoiSchemaDescription(portSchema().describe() as JoiDescription)
      const yaml = renderSchemaDescriptionYaml(schemaDescriptions, { renderFullDescription: false })
      expect(yaml).to.equal(dedent`
        containerPort:
        servicePort:
        testObject:
          testKeyA:
          testKeyB:
        testArray: []
      `)
    })
    it("should conditionally print ellipsis between object keys", () => {
      const schemaDescriptions = normalizeJoiSchemaDescription(portSchema().describe() as JoiDescription)
      const yaml = renderSchemaDescriptionYaml(schemaDescriptions, {
        renderFullDescription: false,
        renderEllipsisBetweenKeys: true,
      })
      expect(yaml).to.equal(dedent`
        containerPort:
        servicePort:
        testObject:
          ...
          testKeyA:
          ...
          testKeyB:
        testArray: []
      `)
    })

    it("should correctly render object example values", () => {
      const schema = joi.object().keys({
        env: joiEnvVars().example({
          foo: "bar",
          boo: "far",
        }),
      })
      const schemaDescriptions = normalizeJoiSchemaDescription(schema.describe() as JoiDescription)
      const yaml = renderSchemaDescriptionYaml(schemaDescriptions, {
        renderFullDescription: false,
        renderEllipsisBetweenKeys: true,
        renderValue: "example",
      })
      expect(yaml).to.equal(dedent`
        env:
            foo: bar
            boo: far
      `)
    })

    it("should correctly render object with list default", () => {
      const schema = joi
        .object()
        .keys({
          dependencies: joiArray(buildDependencySchema())
            .description("A list of modules that must be built before this module is built.")
            .example([{ name: "some-other-module-name" }]),
        })
        .default(() => ({ dependencies: [] }))
        .description("Specify how to build the module. Note that plugins may define additional keys on this object.")

      const schemaDescriptions = normalizeJoiSchemaDescription(schema.describe() as JoiDescription)
      const yaml = renderSchemaDescriptionYaml(schemaDescriptions, {
        renderFullDescription: false,
        renderValue: "default",
      })

      expect(yaml).to.eql(dedent`
        dependencies:
          - name:
            copy:
              - source:
                target:
      `)
    })

    it("should optionally convert markdown links in descriptions to plaintext", () => {
      const schema = joi.object().keys({
        dependencies: joi.string().description("Check out [some link](http://example.com)."),
      })

      const schemaDescriptions = normalizeJoiSchemaDescription(schema.describe() as JoiDescription)
      const yaml = renderSchemaDescriptionYaml(schemaDescriptions, {
        filterMarkdown: true,
        renderBasicDescription: true,
        renderValue: "none",
      })

      expect(yaml).to.eql(dedent`
        # Check out some link (http://example.com).
        dependencies:
      `)
    })

    it("should optionally convert markdown links to plaintext", () => {
      const schema = joi.object().keys({
        dependencies: joi.string().description("Check out [some link](http://example.com)."),
      })

      const schemaDescriptions = normalizeJoiSchemaDescription(schema.describe() as JoiDescription)
      const yaml = renderSchemaDescriptionYaml(schemaDescriptions, {
        filterMarkdown: true,
        renderBasicDescription: true,
        renderValue: "none",
      })

      expect(yaml).to.eql(dedent`
        # Check out some link (http://example.com).
        dependencies:
      `)
    })

    it("should set preset values on keys if provided", () => {
      const schema = joi.object().keys({
        keyA: joi.string(),
        keyB: joi.string().default("default-value"),
        keyC: joi.string(),
      })

      const schemaDescriptions = normalizeJoiSchemaDescription(schema.describe() as JoiDescription)
      const yaml = renderSchemaDescriptionYaml(schemaDescriptions, {
        filterMarkdown: true,
        presetValues: { keyC: "foo" },
        renderBasicDescription: false,
        renderFullDescription: false,
        renderValue: "default",
      })

      expect(yaml).to.eql(dedent`
        keyA:
        keyB: default-value
        keyC: foo
      `)
    })
    it("should optionally remove keys without preset values", () => {
      const schema = joi.object().keys({
        keyA: joi.string(),
        keyB: joi.string().default("default-value"),
        keyC: joi.number().example(4),
        keyD: joi.number().description("foobar"),
      })
      const schemaDescriptions = normalizeJoiSchemaDescription(schema.describe() as JoiDescription)
      const yaml = renderSchemaDescriptionYaml(schemaDescriptions, {
        renderFullDescription: false,
        presetValues: { keyA: "foo" },
        onEmptyValue: "remove",
      })
      expect(yaml).to.equal(dedent`
        keyA: foo
      `)
    })
    it("should optionally comment out keys without preset values", () => {
      const schema = joi.object().keys({
        keyA: joi.string(),
        keyB: joi.string().default("default-value"),
        keyC: joi.string(),
      })

      const schemaDescriptions = normalizeJoiSchemaDescription(schema.describe() as JoiDescription)
      const yaml = renderSchemaDescriptionYaml(schemaDescriptions, {
        onEmptyValue: "comment out",
        filterMarkdown: true,
        presetValues: { keyC: "foo" },
        renderBasicDescription: false,
        renderFullDescription: false,
        renderValue: "default",
      })

      expect(yaml).to.eql(dedent`
        # keyA:
        # keyB: default-value
        keyC: foo
      `)
    })
  })

  describe("renderConfigReference", () => {
    it("should return the correct markdown", () => {
      const { markdownReference } = renderConfigReference(portSchema())
      expect(markdownReference).to.equal(dedent`
        \n### \`containerPort\`

        description

        | Type     | Required |
        | -------- | -------- |
        | \`number\` | Yes      |

        ### \`servicePort\`

        description

        | Type     | Required |
        | -------- | -------- |
        | \`number\` | No       |

        Example:

        \`\`\`yaml
        servicePort: "8080"
        \`\`\`

        ### \`testObject\`

        test object

        | Type     | Required |
        | -------- | -------- |
        | \`object\` | No       |

        ### \`testObject.testKeyA\`

        [testObject](#testobject) > testKeyA

        key a

        | Type     | Required |
        | -------- | -------- |
        | \`number\` | Yes      |

        ### \`testObject.testKeyB\`

        [testObject](#testobject) > testKeyB

        key b

        | Type     | Allowed Values | Required |
        | -------- | -------------- | -------- |
        | \`string\` | "b"            | Yes      |

        ### \`testArray[]\`

        test array

        | Type            | Default | Required |
        | --------------- | ------- | -------- |
        | \`array[number]\` | \`[]\`    | No       |\n
      `)
    })
    it("should return the correct yaml", () => {
      const { yaml } = renderConfigReference(portSchema())
      expect(yaml).to.equal(dedent`
        # description
        containerPort:

        # description
        servicePort:

        # test object
        testObject:
          # key a
          testKeyA:

          # key b
          testKeyB:

        # test array
        testArray: []
      `)
    })
  })

  describe("renderMarkdownLink", () => {
    it("should return a markdown link with a name and relative path", () => {
      class TestKeyDescription extends BaseKeyDescription {
        override deprecated = false
        override deprecationMessage = undefined
        override experimental = false
        override required = false
        override internal = false
        override description?: string
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        override example?: any
        override type = "string"

        constructor(name: string, level: number) {
          super(name, level)
        }

        override fullKey() {
          return "happy.families[].are.all[].alike"
        }

        getChildren() {
          return []
        }
        getDefaultValue() {
          return undefined
        }
        formatExample() {
          return undefined
        }
        formatAllowedValues() {
          return undefined
        }
      }

      const alike = new TestKeyDescription("alike", 5)

      expect(renderMarkdownLink(alike)).to.equal(`[alike](#happyfamiliesareallalike)`)
    })
  })
})
