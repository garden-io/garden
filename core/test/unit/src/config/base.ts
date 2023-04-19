/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import {
  loadConfigResources,
  findProjectConfig,
  prepareModuleResource,
  prepareProjectResource,
  noTemplateFields,
  validateRawConfig,
  configTemplateKind,
} from "../../../../src/config/base"
import { resolve, join } from "path"
import { expectError, getDataDir, getDefaultProjectConfig } from "../../../helpers"
import { DEFAULT_API_VERSION } from "../../../../src/constants"
import { defaultDotIgnoreFile } from "../../../../src/util/fs"
import { safeDumpYaml } from "../../../../src/util/serialization"
import { getRootLogger } from "../../../../src/logger/logger"
import { ConfigurationError } from "../../../../src/exceptions"

const projectPathA = getDataDir("test-project-a")
const modulePathA = resolve(projectPathA, "module-a")

const projectPathMultipleModules = getDataDir("test-projects", "multiple-module-config")
const modulePathAMultiple = resolve(projectPathMultipleModules, "module-a")

const projectPathDuplicateProjects = getDataDir("test-project-duplicate-project-config")
const log = getRootLogger().createLog()

// TODO-0.14: remove this describe block in 0.14
describe("prepareProjectResource", () => {
  const projectResourceTemplate = {
    apiVersion: DEFAULT_API_VERSION,
    kind: "Project",
    name: "test",
    path: "/tmp/", // the path does not matter in this test suite
    defaultEnvironment: "default",
    environments: [{ name: "default", defaultNamespace: null, variables: {} }],
    providers: [{ name: "foo" }],
    variables: {},
  }

  it("no changes if new `dotIgnoreFile` field is provided explicitly", () => {
    const projectResource = {
      ...projectResourceTemplate,
      dotIgnoreFile: ".somedotignore",
    }

    const migratedProjectResource = prepareProjectResource(log, projectResource)
    expect(migratedProjectResource).to.eql(projectResource)
  })

  it("no changes if neither new `dotIgnoreFile` nor `dotIgnoreFiles` fields are defined in the project config", () => {
    const projectResource = {
      ...projectResourceTemplate,
    }

    const migratedProjectResource = prepareProjectResource(log, projectResource)
    expect(migratedProjectResource).to.eql(projectResource)
  })

  it("empty `dotIgnoreFiles` array is automatically remapped to the default `dotIgnoreFile`", () => {
    const projectResource = {
      ...projectResourceTemplate,
      dotIgnoreFiles: [],
    }

    const migratedProjectResource = prepareProjectResource(log, projectResource)
    const expectedProjectResource = {
      ...projectResource,
      dotIgnoreFile: defaultDotIgnoreFile,
    }
    expect(migratedProjectResource).to.eql(expectedProjectResource)
  })

  it("singe-valued `dotIgnoreFiles` array is automatically remapped to scalar `dotIgnoreFile`", () => {
    const projectResource = {
      ...projectResourceTemplate,
      dotIgnoreFiles: [".somedotignore"],
    }

    const migratedProjectResource = prepareProjectResource(log, projectResource)
    const expectedProjectResource = {
      ...projectResource,
      dotIgnoreFile: ".somedotignore",
    }
    expect(migratedProjectResource).to.eql(expectedProjectResource)
  })

  it("throw an error if multi-valued `dotIgnoreFiles` array is defined in the project config", () => {
    const projectResource = {
      ...projectResourceTemplate,
      dotIgnoreFiles: [".somedotignore", ".gitignore"],
    }

    const processConfigAction = () => prepareProjectResource(log, projectResource)
    expect(processConfigAction).to.throw(
      "Cannot auto-convert array-field `dotIgnoreFiles` to scalar `dotIgnoreFile`: multiple values found in the array [.somedotignore, .gitignore]"
    )
  })

  it("should throw an error if the apiVersion is not defined", async () => {
    const projectResource = {
      ...projectResourceTemplate,
      apiVersion: undefined,
    }

    const processConfigAction = () => prepareProjectResource(log, projectResource)
    expect(processConfigAction).to.throw(ConfigurationError, /"apiVersion" is missing/)
  })

  it("should throw an error if the apiVersion is not known", async () => {
    const projectResource = {
      ...projectResourceTemplate,
      apiVersion: "unknown",
    }

    const processConfigAction = () => prepareProjectResource(log, projectResource)
    expect(processConfigAction).to.throw(ConfigurationError, /"apiVersion: unknown" is unknown/)
  })
})

