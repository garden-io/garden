/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import {
  ConfigContext,
  ContextKey,
  ContextResolveParams,
  schema,
  ProjectConfigContext,
  ModuleConfigContext,
  ProviderConfigContext,
  WorkflowConfigContext,
  WorkflowStepConfigContext,
  ScanContext,
  PassthroughContext,
} from "../../../../src/config/config-context"
import { expectError, makeTestGardenA, TestGarden, projectRootA, makeTestGarden } from "../../../helpers"
import { join } from "path"
import { joi } from "../../../../src/config/common"
import { prepareRuntimeContext } from "../../../../src/runtime-context"
import { Service } from "../../../../src/types/service"
import stripAnsi = require("strip-ansi")
import { resolveTemplateString, resolveTemplateStrings } from "../../../../src/template-string"
import { keyBy } from "lodash"

type TestValue = string | ConfigContext | TestValues | TestValueFunction
type TestValueFunction = () => TestValue | Promise<TestValue>
interface TestValues {
  [key: string]: TestValue
}

describe("ConfigContext", () => {
  class TestContext extends ConfigContext {
    constructor(obj: TestValues, root?: ConfigContext) {
      super(root)
      this.addValues(obj)
    }

    addValues(obj: TestValues) {
      Object.assign(this, obj)
    }
  }

  describe("resolve", () => {
    // just a shorthand to aid in testing
    function resolveKey(c: ConfigContext, key: ContextKey) {
      return c.resolve({ key, nodePath: [], opts: {} })
    }

    it("should resolve simple keys", async () => {
      const c = new TestContext({ basic: "value" })
      expect(resolveKey(c, ["basic"])).to.eql({ resolved: "value" })
    })

    it("should throw on missing key", async () => {
      const c = new TestContext({})
      await expectError(() => resolveKey(c, ["basic"]), "configuration")
    })

    it("should throw when looking for nested value on primitive", async () => {
      const c = new TestContext({ basic: "value" })
      await expectError(() => resolveKey(c, ["basic", "nested"]), "configuration")
    })

    it("should resolve nested keys", async () => {
      const c = new TestContext({ nested: { key: "value" } })
      expect(resolveKey(c, ["nested", "key"])).eql({ resolved: "value" })
    })

    it("should resolve keys on nested contexts", async () => {
      const c = new TestContext({
        nested: new TestContext({ key: "value" }),
      })
      expect(resolveKey(c, ["nested", "key"])).eql({ resolved: "value" })
    })

    it("should throw on missing key on nested context", async () => {
      const c = new TestContext({
        nested: new TestContext({ key: "value" }),
      })
      await expectError(() => resolveKey(c, ["nested", "bla"]), "configuration")
    })

    it("should resolve keys with value behind callable", async () => {
      const c = new TestContext({ basic: () => "value" })
      expect(resolveKey(c, ["basic"])).to.eql({ resolved: "value" })
    })

    it("should resolve keys on nested contexts where context is behind callable", async () => {
      const c = new TestContext({
        nested: () => new TestContext({ key: "value" }),
      })
      expect(resolveKey(c, ["nested", "key"])).to.eql({ resolved: "value" })
    })

    it("should cache resolved values", async () => {
      const nested: any = new TestContext({ key: "value" })
      const c = new TestContext({
        nested,
      })
      resolveKey(c, ["nested", "key"])

      nested.key = "foo"

      expect(resolveKey(c, ["nested", "key"])).to.eql({ resolved: "value" })
    })

    it("should throw if resolving a key that's already in the lookup stack", async () => {
      const c = new TestContext({
        nested: new TestContext({ key: "value" }),
      })
      const key = ["nested", "key"]
      const stack = [key.join(".")]
      await expectError(() => c.resolve({ key, nodePath: [], opts: { stack } }), "configuration")
    })

    it("should detect a circular reference from a nested context", async () => {
      class NestedContext extends ConfigContext {
        async resolve({ key, nodePath, opts }: ContextResolveParams) {
          const circularKey = nodePath.concat(key)
          opts.stack!.push(circularKey.join("."))
          return c.resolve({ key: circularKey, nodePath: [], opts })
        }
      }
      const c = new TestContext({
        nested: new NestedContext(),
      })
      await expectError(async () => resolveKey(c, ["nested", "bla"]), "configuration")
    })

    it("should show helpful error when unable to resolve nested key in map", async () => {
      class Context extends ConfigContext {
        nested: Map<string, string>

        constructor(parent?: ConfigContext) {
          super(parent)
          this.nested = new Map()
        }
      }
      const c = new Context()
      await expectError(
        () => resolveKey(c, ["nested", "bla"]),
        (err) => expect(stripAnsi(err.message)).to.equal("Could not find key bla under nested.")
      )
    })

    it("should show helpful error when unable to resolve nested key in object", async () => {
      class Context extends ConfigContext {
        nested: any

        constructor(parent?: ConfigContext) {
          super(parent)
          this.nested = {}
        }
      }
      const c = new Context()
      await expectError(
        () => resolveKey(c, ["nested", "bla"]),
        (err) => expect(stripAnsi(err.message)).to.equal("Could not find key bla under nested.")
      )
    })

    it("should show helpful error when unable to resolve two-level nested key in object", async () => {
      class Context extends ConfigContext {
        nested: any

        constructor(parent?: ConfigContext) {
          super(parent)
          this.nested = { deeper: {} }
        }
      }
      const c = new Context()
      await expectError(
        () => resolveKey(c, ["nested", "deeper", "bla"]),
        (err) => expect(stripAnsi(err.message)).to.equal("Could not find key bla under nested.deeper.")
      )
    })

    it("should show helpful error when unable to resolve in nested context", async () => {
      class Nested extends ConfigContext {}
      class Context extends ConfigContext {
        nested: ConfigContext

        constructor(parent?: ConfigContext) {
          super(parent)
          this.nested = new Nested(this)
        }
      }
      const c = new Context()
      await expectError(
        () => resolveKey(c, ["nested", "bla"]),
        (err) => expect(stripAnsi(err.message)).to.equal("Could not find key bla under nested.")
      )
    })

    it("should resolve template strings", async () => {
      const c = new TestContext({
        foo: "value",
      })
      const nested: any = new TestContext({ key: "${foo}" }, c)
      c.addValues({ nested })
      expect(resolveKey(c, ["nested", "key"])).to.eql({ resolved: "value" })
    })

    it("should resolve template strings with nested context", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested: any = new TestContext({ key: "${nested.foo}", foo: "value" }, c)
      c.addValues({ nested })
      expect(resolveKey(c, ["nested", "key"])).to.eql({ resolved: "value" })
    })

    it("should detect a self-reference when resolving a template string", async () => {
      const c = new TestContext({ key: "${key}" })
      await expectError(() => resolveKey(c, ["key"]), "template-string")
    })

    it("should detect a nested self-reference when resolving a template string", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested = new TestContext({ key: "${nested.key}" }, c)
      c.addValues({ nested })
      await expectError(() => resolveKey(c, ["nested", "key"]), "template-string")
    })

    it("should detect a circular reference when resolving a template string", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested: any = new TestContext({ key: "${nested.foo}", foo: "${nested.key}" }, c)
      c.addValues({ nested })
      await expectError(() => resolveKey(c, ["nested", "key"]), "template-string")
    })

    it("should detect a circular reference when resolving a nested template string", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested: any = new TestContext({ key: "${nested.foo}", foo: "${'${nested.key}'}" }, c)
      c.addValues({ nested })
      await expectError(() => resolveKey(c, ["nested", "key"]), "template-string")
    })

    it("should detect a circular reference when nested template string resolves to self", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested: any = new TestContext({ key: "${'${nested.key}'}" }, c)
      c.addValues({ nested })
      await expectError(
        () => resolveKey(c, ["nested", "key"]),
        (err) =>
          expect(err.message).to.equal(
            "Invalid template string ${'${nested.key}'}: Invalid template string ${nested.key}: Circular reference detected when resolving key nested.key (nested -> nested.key)"
          )
      )
    })
  })

  describe("getSchema", () => {
    it("should return a Joi object schema with all described attributes", () => {
      class Nested extends ConfigContext {
        @schema(joi.string().description("Nested description"))
        nestedKey: string
      }

      class Context extends ConfigContext {
        @schema(joi.string().description("Some description"))
        key: string

        @schema(Nested.getSchema().description("A nested context"))
        nested: Nested

        // this should simply be ignored
        foo = "bar"
      }

      const contextSchema = Context.getSchema()
      const description = contextSchema.describe()

      expect(description).to.eql({
        type: "object",
        flags: { presence: "required" },
        keys: {
          key: { type: "string", flags: { description: "Some description" } },
          nested: {
            type: "object",
            flags: { presence: "required", description: "A nested context" },
            keys: { nestedKey: { type: "string", flags: { description: "Nested description" } } },
          },
        },
      })
    })
  })
})

