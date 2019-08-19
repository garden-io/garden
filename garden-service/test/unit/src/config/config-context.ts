import { expect } from "chai"
import {
  ConfigContext,
  ContextKey,
  ContextResolveParams,
  schema,
  ProjectConfigContext,
  ModuleConfigContext,
} from "../../../../src/config/config-context"
import { expectError, makeTestGardenA } from "../../../helpers"
import { Garden } from "../../../../src/garden"
import { join } from "path"
import { joi } from "../../../../src/config/common"
import { prepareRuntimeContext } from "../../../../src/runtime-context"
import { Service } from "../../../../src/types/service"

type TestValue = string | ConfigContext | TestValues | TestValueFunction
type TestValueFunction = () => TestValue | Promise<TestValue>
interface TestValues { [key: string]: TestValue }

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
      expect(await resolveKey(c, ["basic"])).to.equal("value")
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
      expect(await resolveKey(c, ["nested", "key"])).to.equal("value")
    })

    it("should resolve keys on nested contexts", async () => {
      const c = new TestContext({
        nested: new TestContext({ key: "value" }),
      })
      expect(await resolveKey(c, ["nested", "key"])).to.equal("value")
    })

    it("should throw on missing key on nested context", async () => {
      const c = new TestContext({
        nested: new TestContext({ key: "value" }),
      })
      await expectError(() => resolveKey(c, ["nested", "bla"]), "configuration")
    })

    it("should resolve keys with value behind callable", async () => {
      const c = new TestContext({ basic: () => "value" })
      expect(await resolveKey(c, ["basic"])).to.equal("value")
    })

    it("should resolve keys with value behind callable that returns promise", async () => {
      const c = new TestContext({ basic: async () => "value" })
      expect(await resolveKey(c, ["basic"])).to.equal("value")
    })

    it("should resolve keys on nested contexts where context is behind callable", async () => {
      const c = new TestContext({
        nested: () => new TestContext({ key: "value" }),
      })
      expect(await resolveKey(c, ["nested", "key"])).to.equal("value")
    })

    it("should cache resolved values", async () => {
      const nested: any = new TestContext({ key: "value" })
      const c = new TestContext({
        nested,
      })
      await resolveKey(c, ["nested", "key"])

      nested.key = "foo"

      expect(await resolveKey(c, ["nested", "key"])).to.equal("value")
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
      await expectError(() => resolveKey(c, ["nested", "bla"]), "configuration")
    })

    it("should show full template string in error when unable to resolve in nested context", async () => {
      class Nested extends ConfigContext { }
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
        (err) => expect(err.message).to.equal("Could not find key: nested.bla"),
      )
    })

    it("should resolve template strings", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested: any = new TestContext({ key: "\${foo}" }, c)
      c.addValues({ nested })
      expect(await resolveKey(c, ["nested", "key"])).to.equal("bar")
    })

    it("should resolve template strings with nested context", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested: any = new TestContext({ key: "\${nested.foo}", foo: "boo" }, c)
      c.addValues({ nested })
      expect(await resolveKey(c, ["nested", "key"])).to.equal("boo")
    })

    it("should detect a self-reference when resolving a template string", async () => {
      const c = new TestContext({ key: "\${key}" })
      await expectError(() => resolveKey(c, ["key"]), "configuration")
    })

    it("should detect a nested self-reference when resolving a template string", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested = new TestContext({ key: "\${nested.key}" }, c)
      c.addValues({ nested })
      await expectError(() => resolveKey(c, ["nested", "key"]), "configuration")
    })

    it("should detect a circular reference when resolving a template string", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested: any = new TestContext({ key: "\${nested.foo}", foo: "\${nested.key}" }, c)
      c.addValues({ nested })
      await expectError(() => resolveKey(c, ["nested", "key"]), "configuration")
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
        children: {
          key: {
            type: "string",
            description: "Some description",
            invalids: [""],
          },
          nested: {
            type: "object",
            flags: { presence: "required" },
            description: "A nested context",
            children: {
              nestedKey: {
                type: "string",
                description: "Nested description",
                invalids: [""],
              },
            },
          },
        },
      })
    })
  })
})

describe("ProjectConfigContext", () => {
  it("should should resolve local env variables", async () => {
    process.env.TEST_VARIABLE = "foo"
    const c = new ProjectConfigContext()
    expect(await c.resolve({ key: ["local", "env", "TEST_VARIABLE"], nodePath: [], opts: {} })).to.equal("foo")
    delete process.env.TEST_VARIABLE
  })

  it("should should resolve the local platform", async () => {
    const c = new ProjectConfigContext()
    expect(await c.resolve({ key: ["local", "platform"], nodePath: [], opts: {} })).to.equal(process.platform)
  })
})