describe("loadConfigResources", () => {
  it("should throw a config error if the file couldn't be parsed", async () => {
    const projectPath = getDataDir("test-project-invalid-config")
    await expectError(
      async () =>
        await loadConfigResources(log, projectPath, resolve(projectPath, "invalid-syntax-module", "garden.yml")),
      { contains: ["Could not parse", "duplicated mapping key"] }
    )
  })

  it("should throw if a config doesn't specify a kind", async () => {
    const projectPath = getDataDir("test-project-invalid-config")
    await expectError(
      async () => await loadConfigResources(log, projectPath, resolve(projectPath, "missing-kind", "garden.yml")),
      { contains: "Missing `kind` field in config at missing-kind/garden.yml" }
    )
  })

  it("should throw if a config specifies an invalid kind", async () => {
    const projectPath = getDataDir("test-project-invalid-config")
    await expectError(
      async () =>
        await loadConfigResources(log, projectPath, resolve(projectPath, "invalid-config-kind", "garden.yml")),
      { contains: "Unknown kind banana in config at invalid-config-kind/garden.yml" }
    )
  })

  it("should throw if a module config doesn't specify a type", async () => {
    const projectPath = getDataDir("test-project-invalid-config")
    await expectError(
      async () => await loadConfigResources(log, projectPath, resolve(projectPath, "missing-type", "garden.yml")),
      {
        contains: "Error validating module (missing-type/garden.yml): key .type is required",
      }
    )
  })

  it("should throw if a module config doesn't specify a name", async () => {
    const projectPath = getDataDir("test-project-invalid-config")
    await expectError(
      async () => await loadConfigResources(log, projectPath, resolve(projectPath, "missing-name", "garden.yml")),
      {
        contains: "Error validating module (missing-name/garden.yml): key .name is required",
      }
    )
  })

  it("throws if basic fields contain template strings", async () => {
    for (const field of noTemplateFields) {
      const basicProjectConfig = getDefaultProjectConfig()
      basicProjectConfig[field] = '${camelCase("No templating should be allowed here")}'
      const configRaw = safeDumpYaml(basicProjectConfig)
      await expectError(
        async () =>
          validateRawConfig({ log, rawConfig: configRaw, configPath: "fake/path", projectRoot: "fake/projec/root" }),
        { contains: "does not allow templating" }
      )
    }
  })

  // TODO: test more cases
  it("should load and parse a project config", async () => {
    const configPath = resolve(projectPathA, "garden.yml")
    const parsed = await loadConfigResources(log, projectPathA, configPath)

    expect(parsed).to.eql([
      {
        apiVersion: DEFAULT_API_VERSION,
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
        providers: [{ name: "test-plugin" }, { name: "test-plugin-b", environments: ["local"] }],
        outputs: [
          {
            name: "taskName",
            value: "task-a",
          },
        ],
        variables: { some: "variable" },
      },
    ])
  })

  it("should load and parse a module config", async () => {
    const configPath = resolve(modulePathA, "garden.yml")
    const parsed = await loadConfigResources(log, projectPathA, configPath)

    expect(parsed).to.eql([
      {
        apiVersion: DEFAULT_API_VERSION,
        kind: "Module",
        name: "module-a",
        type: "test",
        configPath,
        description: undefined,
        disabled: undefined,
        generateFiles: undefined,
        include: undefined,
        exclude: undefined,
        repositoryUrl: undefined,
        allowPublish: undefined,
        build: { dependencies: [] },
        path: modulePathA,
        variables: { msg: "OK" },
        varfile: undefined,

        spec: {
          build: {
            command: ["echo", "A"],
            dependencies: [],
          },
          services: [{ name: "service-a" }],
          tasks: [
            {
              name: "task-a",
              command: ["echo", "${var.msg}"],
            },
            {
              name: "task-a2",
              command: ["echo", "${environment.name}-${var.msg}"],
            },
          ],
          tests: [
            {
              name: "unit",
              command: ["echo", "${var.msg}"],
            },
            {
              name: "integration",
              command: ["echo", "${var.msg}"],
              dependencies: ["service-a"],
            },
          ],
        },

        serviceConfigs: [],
        taskConfigs: [],
        testConfigs: [],
      },
    ])
  })

  it("should load and parse a module template", async () => {
    const projectPath = getDataDir("test-projects", "module-templates")
    const configFilePath = resolve(projectPath, "templates.garden.yml")
    const parsed: any = await loadConfigResources(log, projectPath, configFilePath)

    expect(parsed).to.eql([
      {
        kind: configTemplateKind,
        name: "combo",

        internal: {
          basePath: projectPath,
          configFilePath,
        },

        inputsSchemaPath: "module-templates.json",
        modules: [
          {
            type: "test",
            name: "${parent.name}-${inputs.name}-a",
            include: [],
            build: {
              command: ["${inputs.value}"],
            },
            generateFiles: [
              {
                targetPath: "module-a.log",
                value: "hellow",
              },
            ],
          },
          {
            type: "test",
            name: "${parent.name}-${inputs.name}-b",
            include: [],
            build: {
              dependencies: ["${parent.name}-${inputs.name}-a"],
            },
            generateFiles: [
              {
                targetPath: "module-b.log",
                sourcePath: "source.txt",
              },
            ],
          },
          {
            type: "test",
            name: "${parent.name}-${inputs.name}-c",
            include: [],
            build: {
              dependencies: ["${parent.name}-${inputs.name}-a"],
            },
            generateFiles: [
              {
                targetPath: ".garden/subdir/module-c.log",
                value:
                  'Hello I am string!\ninput: ${inputs.value}\nmodule reference: ${modules["${parent.name}-${inputs.name}-a"].path}\n',
              },
            ],
          },
        ],
      },
    ])
  })

  it("should load and parse a config file defining a project and a module", async () => {
    const configPath = resolve(projectPathMultipleModules, "garden.yml")
    const parsed = await loadConfigResources(log, projectPathMultipleModules, configPath)

    expect(parsed).to.eql([
      {
        apiVersion: DEFAULT_API_VERSION,
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
        apiVersion: DEFAULT_API_VERSION,
        kind: "Module",
        name: "module-from-project-config",
        type: "test",
        configPath,
        description: undefined,
        disabled: undefined,
        generateFiles: undefined,
        include: ["*"],
        exclude: undefined,
        repositoryUrl: undefined,
        allowPublish: undefined,
        build: { dependencies: [] },
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
        variables: undefined,
        varfile: undefined,
      },
    ])
  })

  it("should load and parse a config file defining multiple modules", async () => {
    const configPath = resolve(modulePathAMultiple, "garden.yml")
    const parsed = await loadConfigResources(log, projectPathMultipleModules, configPath)

    expect(parsed).to.eql([
      {
        apiVersion: DEFAULT_API_VERSION,
        kind: "Module",
        name: "module-a1",
        type: "test",
        configPath,
        allowPublish: undefined,
        description: undefined,
        disabled: undefined,
        generateFiles: undefined,
        include: ["*"],
        exclude: undefined,
        repositoryUrl: undefined,
        build: {
          dependencies: [{ name: "module-from-project-config", copy: [] }],
        },
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
        variables: undefined,
        varfile: undefined,
      },
      {
        apiVersion: DEFAULT_API_VERSION,
        kind: "Module",
        name: "module-a2",
        type: "test",
        configPath,
        allowPublish: undefined,
        description: undefined,
        disabled: undefined,
        generateFiles: undefined,
        include: ["*"],
        exclude: undefined,
        repositoryUrl: undefined,
        build: { dependencies: [] },
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
        variables: undefined,
        varfile: undefined,
      },
    ])
  })

  it("should load a project config with a top-level provider field", async () => {
    const projectPath = getDataDir("test-projects", "new-provider-spec")
    const configPath = resolve(projectPath, "garden.yml")
    const parsed = await loadConfigResources(log, projectPath, configPath)

    expect(parsed).to.eql([
      {
        apiVersion: DEFAULT_API_VERSION,
        kind: "Project",
        path: projectPath,
        configPath,
        name: "test-project-a",
        environments: [{ name: "local" }, { name: "other" }],
        providers: [{ name: "test-plugin", environments: ["local"] }, { name: "test-plugin-b" }],
      },
    ])
  })

  it("should throw if config file is not found", async () => {
    await expectError(async () => await loadConfigResources(log, "/thisdoesnotexist", "/thisdoesnotexist"), {
      contains: "Could not find configuration file at /thisdoesnotexist",
    })
  })

  it("should ignore empty documents in multi-doc YAML", async () => {
    const path = getDataDir("test-projects", "empty-doc")
    const configPath = resolve(path, "garden.yml")
    const parsed = await loadConfigResources(log, path, configPath)

    expect(parsed).to.eql([
      {
        apiVersion: DEFAULT_API_VERSION,
        kind: "Project",
        name: "foo",
        environments: [{ name: "local" }],
        path,
        configPath,
      },
    ])
  })
})