describe("ProjectConfigContext", () => {
  it("should resolve local env variables", () => {
    process.env.TEST_VARIABLE = "value"
    const c = new ProjectConfigContext({
      projectName: "some-project",
      artifactsPath: "/tmp",
      username: "some-user",
      secrets: {},
    })
    expect(c.resolve({ key: ["local", "env", "TEST_VARIABLE"], nodePath: [], opts: {} })).to.eql({
      resolved: "value",
    })
    delete process.env.TEST_VARIABLE
  })

  it("should resolve secrets", () => {
    const c = new ProjectConfigContext({
      projectName: "some-project",
      artifactsPath: "/tmp",
      username: "some-user",
      secrets: { foo: "banana" },
    })
    expect(c.resolve({ key: ["secrets", "foo"], nodePath: [], opts: {} })).to.eql({
      resolved: "banana",
    })
  })

  it("should throw helpful error when resolving missing env variable", () => {
    const c = new ProjectConfigContext({
      projectName: "some-project",
      artifactsPath: "/tmp",
      username: "some-user",
      secrets: {},
    })
    const key = "fiaogsyecgbsjyawecygaewbxrbxajyrgew"

    expectError(
      () => c.resolve({ key: ["local", "env", key], nodePath: [], opts: {} }),
      (err) =>
        expect(stripAnsi(err.message)).to.match(
          /Could not find key fiaogsyecgbsjyawecygaewbxrbxajyrgew under local.env. Available keys: /
        )
    )
  })

  it("should resolve the local platform", () => {
    const c = new ProjectConfigContext({
      projectName: "some-project",
      artifactsPath: "/tmp",
      username: "some-user",
      secrets: {},
    })
    expect(c.resolve({ key: ["local", "platform"], nodePath: [], opts: {} })).to.eql({
      resolved: process.platform,
    })
  })
})

