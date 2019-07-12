import {
  renderSchemaDescriptionYaml,
  getDefaultValue,
  normalizeDescriptions,
  renderConfigReference,
} from "../../../../src/docs/config"
import { expect } from "chai"
import dedent = require("dedent")
import { joiArray, joi, joiEnvVars } from "../../../../src/config/common"

describe("config", () => {
  const servicePortSchema = joi.number().default((context) => context.containerPort, "<same as containerPort>")
    .example("8080")
    .description("description")

  const testDefaultSchema = joi.number().default(() => "result", "default value")
    .description("description")

  const testObject = joi.object()
    .keys({
      testKeyA: joi.number()
        .required()
        .description("key a"),
      testKeyB: joi.string()
        .only("b")
        .description("key b"),
    })
    .description("test object")

  const testArray = joiArray(servicePortSchema)
    .description("test array")

  const portSchema = joi.object()
    .keys({
      containerPort: joi.number()
        .required()
        .description("description"),
      servicePort: servicePortSchema,
      testObject,
      testArray,
    })
    .required()

  describe("renderSchemaDescriptionYaml", () => {
    it("should render correct yaml", () => {
      const schemaDescriptions = normalizeDescriptions(portSchema.describe())
      const yaml = renderSchemaDescriptionYaml(schemaDescriptions, { showRequired: true })
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
        servicePort: <same as containerPort>

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
    it("should conditionally skip the commented description above the key", () => {
      const schemaDescriptions = normalizeDescriptions(portSchema.describe())
      const yaml = renderSchemaDescriptionYaml(schemaDescriptions, { showComment: false })
      expect(yaml).to.equal(dedent`
        containerPort:
        servicePort: <same as containerPort>
        testObject:
          testKeyA:
          testKeyB:
        testArray: []
      `)
    })
    it("should conditionally print ellipsis between object keys", () => {
      const schemaDescriptions = normalizeDescriptions(portSchema.describe())
      const yaml = renderSchemaDescriptionYaml(
        schemaDescriptions,
        { showComment: false, showEllipsisBetweenKeys: true },
      )
      expect(yaml).to.equal(dedent`
        containerPort:
        servicePort: <same as containerPort>
        testObject:
          ...
          testKeyA:
          ...
          testKeyB:
        testArray: []
      `)
    })

    it("should correctly render object example values", () => {
      const schema = joi.object()
        .keys({
          env: joiEnvVars()
            .example({
              foo: "bar",
              boo: "far",
            }),
        })
      const schemaDescriptions = normalizeDescriptions(schema.describe())
      const yaml = renderSchemaDescriptionYaml(
        schemaDescriptions,
        { showComment: false, showEllipsisBetweenKeys: true, useExampleForValue: true },
      )
      expect(yaml).to.equal(dedent`
        env:
            foo: bar
            boo: far
      `)
    })
  })

  describe("getDefaultValue", () => {
    it("should get the default return of the function over the param", () => {
      const value = getDefaultValue(testDefaultSchema.describe())
      expect(value).to.eq("result")
    })

    it("should get the default value of a function with context", () => {
      const value = getDefaultValue(servicePortSchema.describe())
      expect(value).to.eq("<same as containerPort>")
    })
  })

  describe("generateConfigReference", () => {
    it("should return the correct markdown", () => {
      const { markdownReference } = renderConfigReference(portSchema)
      expect(markdownReference).to.equal(dedent`
        \n### \`containerPort\`

        description

        | Type     | Required |
        | -------- | -------- |
        | \`number\` | Yes      |

        ### \`servicePort\`

        description

        | Type     | Required | Default                     |
        | -------- | -------- | --------------------------- |
        | \`number\` | No       | \`"<same as containerPort>"\` |

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

        | Type     | Required | Allowed Values |
        | -------- | -------- | -------------- |
        | \`string\` | Yes      | "b"            |

        ### \`testArray\`

        test array

        | Type            | Required | Default |
        | --------------- | -------- | ------- |
        | \`array[number]\` | No       | \`[]\`    |\n
      `)
    })
    it("should return the correct yaml", () => {
      const { yaml } = renderConfigReference(portSchema)
      expect(yaml).to.equal(dedent`
        containerPort:
        servicePort: <same as containerPort>
        testObject:
          testKeyA:
          testKeyB:
        testArray: []
      `)
    })
  })

})
