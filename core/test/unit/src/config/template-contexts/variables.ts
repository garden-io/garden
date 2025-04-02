/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
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
import { resolveAction } from "../../../../../src/graph/actions.js"

describe("varfiles", () => {
  let garden: TestGarden

  beforeEach(async () => {
    garden = await makeTestGarden(getDataDir("test-projects", "varfiles-with-templates"))
  })

  afterEach(() => {
    garden.close()
  })

  it("should parse template strings in varfiles", async () => {
    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const runAction = graph.getRun("echo")

    const varContext = runAction.getVariablesContext()
    const output = varContext.resolve({
      nodePath: [],
      key: [],
      opts: {},
      rootContext: garden.getProjectConfigContext(),
    })

    expect(output).to.eql({
      found: true,
      resolved: {
        ACTION_VAR: "varfiles-with-templates",
        ENV_VAR: "varfiles-with-templates",
        PROJECT_VAR: "varfiles-with-templates",
      },
    })
  })
})

describe("VariablesContext", () => {
  let garden: TestGarden

  beforeEach(async () => {
    garden = await makeTestGarden(getDataDir("test-projects", "variable-crossreferences"))
  })

  afterEach(() => {
    garden.close()
  })

  describe("General overview", () => {
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
        var: VariablesContext.forTest({ garden, variablePrecedence: [config.variables, varfile] }),
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
        var: VariablesContext.forTest({ garden, variablePrecedence: [project.variables, environment.variables] }),
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
        var: VariablesContext.forTest({ garden, variablePrecedence: [config.variables] }),
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
        var: VariablesContext.forTest({ garden, variablePrecedence: [project.variables, action.variables] }),
      })

      expect(context.eval("${var.hello}")).to.eql("hello project")
    })

    /**
     * @see ContextResolveOpts.isFinalContext
     */
    describe("ContextResolveOpts.isFinalContext", () => {
      describe("variables.$merge is unresolvable", () => {
        const action = parseTemplateCollection({
          value: {
            variables: {
              $merge: "${actions.build.foobar.var}",
              hello: "world, I am here!",
            },
          },
          source: { path: [] },
        })

        let finalContext: TestContext
        let incompleteContext: TestContext

        beforeEach(() => {
          finalContext = new TestContext({
            var: VariablesContext.forTest({ garden, variablePrecedence: [action.variables] }), // <-- isFinalContext defaults to true
          })

          incompleteContext = new TestContext({
            var: VariablesContext.forTest({ garden, variablePrecedence: [action.variables], isFinalContext: false }), // <-- we indicate partial context
          })
        })

        it("given a final context, a $merge operation in variables causes lookup to fail", () => {
          expect(() => finalContext.eval("${var.hello}")).to.throw("Could not find key") // <-- resolving hello fails
        })

        it("given an incomplete context, we ignore unresolvable $merge operators", () => {
          expect(incompleteContext.eval("${var.hello}")).to.eql("world, I am here!") // <-- resolving works in incompleteContext
          expect(() => finalContext.eval("${var.doesNotExist}")).to.throw("Could not find key") // <-- will fail on non-existent keys
        })

        it("does not ignore resolvable $merge operations", () => {
          expect(incompleteContext.eval("${var.hello}")).to.eql("world, I am here!") // <-- resolving works in incompleteContext
        })
      })

      describe("variables.$merge is resolvable but contains unresolvable keys", () => {
        const action = parseTemplateCollection({
          value: {
            variables: {
              $merge: {
                resolvable: "yes, I can be resolved.",
                unresolvable: "${actions.build.foobar.outputs}",
              },
              hello: "world, I am here!",
            },
          },
          source: { path: [] },
        })

        let finalContext: TestContext
        let incompleteContext: TestContext

        beforeEach(() => {
          finalContext = new TestContext({
            var: VariablesContext.forTest({ garden, variablePrecedence: [action.variables] }), // <-- isFinalContext defaults to true
          })

          incompleteContext = new TestContext({
            var: VariablesContext.forTest({ garden, variablePrecedence: [action.variables], isFinalContext: false }), // <-- we indicate partial context
          })
        })

        it("will not fail when variables.$merge merely contains unresolvable keys, but all keys are known", () => {
          expect(finalContext.eval("${var.hello}")).to.eql("world, I am here!")
          expect(incompleteContext.eval("${var.hello}")).to.eql("world, I am here!")

          expect(finalContext.eval("${var.resolvable}")).to.eql("yes, I can be resolved.")
          expect(incompleteContext.eval("${var.resolvable}")).to.eql("yes, I can be resolved.")
        })

        it("should fail to resolve var.unresolvable even in the incompleteContext", () => {
          expect(() => finalContext.eval("${var.unresolvable}")).to.throw("Could not find key")
          expect(() => incompleteContext.eval("${var.unresolvable}")).to.throw("Could not find key")
        })
      })
    })
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

  describe("Action-level crossreferences", () => {
    it("resolves the test action variables correctly", async () => {
      const graph = await garden.getResolvedConfigGraph({ log: garden.log, emit: false })

      const dummy = await resolveAction({
        garden,
        graph,
        action: graph.getActionByRef("build.test-1-dummy"),
        log: garden.log,
      })
      expect(dummy.getResolvedVariables()).to.eql({
        composeImageName: "busybox",
        env: {
          DT: "test-1",
          FOO0: "bar0",
        },
        environmentLevel: {
          hello: "hello world",
          suffix: "world",
        },
        foo0: "bar0",
        projectLevel: {
          hello: "hello world",
          suffix: "world",
        },
      })

      const container = await resolveAction({
        garden,
        graph,
        action: graph.getActionByRef("deploy.test-1-container"),
        log: garden.log,
      })
      expect(container.getConfig().dependencies).to.eql([{ kind: "Build", name: "test-1-dummy" }])
      expect(container.getResolvedVariables()).to.eql({
        dependencies: ["build.test-1-dummy"],
        composeImageName: "busybox",
        env: {
          DT: "test-1",
          FOO0: "bar0",
        },
        environmentLevel: {
          hello: "hello world",
          suffix: "world",
        },
        foo0: "bar0",
        projectLevel: {
          hello: "hello world",
          suffix: "world",
        },
      })

      const standalone = await resolveAction({
        garden,
        graph,
        action: graph.getActionByRef("deploy.standalone-container"),
        log: garden.log,
      })
      expect(standalone.getConfig().dependencies).to.eql([{ kind: "Build", name: "test-1-dummy" }])
      expect(standalone.getResolvedVariables()).to.eql({
        dependencies: ["build.test-1-dummy"],
        composeImageName: "busybox",
        env: {
          DT: "test-1",
          FOO0: "bar0",
        },
        environmentLevel: {
          hello: "hello world",
          suffix: "world",
        },
        foo0: "bar0",
        projectLevel: {
          hello: "hello world",
          suffix: "world",
        },
      })
    })
  })
})