describe("ProviderConfigContext", () => {
  it("should set an empty namespace and environment.fullName to environment.name if no namespace is set", async () => {
    const garden = await makeTestGarden(projectRootA, { environmentName: "local" })
    const c = new ProviderConfigContext(garden, await garden.resolveProviders(garden.log))

    expect(c.resolve({ key: ["environment", "name"], nodePath: [], opts: {} })).to.eql({ resolved: "local" })
  })

  it("should set environment.namespace and environment.fullName to properly if namespace is set", async () => {
    const garden = await makeTestGarden(projectRootA, { environmentName: "foo.local" })
    const c = new ProviderConfigContext(garden, await garden.resolveProviders(garden.log))

    expect(c.resolve({ key: ["environment", "name"], nodePath: [], opts: {} })).to.eql({ resolved: "local" })
    expect(c.resolve({ key: ["environment", "namespace"], nodePath: [], opts: {} })).to.eql({ resolved: "foo" })
    expect(c.resolve({ key: ["environment", "fullName"], nodePath: [], opts: {} })).to.eql({ resolved: "foo.local" })
  })
})

describe("ModuleConfigContext", () => {
  let garden: TestGarden
  let c: ModuleConfigContext

  before(async () => {
    garden = await makeTestGardenA()
    garden["secrets"] = { someSecret: "someSecretValue" }
    const graph = await garden.getConfigGraph(garden.log)
    const modules = graph.getModules()

    c = new ModuleConfigContext({
      garden,
      resolvedProviders: keyBy(await garden.resolveProviders(garden.log), "name"),
      dependencies: modules,
    })
  })

  it("should resolve local env variables", async () => {
    process.env.TEST_VARIABLE = "foo"
    expect(c.resolve({ key: ["local", "env", "TEST_VARIABLE"], nodePath: [], opts: {} })).to.eql({
      resolved: "foo",
    })
    delete process.env.TEST_VARIABLE
  })

  it("should resolve the local platform", async () => {
    expect(c.resolve({ key: ["local", "platform"], nodePath: [], opts: {} })).to.eql({
      resolved: process.platform,
    })
  })

  it("should resolve the environment config", async () => {
    expect(c.resolve({ key: ["environment", "name"], nodePath: [], opts: {} })).to.eql({
      resolved: garden.environmentName,
    })
  })

  it("should resolve the path of a module", async () => {
    const path = join(garden.projectRoot, "module-a")
    expect(c.resolve({ key: ["modules", "module-a", "path"], nodePath: [], opts: {} })).to.eql({ resolved: path })
  })

  it("should should resolve the version of a module", async () => {
    const config = await garden.resolveModule("module-a")
    const { versionString } = await garden.resolveVersion(config, [])
    expect(c.resolve({ key: ["modules", "module-a", "version"], nodePath: [], opts: {} })).to.eql({
      resolved: versionString,
    })
  })

  it("should resolve the outputs of a module", async () => {
    expect(c.resolve({ key: ["modules", "module-a", "outputs", "foo"], nodePath: [], opts: {} })).to.eql({
      resolved: "bar",
    })
  })

  it("should resolve a project variable", async () => {
    expect(c.resolve({ key: ["variables", "some"], nodePath: [], opts: {} })).to.eql({ resolved: "variable" })
  })

  it("should resolve a project variable under the var alias", async () => {
    expect(c.resolve({ key: ["var", "some"], nodePath: [], opts: {} })).to.eql({ resolved: "variable" })
  })

  context("secrets", () => {
    it("should resolve a secret", async () => {
      expect(c.resolve({ key: ["secrets", "someSecret"], nodePath: [], opts: {} })).to.eql({
        resolved: "someSecretValue",
      })
    })

    it("should throw when resolving a secret with a missing key", async () => {
      await expectError(
        () => c.resolve({ key: ["secrets", "missingSecret"], nodePath: [], opts: {} }),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            "Could not find key missingSecret under secrets. Available keys: someSecret."
          )
      )
    })
  })

  context("runtimeContext is not set", () => {
    it("should return runtime template strings unchanged if allowPartial=true", async () => {
      expect(
        c.resolve({ key: ["runtime", "some", "key.with.dots"], nodePath: [], opts: { allowPartial: true } })
      ).to.eql({
        resolved: '${runtime.some["key.with.dots"]}',
      })
    })

    it("should throw if resolving missing runtime key with allowPartial=false", async () => {
      await expectError(
        () => c.resolve({ key: ["runtime", "some", "key"], nodePath: [], opts: {} }),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            "Could not find key some under runtime. Available keys: services and tasks."
          )
      )
    })

    it("should allow using a missing runtime key as a test in a conditional", async () => {
      const result = resolveTemplateString("${runtime.foo || 'default'}", c)
      expect(result).to.equal("default")
    })

    it("should allow using a missing runtime key as a test in a ternary (negative)", async () => {
      const result = resolveTemplateString("${runtime.foo ? runtime.foo.bar : 'default'}", c)
      expect(result).to.equal("default")
    })
  })

  context("runtimeContext is set", () => {
    let withRuntime: ModuleConfigContext
    let serviceA: Service

    before(async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const modules = graph.getModules()
      serviceA = graph.getService("service-a")
      const serviceB = graph.getService("service-b")
      const taskB = graph.getTask("task-b")

      const runtimeContext = await prepareRuntimeContext({
        garden,
        graph,
        dependencies: {
          build: [],
          deploy: [serviceB],
          run: [taskB],
          test: [],
        },
        version: serviceA.module.version,
        serviceStatuses: {
          "service-b": {
            state: "ready",
            outputs: { foo: "bar" },
            detail: {},
          },
        },
        taskResults: {
          "task-b": {
            moduleName: "module-b",
            taskName: "task-b",
            command: [],
            outputs: { moo: "boo" },
            success: true,
            version: taskB.module.version.versionString,
            startedAt: new Date(),
            completedAt: new Date(),
            log: "boo",
          },
        },
      })

      withRuntime = new ModuleConfigContext({
        garden,
        resolvedProviders: keyBy(await garden.resolveProviders(garden.log), "name"),
        dependencies: modules,
        runtimeContext,
      })
    })

    it("should resolve service outputs", async () => {
      const result = withRuntime.resolve({
        key: ["runtime", "services", "service-b", "outputs", "foo"],
        nodePath: [],
        opts: {},
      })
      expect(result).to.eql({ resolved: "bar" })
    })

    it("should resolve task outputs", async () => {
      const result = withRuntime.resolve({
        key: ["runtime", "tasks", "task-b", "outputs", "moo"],
        nodePath: [],
        opts: {},
      })
      expect(result).to.eql({ resolved: "boo" })
    })

    it("should return the template string back if allowPartial=true and outputs haven't been resolved ", async () => {
      const result = withRuntime.resolve({
        key: ["runtime", "services", "not-ready", "outputs", "foo"],
        nodePath: [],
        opts: { allowPartial: true },
      })
      expect(result).to.eql({ resolved: "${runtime.services.not-ready.outputs.foo}" })
    })

    it("should allow using a runtime key as a test in a ternary (positive)", async () => {
      const result = resolveTemplateString(
        "${runtime.tasks.task-b ? runtime.tasks.task-b.outputs.moo : 'default'}",
        withRuntime
      )
      expect(result).to.equal("boo")
    })

    it("should throw when a service's outputs have been resolved but an output key is not found", async () => {
      await expectError(
        () =>
          withRuntime.resolve({
            key: ["runtime", "services", "service-b", "outputs", "boo"],
            nodePath: [],
            opts: {},
          }),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            "Could not find key boo under runtime.services.service-b.outputs. Available keys: foo."
          )
      )
    })
  })
})

