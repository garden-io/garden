import {
  renderSchemaDescriptionYaml,
  getDefaultValue,
  normalizeDescriptions,
  renderConfigReference,
  NormalizedDescription,
  renderMarkdownLink,
  sanitizeYamlStringForGitBook,
} from "../../../../src/docs/config"
import { expect } from "chai"
import dedent = require("dedent")
import { joiArray, joi, joiEnvVars } from "../../../../src/config/common"

describe("config", () => {
  const servicePortSchema = joi
    .number()
    .default((context) => context.containerPort, "<same as containerPort>")
    .example("8080")
    .description("description")

  const testDefaultSchema = joi
    .number()
    .default(() => "result", "default value")
    .description("description")

  const testObject = joi
    .object()
    .keys({
      testKeyA: joi
        .number()
        .required()
        .description("key a"),
      testKeyB: joi
        .string()
        .only("b")
        .description("key b"),
    })
    .description("test object")

  const testArray = joiArray(servicePortSchema).description("test array")

  const portSchema = joi
    .object()
    .keys({
      containerPort: joi
        .number()
        .required()
        .description("description"),
      servicePort: servicePortSchema,
      testObject,
      testArray,
    })
    .required()

  describe("sanitizeYamlStringForGitBook", () => {
    it("should remove lines that start with ```", () => {
      const yaml = dedent`
      # Example:
      #
      # \`\`\`yaml
      # modules:
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
      # modules:
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
      # modules:
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
      # modules:
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
      const schemaDescriptions = normalizeDescriptions(portSchema.describe())
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
    it("should optionally render the yaml with a basic description", () => {
      const schemaDescriptions = normalizeDescriptions(portSchema.describe())
      const yaml = renderSchemaDescriptionYaml(schemaDescriptions, { renderBasicDescription: true })
      expect(yaml).to.equal(dedent`
        # description
        containerPort:

        # description
        servicePort: <same as containerPort>

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
      const schemaDescriptions = normalizeDescriptions(portSchema.describe())
      const yaml = renderSchemaDescriptionYaml(schemaDescriptions, { renderFullDescription: false })
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
      const yaml = renderSchemaDescriptionYaml(schemaDescriptions, {
        renderFullDescription: false,
        renderEllipsisBetweenKeys: true,
      })
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
      const schema = joi.object().keys({
        env: joiEnvVars().example({
          foo: "bar",
          boo: "far",
        }),
      })
      const schemaDescriptions = normalizeDescriptions(schema.describe())
      const yaml = renderSchemaDescriptionYaml(schemaDescriptions, {
        renderFullDescription: false,
        renderEllipsisBetweenKeys: true,
        useExampleForValue: true,
      })
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
        # description
        containerPort:

        # description
        servicePort: <same as containerPort>

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
      const happy: NormalizedDescription = {
        name: "happy",
        level: 0,
        required: false,
        hasChildren: true,
        formattedName: "happy",
        formattedType: "string",
      }
      const families: NormalizedDescription = {
        name: "families",
        level: 0,
        required: false,
        hasChildren: true,
        formattedName: "families[]",
        formattedType: "array",
        parent: happy,
      }
      const are: NormalizedDescription = {
        name: "happy",
        level: 0,
        required: false,
        hasChildren: true,
        formattedName: "are",
        formattedType: "string",
        parent: families,
      }
      const all: NormalizedDescription = {
        name: "all",
        level: 0,
        required: false,
        hasChildren: true,
        formattedName: "all[]",
        formattedType: "array",
        parent: are,
      }
      const alike: NormalizedDescription = {
        name: "alike",
        level: 0,
        required: false,
        hasChildren: false,
        formattedName: "alike",
        formattedType: "string",
        parent: all,
      }

      expect(renderMarkdownLink(alike)).to.equal(`[alike](#happyfamiliesareallalike)`)
    })
  })
})