describe("ModuleConfigContext", () => {
  let garden: Garden
  let c: ModuleConfigContext

  before(async () => {
    garden = await makeTestGardenA()
    await garden.scanModules()
    c = new ModuleConfigContext(
      garden,
      garden.environmentName,
      await garden.resolveProviders(),
      garden.variables,
      Object.values((<any>garden).moduleConfigs),
    )
  })

  it("should should resolve local env variables", async () => {
    process.env.TEST_VARIABLE = "foo"
    expect(await c.resolve({ key: ["local", "env", "TEST_VARIABLE"], nodePath: [], opts: {} })).to.equal("foo")
    delete process.env.TEST_VARIABLE
  })

  it("should should resolve the local platform", async () => {
    expect(await c.resolve({ key: ["local", "platform"], nodePath: [], opts: {} })).to.equal(process.platform)
  })

  it("should should resolve the environment config", async () => {
    expect(await c.resolve({ key: ["environment", "name"], nodePath: [], opts: {} })).to.equal(garden.environmentName)
  })

  it("should should resolve the path of a module", async () => {
    const path = join(garden.projectRoot, "module-a")
    expect(await c.resolve({ key: ["modules", "module-a", "path"], nodePath: [], opts: {} })).to.equal(path)
  })

  it("should should resolve the version of a module", async () => {
    const { versionString } = await garden.resolveVersion("module-a", [])
    expect(await c.resolve({ key: ["modules", "module-a", "version"], nodePath: [], opts: {} })).to.equal(versionString)
  })

  it("should should resolve the outputs of a module", async () => {
    expect(await c.resolve({ key: ["modules", "module-a", "outputs", "foo"], nodePath: [], opts: {} })).to.equal("bar")
  })

  it("should should resolve the version of a module", async () => {
    const { versionString } = await garden.resolveVersion("module-a", [])
    expect(await c.resolve({ key: ["modules", "module-a", "version"], nodePath: [], opts: {} })).to.equal(versionString)
  })

  it("should should resolve a project variable", async () => {
    expect(await c.resolve({ key: ["variables", "some"], nodePath: [], opts: {} })).to.equal("variable")
  })

  it("should should resolve a project variable under the var alias", async () => {
    expect(await c.resolve({ key: ["var", "some"], nodePath: [], opts: {} })).to.equal("variable")
  })

  context("runtimeContext is not set", () => {
    it("should return runtime template strings unchanged", async () => {
      expect(await c.resolve({ key: ["runtime", "some", "key"], nodePath: [], opts: {} }))
        .to.equal("\${runtime.some.key}")
    })
  })

  context("runtimeContext is set", () => {
    let withRuntime: ModuleConfigContext
    let serviceA: Service

    before(async () => {
      const graph = await garden.getConfigGraph()
      serviceA = await graph.getService("service-a")
      const serviceB = await graph.getService("service-b")
      const taskB = await graph.getTask("task-b")

      const runtimeContext = await prepareRuntimeContext({
        garden,
        graph,
        dependencies: {
          build: [],
          service: [serviceB],
          task: [taskB],
          test: [],
        },
        module: serviceA.module,
        serviceStatuses: {
          "service-b": {
            outputs: { foo: "bar" },
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

      withRuntime = new ModuleConfigContext(
        garden,
        garden.environmentName,
        await garden.resolveProviders(),
        garden.variables,
        Object.values((<any>garden).moduleConfigs),
        runtimeContext,
      )
    })

    it("should resolve service outputs", async () => {
      const result = await withRuntime.resolve({
        key: ["runtime", "services", "service-b", "outputs", "foo"],
        nodePath: [],
        opts: {},
      })
      expect(result).to.equal("bar")
    })

    it("should resolve task outputs", async () => {
      const result = await withRuntime.resolve({
        key: ["runtime", "tasks", "task-b", "outputs", "moo"],
        nodePath: [],
        opts: {},
      })
      expect(result).to.equal("boo")
    })

    it("should return the template string back if a service's outputs haven't been resolved", async () => {
      const result = await withRuntime.resolve({
        key: ["runtime", "services", "not-ready", "outputs", "foo"],
        nodePath: [],
        opts: {},
      })
      expect(result).to.equal("\${runtime.services.not-ready.outputs.foo}")
    })

    it("should throw when a service's outputs have been resolved but an output key is not found", async () => {
      await expectError(
        () => withRuntime.resolve({
          key: ["runtime", "services", "service-b", "outputs", "boo"],
          nodePath: [],
          opts: {},
        }),
        (err) => expect(err.message).to.equal("Could not find key: runtime.services.service-b.outputs.boo"),
      )
    })
  })
})