describe("WorkflowConfigContext", () => {
  let garden: TestGarden
  let c: WorkflowConfigContext

  before(async () => {
    garden = await makeTestGardenA()
    garden["secrets"] = { someSecret: "someSecretValue" }
    c = new WorkflowConfigContext(garden)
  })

  it("should resolve local env variables", async () => {
    process.env.TEST_VARIABLE = "foo"
    expect(c.resolve({ key: ["local", "env", "TEST_VARIABLE"], nodePath: [], opts: {} })).to.eql({
      resolved: "foo",
    })
    delete process.env.TEST_VARIABLE
  })

  it("should resolve the local platform", async () => {
    expect(c.resolve({ key: ["local", "platform"], nodePath: [], opts: {} })).to.eql({
      resolved: process.platform,
    })
  })

  it("should resolve the environment config", async () => {
    expect(c.resolve({ key: ["environment", "name"], nodePath: [], opts: {} })).to.eql({
      resolved: garden.environmentName,
    })
  })

  it("should resolve a project variable", async () => {
    expect(c.resolve({ key: ["variables", "some"], nodePath: [], opts: {} })).to.eql({ resolved: "variable" })
  })

  it("should resolve a project variable under the var alias", async () => {
    expect(c.resolve({ key: ["var", "some"], nodePath: [], opts: {} })).to.eql({ resolved: "variable" })
  })

  it("should return a step reference back with allowPartial=true", async () => {
    expect(c.resolve({ key: ["steps", "step-1", "foo"], nodePath: [], opts: { allowPartial: true } })).to.eql({
      resolved: "${steps.step-1.foo}",
    })
  })

  context("secrets", () => {
    it("should resolve a secret", async () => {
      expect(c.resolve({ key: ["secrets", "someSecret"], nodePath: [], opts: {} })).to.eql({
        resolved: "someSecretValue",
      })
    })

    it("should throw when resolving a secret with a missing key", async () => {
      await expectError(
        () => c.resolve({ key: ["secrets", "missingSecret"], nodePath: [], opts: {} }),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            "Could not find key missingSecret under secrets. Available keys: someSecret."
          )
      )
    })
  })
})

