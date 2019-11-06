import tmp from "tmp-promise"
import { ConfigStore } from "../../../src/config-store"
import { expect } from "chai"
import { resolve } from "path"

type ExecConfig = {}

class ExecConfigStore extends ConfigStore<ExecConfig> {
  getConfigPath(gardenDirPath: string): string {
    return resolve(gardenDirPath, "local-config.yml")
  }

  validate(config): ExecConfig {
    return config
  }
}

describe("ConfigStore", () => {
  let config: ConfigStore
  let tmpDir

  before(async () => {
    tmpDir = await tmp.dir({ unsafeCleanup: true })
    config = new ExecConfigStore(tmpDir.path)
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  afterEach(async () => {
    await config.clear()
  })

  describe("set", () => {
    it("should set a simple key/value pair", async () => {
      await config.set(["key"], "value")
      expect(await config.get()).to.eql({ key: "value" })
    })

    it("should set nested keys and create objects as needed", async () => {
      await config.set(["nested", "a", "aa"], "value-a")
      await config.set(["nested", "b", "bb"], "value-b")
      expect(await config.get()).to.eql({
        nested: { a: { aa: "value-a" }, b: { bb: "value-b" } },
      })
      await config.set(["nested", "b", "bb"], "value-bbb")
      expect(await config.get()).to.eql({
        nested: { a: { aa: "value-a" }, b: { bb: "value-bbb" } },
      })
    })

    it("should optionally set multiple key-value pairs", async () => {
      await config.set([{ keyPath: ["a", "aa"], value: "value-a" }, { keyPath: ["b", "bb"], value: "value-b" }])
      expect(await config.get()).to.eql({
        a: { aa: "value-a" },
        b: { bb: "value-b" },
      })
    })

    it("should throw if setting a nested key on a non-object", async () => {
      await config.set(["key"], "value")

      try {
        await config.set(["key", "nested"], "value")
      } catch (err) {
        expect(err.type).to.equal("local-config")
        return
      }

      throw new Error("Expected error")
    })
  })

  describe("get", () => {
    it("should return full config if no key specified", async () => {
      await config.set(["nested", "key"], "value")
      expect(await config.get()).to.eql({ nested: { key: "value" } })
    })

    it("should return specific key if specified", async () => {
      await config.set(["key"], "value")
      expect(await config.get(["key"])).to.equal("value")
    })

    it("should return specific nested key if specified", async () => {
      await config.set(["key", "nested"], "value")
      expect(await config.get(["key", "nested"])).to.equal("value")
    })

    it("should throw if key is not found", async () => {
      let res

      try {
        res = await config.get(["key"])
      } catch (err) {
        expect(err.type).to.equal("local-config")
        return
      }

      throw new Error("Expected error, got " + res)
    })
  })

  describe("clear", () => {
    it("should clear the configuration", async () => {
      await config.set(["key"], "value")
      await config.clear()
      expect(await config.get()).to.eql({})
    })
  })

  describe("delete", () => {
    it("should delete the specified key from the configuration", async () => {
      await config.set([{ keyPath: ["a", "aa"], value: "value-a" }, { keyPath: ["b", "bb"], value: "value-b" }])
      await config.delete(["a", "aa"])

      expect(await config.get(["b", "bb"])).to.eql("value-b")

      let res
      try {
        res = await config.get(["a", "aa"])
      } catch (err) {
        expect(err.type).to.equal("local-config")
        return
      }
      throw new Error("Expected error, got " + res)
    })

    it("should throw if key is not found", async () => {
      let res
      try {
        res = await config.delete(["key"])
      } catch (err) {
        expect(err.type).to.equal("local-config")
        return
      }
      throw new Error("Expected error, got " + res)
    })
  })
})
