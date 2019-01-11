import { renderSchemaDescription, getDefaultValue } from "../../../src/docs/config"
import { expect } from "chai"
import * as Joi from "joi"
import dedent = require("dedent")

describe("config", () => {
  const serivcePortSchema = Joi.number().default((context) => context.containerPort, "default value")
    .example("8080")
    .description("description")

  const testDefaultSchema = Joi.number().default(() => "result", "default value")
    .description("description")

  const portSchema = Joi.object()
    .keys({
      containerPort: Joi.number()
        .required()
        .description("description"),
      servicePort: serivcePortSchema,
    })
    .required()

  describe("renderSchemaDescription", () => {
    it("should render correct markdown", () => {
      const yaml = renderSchemaDescription(portSchema.describe(), { required: true })
      expect(yaml).to.equal(dedent`\n# description
        #
        # Required.
        containerPort:

        # description
        #
        # Example: "8080"
        #
        # Optional.
        servicePort: default value`)
    })
  })

  describe("renderSchemaDescription", () => {
    it("should get the default return of the function over the param", () => {
      const value = getDefaultValue(testDefaultSchema.describe())
      expect(value).to.eq("result")
    })

    it("should get the default value if a function with context", () => {
      const value = getDefaultValue(serivcePortSchema.describe())
      expect(value).to.eq("default value")
    })
  })
})
