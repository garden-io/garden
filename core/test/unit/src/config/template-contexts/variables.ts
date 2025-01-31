/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { expect } from "chai"
import { VariablesContext } from "../../../../../src/config/template-contexts/variables.js"
import { parseTemplateCollection } from "../../../../../src/template/templated-collections.js"
import type { TestGarden } from "../../../../helpers.js"
import { getDataDir, makeTestGarden } from "../../../../helpers.js"
import { TestContext } from "./base.js"
import { deepResolveContext } from "../../../../../src/config/template-contexts/base.js"

/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
describe("VariablesContext", () => {
  let garden: TestGarden

  beforeEach(async () => {
    garden = await makeTestGarden(getDataDir("test-projects", "variable-crossreferences"))
  })

  afterEach(() => {
    garden.close()
  })

  describe("Project-level crossreferences", () => {
    it("resolves the test project config correctly", () => {
      expect(deepResolveContext("project + environment variables", garden.variables)).to.eql({
        environmentLevel: {
          hello: "hello world",
          suffix: "world",
        },
        projectLevel: {
          hello: "hello world",
          suffix: "world",
        },
      })
    })
  })

  describe("it encapsulates the way variables should behave across all configs", () => {
    it("enforces variable precedence", () => {
      const config = {
        variables: {
          hello: "lowest precedence",
        },
      }

      const varfile = {
        hello: "elevated precedence",
      }

      garden.variableOverrides["hello"] = "most precedence"

      const context = new TestContext({
        var: VariablesContext.forTest(garden, config.variables, varfile),
      })

      expect(context.eval("${var.hello}")).to.eql("most precedence")
    })

    it("allows for variables to reference variables from lower precedence level", () => {
      const project = parseTemplateCollection({
        value: {
          variables: {
            foo: "bar",
            fruit: "banana",
          },
        },
        source: { path: [] },
      })

      const environment = parseTemplateCollection({
        value: {
          variables: {
            foo: "${var.foo}",
            favouriteFood: "${var.fruit}",
          },
        },
        source: { path: [] },
      })

      const context = new TestContext({
        var: VariablesContext.forTest(garden, project.variables, environment.variables),
      })

      expect(context.eval("${var}")).to.eql({
        foo: "bar",
        favouriteFood: "banana",
        fruit: "banana",
      })
    })

    it("allows for variables to reference each other in the same precedence level", () => {
      const config = parseTemplateCollection({
        value: {
          variables: {
            suffix: "world",
            hello: "hello ${var.suffix}",
          },
        },
        source: { path: [] },
      })

      const context = new TestContext({
        var: VariablesContext.forTest(garden, config.variables),
      })

      expect(context.eval("${var.hello}")).to.eql("hello world")
    })

    it("for backwards-compatibility with 0.13, variables in parent context have precedence over cross-referenced variables", () => {
      const project = parseTemplateCollection({
        value: {
          variables: {
            suffix: "project",
          },
        },
        source: { path: [] },
      })
      const action = parseTemplateCollection({
        value: {
          variables: {
            suffix: "action", // <-- takes lower precedence than "project.variables.suffix" when cross-referencing in the same scope
            hello: "hello ${var.suffix}",
          },
        },
        source: { path: [] },
      })

      const context = new TestContext({
        var: VariablesContext.forTest(garden, project.variables, action.variables),
      })

      expect(context.eval("${var.hello}")).to.eql("hello project")
    })
  })
})
