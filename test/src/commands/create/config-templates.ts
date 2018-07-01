import { expect } from "chai"

import {
  projectTemplate,
  moduleTemplate,
} from "../../../../src/commands/create/config-templates"
import { validate } from "../../../../src/types/common"
import { baseModuleSpecSchema } from "../../../../src/types/module"
import { projectSchema } from "../../../../src/types/project"

describe("ConfigTemplates", () => {
  describe("projectTemplate", () => {
    it("should be valid for all module types", async () => {
      const config = projectTemplate("my-project", ["container", "function", "npm-package"])
      expect(() => validate(config, projectSchema)).to.not.throw()
    })
  })
  describe("moduleTemplate", () => {
    it("should be valid", async () => {
      const config = moduleTemplate("my-module", "container")
      expect(() => validate(config, baseModuleSpecSchema)).to.not.throw()
    })
  })
})
