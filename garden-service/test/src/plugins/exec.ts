import { expect } from "chai"
import { join, resolve } from "path"
import { Garden } from "../../../src/garden"
import { gardenPlugin } from "../../../src/plugins/exec"
import { GARDEN_BUILD_VERSION_FILENAME } from "../../../src/constants"
import { LogEntry } from "../../../src/logger/log-entry"
import { keyBy } from "lodash"
import { ConfigGraph } from "../../../src/config-graph"
import {
  writeModuleVersionFile,
  readModuleVersionFile,
} from "../../../src/vcs/base"
import {
  dataDir,
  makeTestGarden,
} from "../../helpers"

describe("exec plugin", () => {
  const projectRoot = resolve(dataDir, "test-project-exec")
  const moduleName = "module-a"

  let garden: Garden
  let graph: ConfigGraph
  let log: LogEntry

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot, { exec: gardenPlugin })
    log = garden.log
    graph = await garden.getConfigGraph()
    await garden.clearBuilds()
  })

  it("should correctly parse exec modules", async () => {
    const modules = keyBy(await graph.getModules(), "name")
    const {
      "module-a": moduleA,
      "module-b": moduleB,
      "module-c": moduleC,
    } = modules

    expect(moduleA.build).to.eql({
      dependencies: [],
    })
    expect(moduleA.spec.build).to.eql({
      command: ["echo", "A"],
      dependencies: [],
    })
    expect(moduleA.serviceConfigs).to.eql([])
    expect(moduleA.taskConfigs).to.eql([
      {
        name: "banana",
        dependencies: ["orange"],
        timeout: null,
        spec: {
          name: "banana",
          command: ["echo", "BANANA"],
          dependencies: ["orange"],
          timeout: null,
        },
      },
      {
        name: "orange",
        dependencies: [],
        timeout: 999,
        spec: {
          name: "orange",
          command: ["echo", "ORANGE"],
          dependencies: [],
          timeout: 999,
        },
      },
    ])
    expect(moduleA.testConfigs).to.eql([
      {
        name: "unit",
        dependencies: [],
        timeout: null,
        spec: {
          name: "unit",
          dependencies: [],
          command: ["echo", "OK"],
          env: {
            FOO: "boo",
          },
          timeout: null,
        },
      },
    ])

    expect(moduleB.build).to.eql({
      dependencies: [{ name: "module-a", copy: [] }],
    })
    expect(moduleB.spec.build).to.eql({
      command: ["echo", "B"],
      dependencies: [{ name: "module-a", copy: [] }],
    })
    expect(moduleB.serviceConfigs).to.eql([])
    expect(moduleB.taskConfigs).to.eql([])
    expect(moduleB.testConfigs).to.eql([
      {
        name: "unit",
        dependencies: [],
        timeout: null,
        spec: {
          name: "unit",
          dependencies: [],
          command: ["echo", "OK"],
          env: {},
          timeout: null,
        },
      },
    ])

    expect(moduleC.build).to.eql({
      dependencies: [{ name: "module-b", copy: [] }],
    })
    expect(moduleC.spec.build).to.eql({
      command: [],
      dependencies: [{ name: "module-b", copy: [] }],
    })
    expect(moduleC.serviceConfigs).to.eql([])
    expect(moduleC.taskConfigs).to.eql([])
    expect(moduleC.testConfigs).to.eql([
      {
        name: "unit",
        dependencies: [],
        timeout: null,
        spec: {
          name: "unit",
          dependencies: [],
          command: ["echo", "OK"],
          env: {},
          timeout: null,
        },
      },
    ])
  })

  describe("getBuildStatus", () => {
    it("should read a build version file if it exists", async () => {
      const module = await graph.getModule(moduleName)
      const version = module.version
      const buildPath = module.buildPath
      const versionFilePath = join(buildPath, GARDEN_BUILD_VERSION_FILENAME)

      await writeModuleVersionFile(versionFilePath, version)

      const result = await garden.actions.getBuildStatus({ log, module })

      expect(result.ready).to.be.true
    })
  })

  describe("build", () => {
    it("should write a build version file after building", async () => {
      const module = await graph.getModule(moduleName)
      const version = module.version
      const buildPath = module.buildPath
      const versionFilePath = join(buildPath, GARDEN_BUILD_VERSION_FILENAME)

      await garden.actions.build({ log, module })

      const versionFileContents = await readModuleVersionFile(versionFilePath)

      expect(versionFileContents).to.eql(version)
    })
  })
})
