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
import * as Joi from "joi"
import { Garden } from "../../../../src/garden"
import { join } from "path"

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
        @schema(Joi.string().description("Nested description"))
        nestedKey: string
      }

      class Context extends ConfigContext {
        @schema(Joi.string().description("Some description"))
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
      garden.environment,
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
    expect(await c.resolve({ key: ["environment", "name"], nodePath: [], opts: {} })).to.equal(garden.environment.name)
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
})