describe("WorkflowStepConfigContext", () => {
  let garden: TestGarden

  before(async () => {
    garden = await makeTestGardenA()
  })

  it("should successfully resolve an output from a prior resolved step", () => {
    const c = new WorkflowStepConfigContext({
      garden,
      allStepNames: ["step-1", "step-2"],
      resolvedSteps: {
        "step-1": {
          log: "bla",
          number: 1,
          outputs: { some: "value" },
        },
      },
      stepName: "step-2",
    })
    expect(c.resolve({ key: ["steps", "step-1", "outputs", "some"], nodePath: [], opts: {} }).resolved).to.equal(
      "value"
    )
  })

  it("should successfully resolve the log from a prior resolved step", () => {
    const c = new WorkflowStepConfigContext({
      garden,
      allStepNames: ["step-1", "step-2"],
      resolvedSteps: {
        "step-1": {
          log: "bla",
          number: 1,
          outputs: {},
        },
      },
      stepName: "step-2",
    })
    expect(c.resolve({ key: ["steps", "step-1", "log"], nodePath: [], opts: {} }).resolved).to.equal("bla")
  })

  it("should throw error when attempting to reference a following step", () => {
    const c = new WorkflowStepConfigContext({
      garden,
      allStepNames: ["step-1", "step-2"],
      resolvedSteps: {},
      stepName: "step-1",
    })
    expectError(
      () => c.resolve({ key: ["steps", "step-2", "log"], nodePath: [], opts: {} }),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(
          "Step step-2 is referenced in a template for step step-1, but step step-2 is later in the execution order. Only previous steps in the workflow can be referenced."
        )
    )
  })

  it("should throw error when attempting to reference a missing step", () => {
    const c = new WorkflowStepConfigContext({
      garden,
      allStepNames: ["step-1", "step-2"],
      resolvedSteps: {},
      stepName: "step-1",
    })
    expectError(
      () => c.resolve({ key: ["steps", "step-foo", "log"], nodePath: [], opts: {} }),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(
          "Could not find key step-foo under steps. Available keys: step-1 and step-2."
        )
    )
  })

  it("should throw error when attempting to reference current step", () => {
    const c = new WorkflowStepConfigContext({
      garden,
      allStepNames: ["step-1", "step-2"],
      resolvedSteps: {},
      stepName: "step-1",
    })
    expectError(
      () => c.resolve({ key: ["steps", "step-1", "log"], nodePath: [], opts: {} }),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(
          "Step step-1 references itself in a template. Only previous steps in the workflow can be referenced."
        )
    )
  })
})

