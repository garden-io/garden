import { expect } from "chai"
import { loadConfig, findProjectConfig } from "../../../../src/config/base"
import { resolve } from "path"
import { dataDir, expectError, getDataDir } from "../../../helpers"

const projectPathA = resolve(dataDir, "test-project-a")
const modulePathA = resolve(projectPathA, "module-a")

const projectPathMultipleModules = resolve(dataDir, "test-project-multiple-module-config")
const modulePathAMultiple = resolve(projectPathMultipleModules, "module-a")

const projectPathDuplicateProjects = resolve(dataDir, "test-project-duplicate-project-config")

const projectPathFlat = resolve(dataDir, "test-project-flat-config")
const modulePathFlatInvalid = resolve(projectPathFlat, "invalid-config-kind")

describe("loadConfig", () => {
  it("should not throw an error if no file was found", async () => {
    const parsed = await loadConfig(projectPathA, resolve(projectPathA, "non-existent-module"))

    expect(parsed).to.eql([])
  })

  it("should throw a config error if the file couldn't be parsed", async () => {
    const projectPath = resolve(dataDir, "test-project-invalid-config")
    await expectError(
      async () => await loadConfig(projectPath, resolve(projectPath, "invalid-syntax-module")),
      (err) => {
        expect(err.message).to.match(/Could not parse/)
      })
  })

  // TODO: test more cases
  it("should load and parse a project config", async () => {
    const parsed = await loadConfig(projectPathA, projectPathA)

    expect(parsed).to.eql([
      {
        apiVersion: "garden.io/v0",
        kind: "Project",
        path: projectPathA,
        name: "test-project-a",
        environmentDefaults: {
          variables: { some: "variable" },
        },
        environments: [
          {
            name: "local",
            providers: [
              { name: "test-plugin" },
              { name: "test-plugin-b" },
            ],
          },
          {
            name: "other",
          },
        ],
      },
    ])
  })

  it("should load and parse a module config", async () => {
    const parsed = await loadConfig(projectPathA, modulePathA)

    expect(parsed).to.eql([
      {
        apiVersion: "garden.io/v0",
        kind: "Module",
        name: "module-a",
        type: "test",
        description: undefined,
        include: undefined,
        repositoryUrl: undefined,
        allowPublish: undefined,
        build: { dependencies: [] },
        outputs: {},
        path: modulePathA,

        spec: {
          build: {
            command: ["echo", "A"],
            dependencies: [],
          },
          services: [{ name: "service-a" }],
          tasks: [{
            name: "task-a",
            command: ["echo", "OK"],
          }],
          tests: [{
            name: "unit",
            command: ["echo", "OK"],
          },
          {
            name: "integration",
            command: ["echo", "OK"],
          }],
        },

        serviceConfigs: [],
        taskConfigs: [],
        testConfigs: [],
      },
    ])
  })

  it("should load and parse a config file defining a project and a module", async () => {
    const parsed = await loadConfig(projectPathMultipleModules, projectPathMultipleModules)

    expect(parsed).to.eql([
      {
        apiVersion: "garden.io/v0",
        kind: "Project",
        path: projectPathMultipleModules,
        environmentDefaults: {
          variables: {
            some: "variable",
          },
        },
        environments: [
          {
            name: "local",
            providers: [
              { name: "test-plugin" },
              { name: "test-plugin-b" },
            ],
          },
          {
            name: "other",
          },
        ],
        name: "test-project-multiple-modules",
      },
      {
        apiVersion: "garden.io/v0",
        kind: "Module",
        name: "module-from-project-config",
        type: "test",
        description: undefined,
        include: undefined,
        repositoryUrl: undefined,
        allowPublish: undefined,
        build: { dependencies: [] },
        outputs: {},
        path: projectPathMultipleModules,
        serviceConfigs: [],
        spec: {
          build: {
            command: ["echo", "project"],
            dependencies: [],
          },
        },
        testConfigs: [],
        taskConfigs: [],
      },
    ])
  })

  it("should load and parse a config file defining multiple modules", async () => {
    const parsed = await loadConfig(projectPathMultipleModules, modulePathAMultiple)

    expect(parsed).to.eql([
      {
        apiVersion: "garden.io/v0",
        kind: "Module",
        name: "module-a1",
        type: "test",
        allowPublish: undefined,
        description: undefined,
        include: undefined,
        repositoryUrl: undefined,
        build: {
          dependencies: [
            { name: "module-from-project-config", copy: [] },
          ],
        },
        outputs: {},
        path: modulePathAMultiple,
        serviceConfigs: [],
        spec: {
          build: {
            command: ["echo", "A1"],
            dependencies: [
              { name: "module-from-project-config", copy: [] },
            ],
          },
          services: [{ name: "service-a1" }],
          tests: [{ name: "unit", command: ["echo", "OK"] }],
          tasks: [{ name: "task-a1", command: ["echo", "OK"] }],
        },
        testConfigs: [],
        taskConfigs: [],
      },
      {
        apiVersion: "garden.io/v0",
        kind: "Module",
        name: "module-a2",
        type: "test",
        allowPublish: undefined,
        description: undefined,
        include: undefined,
        repositoryUrl: undefined,
        build: { dependencies: [] },
        outputs: {},
        path: modulePathAMultiple,
        serviceConfigs: [],
        spec: {
          build: {
            command: ["echo", "A2"],
            dependencies: [],
          },
          services: [{ name: "service-a2" }],
          tests: [{ name: "unit", command: ["echo", "OK"] }],
          tasks: [{ name: "task-a2", command: ["echo", "OK"] }],
        },
        testConfigs: [],
        taskConfigs: [],
      },
    ])
  })

  it("should parse a config file using the flat config style", async () => {
    const parsed = await loadConfig(projectPathFlat, projectPathFlat)

    expect(parsed).to.eql([
      {
        apiVersion: "garden.io/v0",
        kind: "Project",
        path: projectPathFlat,
        environmentDefaults: {
          variables: { some: "variable" },
        },
        environments: [
          {
            name: "local",
            providers: [
              { name: "test-plugin" },
              { name: "test-plugin-b" },
            ],
          },
          {
            name: "other",
          },
        ],
        name: "test-project-flat-config",
      },
      {
        apiVersion: "garden.io/v0",
        kind: "Module",
        name: "module-from-project-config",
        type: "test",
        description: undefined,
        build: {
          dependencies: [],
        },
        allowPublish: undefined,
        include: undefined,
        outputs: {},
        path: projectPathFlat,
        repositoryUrl: undefined,
        serviceConfigs: [],
        spec: {
          build: {
            command: ["echo", "project"],
            dependencies: [],
          },
        },
        taskConfigs: [],
        testConfigs: [],
      },
    ])
  })

  it("should load a project config with a top-level provider field", async () => {
    const projectPath = getDataDir("test-projects", "new-provider-spec")
    const parsed = await loadConfig(projectPath, projectPath)

    expect(parsed).to.eql([
      {
        apiVersion: "garden.io/v0",
        kind: "Project",
        path: projectPath,
        name: "test-project-a",
        environmentDefaults: {
          variables: { some: "variable" },
        },
        environments: [
          { name: "local" },
          { name: "other" },
        ],
        providers: [
          { name: "test-plugin", environments: ["local"] },
          { name: "test-plugin-b" },
        ],
      },
    ])
  })

  it("should throw an error when parsing a flat-style config using an unknown/invalid kind", async () => {
    await expectError(
      async () => await loadConfig(projectPathFlat, modulePathFlatInvalid),
      (err) => {
        expect(err.message).to.match(/Unknown config kind/)
      })
  })

  it("should throw an error when parsing a config file defining multiple projects", async () => {
    await expectError(
      async () => await loadConfig(projectPathDuplicateProjects, projectPathDuplicateProjects),
      (err) => {
        expect(err.message).to.match(/Multiple project declarations/)
      })
  })

  it("should return [] if config file is not found", async () => {
    const parsed = await loadConfig("/thisdoesnotexist", "/thisdoesnotexist")
    expect(parsed).to.eql([])
  })

})

describe("findProjectConfig", async () => {
  it("should find the project config when path is projectRoot", async () => {
    const project = await findProjectConfig(projectPathA)
    expect(project && project.path).to.eq(projectPathA)
  })

  it("should find the project config when path is a subdir of projectRoot", async () => {
    // modulePathA is a subdir of projectPathA
    const project = await findProjectConfig(modulePathA)
    expect(project && project.path).to.eq(projectPathA)
  })
})
