/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"
import stripAnsi = require("strip-ansi")
import { keyBy } from "lodash"
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
} from "../../../../src/config/config-context"
import { expectError, makeTestGardenA, TestGarden, projectRootA, makeTestGarden } from "../../../helpers"
import { joi } from "../../../../src/config/common"
import { prepareRuntimeContext } from "../../../../src/runtime-context"
import { Service } from "../../../../src/types/service"
import { resolveTemplateString, resolveTemplateStrings } from "../../../../src/template-string"
import { exec } from "../../../../src/util/util"

type TestValue = string | ConfigContext | TestValues | TestValueFunction
type TestValueFunction = () => TestValue | Promise<TestValue>
interface TestValues {
  [key: string]: TestValue
}

let currentBranch

describe("ConfigContext", () => {
  before(async () => {
    currentBranch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"])).stdout
  })

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
    function resolveKey(c: ConfigContext, key: ContextKey, opts = {}) {
      return c.resolve({ key, nodePath: [], opts })
    }

    it("should resolve simple keys", async () => {
      const c = new TestContext({ basic: "value" })
      expect(resolveKey(c, ["basic"])).to.eql({ resolved: "value" })
    })

    it("should return undefined for missing key", async () => {
      const c = new TestContext({})
      const { resolved, message } = resolveKey(c, ["basic"])
      expect(resolved).to.be.undefined
      expect(stripAnsi(message!)).to.equal("Could not find key basic.")
    })

    context("allowPartial=true", () => {
      it("should throw on missing key when allowPartial=true", async () => {
        const c = new TestContext({})
        expectError(
          () => resolveKey(c, ["basic"], { allowPartial: true }),
          (err) => expect(stripAnsi(err.message)).to.equal("Could not find key basic.")
        )
      })

      it("should throw on missing key on nested context", async () => {
        const c = new TestContext({
          nested: new TestContext({ key: "value" }),
        })
        expectError(
          () => resolveKey(c, ["nested", "bla"], { allowPartial: true }),
          (err) => expect(stripAnsi(err.message)).to.equal("Could not find key bla under nested. Available keys: key.")
        )
      })
    })

    it("should throw when looking for nested value on primitive", async () => {
      const c = new TestContext({ basic: "value" })
      expectError(() => resolveKey(c, ["basic", "nested"]), "configuration")
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

    it("should return undefined for missing keys on nested context", async () => {
      const c = new TestContext({
        nested: new TestContext({ key: "value" }),
      })
      const { resolved, message } = resolveKey(c, ["basic", "bla"])
      expect(resolved).to.be.undefined
      expect(stripAnsi(message!)).to.equal("Could not find key basic. Available keys: nested.")
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
      expectError(() => c.resolve({ key, nodePath: [], opts: { stack } }), "configuration")
    })

    it("should detect a circular reference from a nested context", async () => {
      class NestedContext extends ConfigContext {
        resolve({ key, nodePath, opts }: ContextResolveParams) {
          const circularKey = nodePath.concat(key)
          opts.stack!.push(circularKey.join("."))
          return c.resolve({ key: circularKey, nodePath: [], opts })
        }
      }
      const c = new TestContext({
        nested: new NestedContext(),
      })
      expectError(() => resolveKey(c, ["nested", "bla"]), "configuration")
    })

    it("should return helpful message when unable to resolve nested key in map", async () => {
      class Context extends ConfigContext {
        nested: Map<string, string>

        constructor(parent?: ConfigContext) {
          super(parent)
          this.nested = new Map()
        }
      }
      const c = new Context()
      const { message } = resolveKey(c, ["nested", "bla"])
      expect(stripAnsi(message!)).to.equal("Could not find key bla under nested.")
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
      const { message } = resolveKey(c, ["nested", "bla"])
      expect(stripAnsi(message!)).to.equal("Could not find key bla under nested.")
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
      const { message } = resolveKey(c, ["nested", "deeper", "bla"])
      expect(stripAnsi(message!)).to.equal("Could not find key bla under nested.deeper.")
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
      const { message } = resolveKey(c, ["nested", "bla"])
      expect(stripAnsi(message!)).to.equal("Could not find key bla under nested.")
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
      expectError(() => resolveKey(c, ["key"]), "template-string")
    })

    it("should detect a nested self-reference when resolving a template string", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested = new TestContext({ key: "${nested.key}" }, c)
      c.addValues({ nested })
      expectError(() => resolveKey(c, ["nested", "key"]), "template-string")
    })

    it("should detect a circular reference when resolving a template string", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested: any = new TestContext({ key: "${nested.foo}", foo: "${nested.key}" }, c)
      c.addValues({ nested })
      expectError(() => resolveKey(c, ["nested", "key"]), "template-string")
    })

    it("should detect a circular reference when resolving a nested template string", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested: any = new TestContext({ key: "${nested.foo}", foo: "${'${nested.key}'}" }, c)
      c.addValues({ nested })
      expectError(() => resolveKey(c, ["nested", "key"]), "template-string")
    })

    it("should detect a circular reference when nested template string resolves to self", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested: any = new TestContext({ key: "${'${nested.key}'}" }, c)
      c.addValues({ nested })
      expectError(
        () => resolveKey(c, ["nested", "key"]),
        (err) =>
          expect(err.message).to.equal(
            "Invalid template string (${'${nested.key}'}): Invalid template string (${nested.key}): Circular reference detected when resolving key nested.key (nested -> nested.key)"
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
      projectRoot: "/tmp",
      artifactsPath: "/tmp",
      branch: "main",
      username: "some-user",
      secrets: {},
    })
    expect(c.resolve({ key: ["local", "env", "TEST_VARIABLE"], nodePath: [], opts: {} })).to.eql({
      resolved: "value",
    })
    delete process.env.TEST_VARIABLE
  })

  it("should resolve the current git branch", () => {
    const c = new ProjectConfigContext({
      projectName: "some-project",
      projectRoot: "/tmp",
      artifactsPath: "/tmp",
      branch: "main",
      username: "some-user",
      secrets: {},
    })
    expect(c.resolve({ key: ["git", "branch"], nodePath: [], opts: {} })).to.eql({
      resolved: "main",
    })
  })

  it("should resolve secrets", () => {
    const c = new ProjectConfigContext({
      projectName: "some-project",
      projectRoot: "/tmp",
      artifactsPath: "/tmp",
      branch: "main",
      username: "some-user",
      secrets: { foo: "banana" },
    })
    expect(c.resolve({ key: ["secrets", "foo"], nodePath: [], opts: {} })).to.eql({
      resolved: "banana",
    })
  })

  it("should return helpful message when resolving missing env variable", () => {
    const c = new ProjectConfigContext({
      projectName: "some-project",
      projectRoot: "/tmp",
      artifactsPath: "/tmp",
      branch: "main",
      username: "some-user",
      secrets: {},
    })
    const key = "fiaogsyecgbsjyawecygaewbxrbxajyrgew"

    const { message } = c.resolve({ key: ["local", "env", key], nodePath: [], opts: {} })

    expect(stripAnsi(message!)).to.match(
      /Could not find key fiaogsyecgbsjyawecygaewbxrbxajyrgew under local.env. Available keys: /
    )
  })

  it("should resolve the local platform", () => {
    const c = new ProjectConfigContext({
      projectName: "some-project",
      projectRoot: "/tmp",
      artifactsPath: "/tmp",
      branch: "main",
      username: "some-user",
      secrets: {},
    })
    expect(c.resolve({ key: ["local", "platform"], nodePath: [], opts: {} })).to.eql({
      resolved: process.platform,
    })
  })

  it("should resolve the local username (both regular and lower case versions)", () => {
    const c = new ProjectConfigContext({
      projectName: "some-project",
      projectRoot: "/tmp",
      artifactsPath: "/tmp",
      branch: "main",
      username: "SomeUser",
      secrets: {},
    })
    expect(c.resolve({ key: ["local", "username"], nodePath: [], opts: {} })).to.eql({
      resolved: "SomeUser",
    })
    expect(c.resolve({ key: ["local", "usernameLowerCase"], nodePath: [], opts: {} })).to.eql({
      resolved: "someuser",
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
      parentName: undefined,
      templateName: undefined,
      inputs: {},
      partialRuntimeResolution: false,
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

  it("should resolve the current git branch", () => {
    expect(c.resolve({ key: ["git", "branch"], nodePath: [], opts: {} })).to.eql({
      resolved: currentBranch,
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
        parentName: undefined,
        templateName: undefined,
        inputs: {},
        partialRuntimeResolution: false,
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

    it("should allow using a runtime key as a test in a ternary (positive)", async () => {
      const result = resolveTemplateString(
        "${runtime.tasks.task-b ? runtime.tasks.task-b.outputs.moo : 'default'}",
        withRuntime
      )
      expect(result).to.equal("boo")
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

  it("should resolve the current git branch", () => {
    expect(c.resolve({ key: ["git", "branch"], nodePath: [], opts: {} })).to.eql({
      resolved: currentBranch,
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

  context("secrets", () => {
    it("should resolve a secret", async () => {
      expect(c.resolve({ key: ["secrets", "someSecret"], nodePath: [], opts: {} })).to.eql({
        resolved: "someSecretValue",
      })
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