describe("ScanContext", () => {
  it("should collect found keys in an object", () => {
    const context = new ScanContext()
    const obj = {
      a: "some ${templated.string}",
      b: "${more.stuff}",
    }
    resolveTemplateStrings(obj, context)
    expect(context.foundKeys.entries()).to.eql([
      ["templated", "string"],
      ["more", "stuff"],
    ])
  })

  it("should handle keys with dots correctly", () => {
    const context = new ScanContext()
    const obj = {
      a: "some ${templated['key.with.dots']}",
      b: "${more.stuff}",
    }
    resolveTemplateStrings(obj, context)
    expect(context.foundKeys.entries()).to.eql([
      ["templated", "key.with.dots"],
      ["more", "stuff"],
    ])
  })
})

describe("PassthroughContext", () => {
  it("should return the template key back unresolved when allowPartial=true", () => {
    const context = new PassthroughContext()
    const obj = {
      a: "some ${templated.string}",
      b: "${more.stuff}",
    }
    const result = resolveTemplateStrings(obj, context, { allowPartial: true })
    expect(result).to.eql(obj)
  })

  it("should handle keys with dots correctly", () => {
    const context = new PassthroughContext()
    const obj = {
      a: "some ${templated['key.with.dots']}",
      b: "${more.stuff}",
    }
    const result = resolveTemplateStrings(obj, context, { allowPartial: true })
    expect(result).to.eql({
      a: 'some ${templated["key.with.dots"]}',
      b: "${more.stuff}",
    })
  })

  it("should handle nested template keys correctly", () => {
    const context = new PassthroughContext()
    const obj = {
      a: "some ${templated['${nested.key}']}",
      b: "${more.stuff}",
    }
    const result = resolveTemplateStrings(obj, context, { allowPartial: true })
    expect(result).to.eql({
      a: 'some ${templated["${nested.key}"]}',
      b: "${more.stuff}",
    })
  })
})
