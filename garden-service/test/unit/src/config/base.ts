import { expect } from "chai"
import { loadConfig, findProjectConfig } from "../../../../src/config/base"
import { resolve } from "path"
import { dataDir, expectError, getDataDir } from "../../../helpers"
import { DEFAULT_API_VERSION } from "../../../../src/constants"
import stripAnsi = require("strip-ansi")

const projectPathA = resolve(dataDir, "test-project-a")
const modulePathA = resolve(projectPathA, "module-a")

const projectPathMultipleModules = resolve(dataDir, "test-projects", "multiple-module-config")
const modulePathAMultiple = resolve(projectPathMultipleModules, "module-a")

const projectPathDuplicateProjects = resolve(dataDir, "test-project-duplicate-project-config")

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
      }
    )
  })

  it("should throw if a config doesn't specify a kind", async () => {
    const projectPath = resolve(dataDir, "test-project-invalid-config")
    await expectError(
      async () => await loadConfig(projectPath, resolve(projectPath, "missing-kind")),
      (err) => {
        expect(err.message).to.equal("Missing `kind` field in config at missing-kind/garden.yml")
      }
    )
  })

  it("should throw if a config specifies an invalid kind", async () => {
    const projectPath = resolve(dataDir, "test-project-invalid-config")
    await expectError(
      async () => await loadConfig(projectPath, resolve(projectPath, "invalid-config-kind")),
      (err) => {
        expect(err.message).to.equal("Unknown config kind banana in invalid-config-kind/garden.yml")
      }
    )
  })

  it("should throw if a module config doesn't specify a type", async () => {
    const projectPath = resolve(dataDir, "test-project-invalid-config")
    await expectError(
      async () => await loadConfig(projectPath, resolve(projectPath, "missing-type")),
      (err) => {
        expect(stripAnsi(err.message)).to.equal(
          "Error validating module (missing-type/garden.yml): key .type is required"
        )
      }
    )
  })

  it("should throw if a module config doesn't specify a name", async () => {
    const projectPath = resolve(dataDir, "test-project-invalid-config")
    await expectError(
      async () => await loadConfig(projectPath, resolve(projectPath, "missing-name")),
      (err) => {
        expect(stripAnsi(err.message)).to.equal(
          "Error validating module (missing-name/garden.yml): key .name is required"
        )
      }
    )
  })

  // TODO: test more cases
  it("should load and parse a project config", async () => {
    const parsed = await loadConfig(projectPathA, projectPathA)
    const configPath = resolve(projectPathA, "garden.yml")

    expect(parsed).to.eql([
      {
        apiVersion: "garden.io/v0",
        kind: "Project",
        path: projectPathA,
        configPath,
        name: "test-project-a",
        environments: [
          {
            name: "local",
          },
          {
            name: "other",
          },
        ],
        providers: [
          { name: "test-plugin", environments: ["local"] },
          { name: "test-plugin-b", environments: ["local"] },
        ],
        variables: { some: "variable" },
      },
    ])
  })

  it("should load and parse a module config", async () => {
    const parsed = await loadConfig(projectPathA, modulePathA)
    const configPath = resolve(modulePathA, "garden.yml")

    expect(parsed).to.eql([
      {
        apiVersion: "garden.io/v0",
        kind: "Module",
        name: "module-a",
        type: "test",
        configPath,
        description: undefined,
        disabled: undefined,
        include: undefined,
        exclude: undefined,
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
          tasks: [
            {
              name: "task-a",
              command: ["echo", "OK"],
            },
          ],
          tests: [
            {
              name: "unit",
              command: ["echo", "OK"],
            },
            {
              name: "integration",
              command: ["echo", "OK"],
            },
          ],
        },

        serviceConfigs: [],
        taskConfigs: [],
        testConfigs: [],
      },
    ])
  })

  it("should load and parse a config file defining a project and a module", async () => {
    const parsed = await loadConfig(projectPathMultipleModules, projectPathMultipleModules)
    const configPath = resolve(projectPathMultipleModules, "garden.yml")

    expect(parsed).to.eql([
      {
        apiVersion: "garden.io/v0",
        kind: "Project",
        configPath,
        path: projectPathMultipleModules,
        environments: [
          {
            name: "local",
          },
          {
            name: "other",
          },
        ],
        providers: [
          { name: "test-plugin", environments: ["local"] },
          { name: "test-plugin-b", environments: ["local"] },
        ],
        name: "test-project-multiple-modules",
        variables: { some: "variable" },
      },
      {
        apiVersion: "garden.io/v0",
        kind: "Module",
        name: "module-from-project-config",
        type: "test",
        configPath,
        description: undefined,
        disabled: undefined,
        include: ["*"],
        exclude: undefined,
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
    const configPath = resolve(modulePathAMultiple, "garden.yml")

    expect(parsed).to.eql([
      {
        apiVersion: "garden.io/v0",
        kind: "Module",
        name: "module-a1",
        type: "test",
        configPath,
        allowPublish: undefined,
        description: undefined,
        disabled: undefined,
        include: ["*"],
        exclude: undefined,
        repositoryUrl: undefined,
        build: {
          dependencies: [{ name: "module-from-project-config", copy: [] }],
        },
        outputs: {},
        path: modulePathAMultiple,
        serviceConfigs: [],
        spec: {
          build: {
            command: ["echo", "A1"],
            dependencies: [{ name: "module-from-project-config", copy: [] }],
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
        configPath,
        allowPublish: undefined,
        description: undefined,
        disabled: undefined,
        include: ["*"],
        exclude: undefined,
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

  it("should load a project config with a top-level provider field", async () => {
    const projectPath = getDataDir("test-projects", "new-provider-spec")
    const parsed = await loadConfig(projectPath, projectPath)

    expect(parsed).to.eql([
      {
        apiVersion: "garden.io/v0",
        kind: "Project",
        path: projectPath,
        configPath: resolve(projectPath, "garden.yml"),
        name: "test-project-a",
        environments: [{ name: "local" }, { name: "other" }],
        providers: [{ name: "test-plugin", environments: ["local"] }, { name: "test-plugin-b" }],
      },
    ])
  })

  it("should throw an error when parsing a config file defining multiple projects", async () => {
    await expectError(
      async () => await loadConfig(projectPathDuplicateProjects, projectPathDuplicateProjects),
      (err) => {
        expect(err.message).to.match(/Multiple project declarations/)
      }
    )
  })

  it("should return [] if config file is not found", async () => {
    const parsed = await loadConfig("/thisdoesnotexist", "/thisdoesnotexist")
    expect(parsed).to.eql([])
  })

  it("should ignore empty documents in multi-doc YAML", async () => {
    const path = resolve(dataDir, "test-projects", "empty-doc")
    const parsed = await loadConfig(path, path)
    expect(parsed).to.eql([
      {
        apiVersion: DEFAULT_API_VERSION,
        kind: "Project",
        name: "foo",
        path,
        configPath: resolve(path, "garden.yml"),
      },
    ])
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