describe("prepareModuleResource", () => {
  it("should normalize build dependencies", async () => {
    const moduleConfigPath = resolve(modulePathA, "garden.yml")
    const parsed: any = (await loadConfigResources(log, projectPathA, moduleConfigPath))[0]
    parsed.build!.dependencies = [{ name: "apple" }, "banana", null]
    const prepared = prepareModuleResource(parsed, moduleConfigPath, projectPathA)
    expect(prepared.build!.dependencies).to.eql([
      { name: "apple", copy: [] },
      { name: "banana", copy: [] },
    ])
  })
})

describe("findProjectConfig", async () => {
  const customConfigPath = getDataDir("test-projects", "custom-config-names")

  it("should find the project config when path is projectRoot", async () => {
    const project = await findProjectConfig(log, projectPathA)
    expect(project && project.path).to.eq(projectPathA)
  })

  it("should find the project config when path is a subdir of projectRoot", async () => {
    // modulePathA is a subdir of projectPathA
    const project = await findProjectConfig(log, modulePathA)
    expect(project && project.path).to.eq(projectPathA)
  })

  it("should find the project config when path is projectRoot and config is in a custom-named file", async () => {
    const project = await findProjectConfig(log, customConfigPath)
    expect(project && project.path).to.eq(customConfigPath)
  })

  it("should find the project root from a subdir of projectRoot and config is in a custom-named file", async () => {
    const modulePath = join(customConfigPath, "module-a")
    const project = await findProjectConfig(log, modulePath)
    expect(project && project.path).to.eq(customConfigPath)
  })

  it("should throw an error if multiple projects are found", async () => {
    await expectError(async () => await findProjectConfig(log, projectPathDuplicateProjects), {
      contains: "Multiple project declarations found",
    })
  })
})
