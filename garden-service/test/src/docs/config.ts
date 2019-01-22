import {
  renderSchemaDescriptionYaml,
  getDefaultValue,
  normalizeDescriptions,
  renderConfigReference,
} from "../../../src/docs/config"
import { expect } from "chai"
import * as Joi from "joi"
import dedent = require("dedent")
import { joiArray } from "../../../src/config/common"

describe("config", () => {
  const serivcePortSchema = Joi.number().default((context) => context.containerPort, "default value")
    .example("8080")
    .description("description")

  const testDefaultSchema = Joi.number().default(() => "result", "default value")
    .description("description")

  const testObject = Joi.object()
    .keys({
      testKeyA: Joi.number()
        .required()
        .description("key a"),
      testKeyB: Joi.string()
        .only("b")
        .description("key b"),
    })
    .description("test object")

  const testArray = joiArray(serivcePortSchema)
    .description("test array")

  const portSchema = Joi.object()
    .keys({
      containerPort: Joi.number()
        .required()
        .description("description"),
      servicePort: serivcePortSchema,
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
        servicePort: default value

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
        testArray:
          []
      `)
    })
  })

  describe("renderSchemaDescriptionYaml", () => {
    it("should get the default return of the function over the param", () => {
      const value = getDefaultValue(testDefaultSchema.describe())
      expect(value).to.eq("result")
    })

    it("should get the default value of a function with context", () => {
      const value = getDefaultValue(serivcePortSchema.describe())
      expect(value).to.eq("default value")
    })
  })

  describe("generateConfigReference", () => {
    it("should get the default return of the function over the param", () => {
      const res = renderConfigReference(portSchema)
      expect(res).to.equal(dedent`
        ### \`containerPort\`

        description

        | Type | Required |
        | ---- | -------- |
        | \`number\` | Yes
        ### \`servicePort\`

        description

        | Type | Required |
        | ---- | -------- |
        | \`number\` | No

        Example:
        \`\`\`yaml
        servicePort: "8080"
        \`\`\`
        ### \`testObject\`

        test object

        | Type | Required |
        | ---- | -------- |
        | \`object\` | No
        ### \`testObject.testKeyA\`
        [testObject](#testobject) > testKeyA

        key a

        | Type | Required |
        | ---- | -------- |
        | \`number\` | Yes
        ### \`testObject.testKeyB\`
        [testObject](#testobject) > testKeyB

        key b

        | Type | Required | Allowed Values |
        | ---- | -------- | -------------- |
        | \`string\` | Yes | "b"
        ### \`testArray\`

        test array

        | Type | Required |
        | ---- | -------- |
        | \`array[number]\` | No

        ## Complete schema
        \`\`\`yaml
        containerPort:

        servicePort: default value

        testObject:
          testKeyA:

          testKeyB:

        testArray:
          []
        \`\`\`
      `)
    })
  })

})
