import { expect } from "chai"
import { loadConfig } from "../../../src/config/base"
import { resolve } from "path"
import { dataDir, expectError } from "../../helpers"

const projectPathA = resolve(dataDir, "test-project-a")
const modulePathA = resolve(projectPathA, "module-a")

const projectPathMultipleModules = resolve(dataDir, "test-project-multiple-module-config")
const modulePathAMultiple = resolve(projectPathMultipleModules, "module-a")

const projectPathDuplicateProjects = resolve(dataDir, "test-project-duplicate-project-config")

describe("loadConfig", () => {

  it("should not throw an error if no file was found", async () => {
    const parsed = await loadConfig(projectPathA, resolve(projectPathA, "non-existent-module"))

    expect(parsed).to.eql(undefined)
  })

  it("should throw a config error if the file couldn't be parsed°", async () => {
    const projectPath = resolve(dataDir, "test-project-invalid-config")
    await expectError(
      async () => await loadConfig(projectPath, resolve(projectPath, "invalid-syntax-module")),
      (err) => {
        expect(err.message).to.match(/Could not parse/)
      })
  })

  it("should include the module's relative path in the error message for invalid config", async () => {
    const projectPath = resolve(dataDir, "test-project-invalid-config")
    await expectError(
      async () => await loadConfig(projectPath, resolve(projectPath, "invalid-config-module")),
      (err) => {
        expect(err.message).to.match(/invalid-config-module\/garden.yml/)
      })
  })

  // TODO: test more cases
  it("should load and parse a project config", async () => {
    const parsed = await loadConfig(projectPathA, projectPathA)

    expect(parsed!.project).to.eql({
      apiVersion: "0",
      name: "test-project-a",
      defaultEnvironment: "local",
      sources: [],
      environmentDefaults: {
        providers: [],
        variables: { some: "variable" },
      },
      environments: [
        {
          name: "local",
          providers: [
            { name: "test-plugin" },
            { name: "test-plugin-b" },
          ],
          variables: {},
        },
        {
          name: "other",
          providers: [],
          variables: {},
        },
      ],
    })
  })

  it("should load and parse a module config", async () => {
    const parsed = await loadConfig(projectPathA, modulePathA)

    expect(parsed!.modules).to.eql([
      {
        apiVersion: "0",
        name: "module-a",
        type: "test",
        description: undefined,
        repositoryUrl: undefined,
        allowPublish: true,
        build: { command: ["echo", "A"], dependencies: [] },
        outputs: {},
        path: modulePathA,

        spec: {
          services: [{ name: "service-a" }],
          tasks: [{
            name: "task-a",
            command: ["echo", "OK"],
          }],
          tests: [{
            name: "unit",
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

    expect(parsed!.project).to.eql({
      apiVersion: "0",
      defaultEnvironment: "local",
      environmentDefaults: {
        providers: [],
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
          variables: {},
        },
        {
          name: "other",
          providers: [],
          variables: {},
        },
      ],
      name: "test-project-multiple-modules",
      sources: [],
    })

    expect(parsed!.modules).to.eql([{
      apiVersion: "0",
      name: "module-from-project-config",
      type: "test",
      description: undefined,
      repositoryUrl: undefined,
      allowPublish: true,
      build: { command: ["echo", "project"], dependencies: [] },
      outputs: {},
      path: projectPathMultipleModules,
      serviceConfigs: [],
      spec: {},
      testConfigs: [],
      taskConfigs: [],
    }])
  })

  it("should load and parse a config file defining multiple modules", async () => {
    const parsed = await loadConfig(projectPathMultipleModules, modulePathAMultiple)

    expect(parsed!.modules).to.eql([
      {
        apiVersion: "0",
        name: "module-a1",
        type: "test",
        allowPublish: true,
        description: undefined,
        repositoryUrl: undefined,
        build: {
          command: ["echo", "A1"],
          dependencies: [
            { name: "module-from-project-config", copy: [] },
          ],
        },
        outputs: {},
        path: modulePathAMultiple,
        serviceConfigs: [],
        spec: {
          services: [{ name: "service-a1" }],
          tests: [{ name: "unit", command: ["echo", "OK"] }],
          tasks: [{ name: "task-a1", command: ["echo", "OK"] }],
        },
        testConfigs: [],
        taskConfigs: [],
      },
      {
        apiVersion: "0",
        name: "module-a2",
        type: "test",
        allowPublish: true,
        description: undefined,
        repositoryUrl: undefined,
        build: { command: ["echo", "A2"], dependencies: [] },
        outputs: {},
        path: modulePathAMultiple,
        serviceConfigs: [],
        spec: {
          services: [{ name: "service-a2" }],
          tests: [{ name: "unit", command: ["echo", "OK"] }],
          tasks: [{ name: "task-a2", command: ["echo", "OK"] }],
        },
        testConfigs: [],
        taskConfigs: [],
      },
    ])
  })

  it("should throw an error when parsing a config file defining multiple projects", async () => {
    await expectError(
      async () => await loadConfig(projectPathDuplicateProjects, projectPathDuplicateProjects),
      (err) => {
        expect(err.message).to.match(/Multiple project declarations/)
      })
  })

  it("should return undefined if config file is not found", async () => {
    const parsed = await loadConfig("/thisdoesnotexist", "/thisdoesnotexist")
    expect(parsed).to.be.undefined
  })

})
