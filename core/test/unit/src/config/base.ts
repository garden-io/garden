/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import {
  loadConfigResources,
  findProjectConfig,
  prepareProjectResource,
  noTemplateFields,
  validateRawConfig,
  configTemplateKind,
  loadAndValidateYaml,
} from "../../../../src/config/base.js"
import { resolve, join } from "path"
import { expectError, expectFuzzyMatch, getDataDir, getDefaultProjectConfig } from "../../../helpers.js"
import { DEFAULT_BUILD_TIMEOUT_SEC, GardenApiVersion } from "../../../../src/constants.js"
import { safeDumpYaml } from "../../../../src/util/serialization.js"
import { getRootLogger } from "../../../../src/logger/logger.js"
import { resetNonRepeatableWarningHistory } from "../../../../src/warnings.js"
import { omit } from "lodash-es"
import { dedent } from "../../../../src/util/string.js"
import { omitInternal } from "../../../../src/garden.js"
import { serialiseUnresolvedTemplates } from "../../../../src/template/types.js"
import stripAnsi from "strip-ansi"
import { DOCS_DEPRECATION_GUIDE } from "../../../../src/util/deprecations.js"

const projectPathA = getDataDir("test-project-a")
const modulePathA = resolve(projectPathA, "module-a")

const projectPathMultipleModules = getDataDir("test-projects", "multiple-module-config")
const modulePathAMultiple = resolve(projectPathMultipleModules, "module-a")

const projectPathDuplicateProjects = getDataDir("test-project-duplicate-project-config")
const projectPathMultipleProjects = getDataDir("test-project-multiple-project-configs")
const logger = getRootLogger()
const log = logger.createLog()

describe("prepareProjectResource", () => {
  const projectResourceTemplate = {
    apiVersion: GardenApiVersion.v2,
    kind: "Project",
    name: "test",
    path: "/tmp/", // the path does not matter in this test suite
    defaultEnvironment: "default",
    environments: [{ name: "default", defaultNamespace: null, variables: {} }],
    providers: [{ name: "foo" }],
    variables: {},
  }

  beforeEach(() => {
    // we reset the non repeatable warning before each test to make sure that a
    // previously displayed warning is logged in all tests
    resetNonRepeatableWarningHistory()
  })

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

  it("should fall back to the previous apiVersion when not defined", async () => {
    const projectResource = {
      ...projectResourceTemplate,
      apiVersion: undefined,
    }

    const returnedProjectResource = prepareProjectResource(log, projectResource)

    // The apiVersion is set to the previous version for backwards compatibility.
    const expectedProjectResource = {
      ...projectResource,
      apiVersion: GardenApiVersion.v0,
    }
    expect(returnedProjectResource).to.eql(expectedProjectResource)

    const logEntry = log.getLatestEntry()
    expect(logEntry.msg).to.include(`"apiVersion" is missing in the Project config`)
  })

  it("should log a warning if the apiVersion is garden.io/v0", async () => {
    const projectResource = {
      ...projectResourceTemplate,
      apiVersion: GardenApiVersion.v0,
    }

    const returnedProjectResource = prepareProjectResource(log, projectResource)
    expect(returnedProjectResource).to.eql(projectResource)

    const logEntry = log.getLatestEntry()
    const sanitizedMsg = stripAnsi((logEntry.msg as string) || "")
    const expectedMessages = [
      "WARNING:",
      `To make sure your configuration does not break when we release Garden 0.14, please follow the steps at ${DOCS_DEPRECATION_GUIDE}`,
    ]
    expectFuzzyMatch(sanitizedMsg, expectedMessages)
  })
  it("should log a warning if the apiVersion is garden.io/v1", async () => {
    const projectResource = {
      ...projectResourceTemplate,
      apiVersion: GardenApiVersion.v2,
    }

    const returnedProjectResource = prepareProjectResource(log, projectResource)
    expect(returnedProjectResource).to.eql(projectResource)

    const logEntry = log.getLatestEntry()
    const sanitizedMsg = stripAnsi((logEntry.msg as string) || "")
    const expectedMessages = [
      "WARNING:",
      `To make sure your configuration does not break when we release Garden 0.14, please follow the steps at ${DOCS_DEPRECATION_GUIDE}`,
    ]
    expectFuzzyMatch(sanitizedMsg, expectedMessages)
  })
  it("should not log a warning if the apiVersion is garden.io/v2", async () => {
    const projectResource = {
      ...projectResourceTemplate,
      apiVersion: GardenApiVersion.v2,
    }

    const latestBefore = log.getLatestEntry()
    const returnedProjectResource = prepareProjectResource(log, projectResource)
    const latestAfter = log.getLatestEntry()

    expect(returnedProjectResource).to.eql(projectResource)

    // Expect that we didn't print a warning
    expect(latestBefore).to.equal(latestAfter)
  })
})

describe("loadConfigResources", () => {
  it("should throw a config error if the file couldn't be parsed", async () => {
    const projectPath = getDataDir("test-project-invalid-config")
    await expectError(
      async () =>
        await loadConfigResources(log, projectPath, resolve(projectPath, "invalid-syntax-module", "garden.yml")),
      { contains: ["could not parse", "duplicated mapping key"] }
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
        contains: ["Error validating module (missing-type/garden.yml)", "type is required"],
      }
    )
  })

  it("should throw if a module config doesn't specify a name", async () => {
    const projectPath = getDataDir("test-project-invalid-config")
    await expectError(
      async () => await loadConfigResources(log, projectPath, resolve(projectPath, "missing-name", "garden.yml")),
      {
        contains: ["Error validating module (missing-name/garden.yml)", "name is required"],
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

    expect(parsed.length).to.equal(1)

    expect(omit(parsed[0], "internal")).to.eql({
      apiVersion: GardenApiVersion.v2,
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
    })
  })

  it("should load and parse a module config", async () => {
    const configPath = resolve(modulePathA, "garden.yml")
    const configResources = await loadConfigResources(log, projectPathA, configPath)
    expect(configResources.length).to.equal(1)

    const configResource = serialiseUnresolvedTemplates(omitInternal(configResources[0]))
    expect(configResource).to.eql({
      apiVersion: GardenApiVersion.v0,
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
      build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
      local: undefined,
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
    })
  })

  it("should load and parse a module template", async () => {
    const projectPath = getDataDir("test-projects", "module-templates")
    const configFilePath = resolve(projectPath, "templates.garden.yml")
    const configResources = await loadConfigResources(log, projectPath, configFilePath)
    expect(configResources.length).to.equal(1)

    const configResource = serialiseUnresolvedTemplates(omitInternal(configResources[0]))
    expect(configResource).to.eql({
      kind: configTemplateKind,
      name: "combo",

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
    })
  })

  it("should load and parse a config file defining a project and a module", async () => {
    const configPath = resolve(projectPathMultipleModules, "garden.yml")
    const parsed = await loadConfigResources(log, projectPathMultipleModules, configPath)

    expect(parsed.length).to.equal(2)

    expect(parsed.map((p) => omit(p, "internal"))).to.eql([
      {
        apiVersion: GardenApiVersion.v2,
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
        apiVersion: GardenApiVersion.v0,
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
        build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        local: undefined,
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

    expect(parsed.length).to.equal(2)

    expect(parsed.map((p) => omit(p, "internal"))).to.eql([
      {
        apiVersion: GardenApiVersion.v0,
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
          dependencies: ["module-from-project-config"],
          timeout: DEFAULT_BUILD_TIMEOUT_SEC,
        },
        local: undefined,
        path: modulePathAMultiple,
        serviceConfigs: [],
        spec: {
          build: {
            command: ["echo", "A1"],
            dependencies: ["module-from-project-config"],
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
        apiVersion: GardenApiVersion.v0,
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
        build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
        local: undefined,
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

    expect(parsed.length).to.equal(1)

    expect(omit(parsed[0], "internal")).to.eql({
      apiVersion: GardenApiVersion.v2,
      kind: "Project",
      path: projectPath,
      configPath,
      name: "test-project-a",
      environments: [{ name: "local" }, { name: "other" }],
      providers: [{ name: "test-plugin", environments: ["local"] }, { name: "test-plugin-b" }],
    })
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

    expect(omit(parsed[0], "internal")).to.eql({
      apiVersion: GardenApiVersion.v2,
      kind: "Project",
      name: "foo",
      environments: [{ name: "local" }],
      path,
      configPath,
    })
  })
})

describe("findProjectConfig", async () => {
  const customConfigPath = getDataDir("test-projects", "custom-config-names")

  it("should find the project config when path is projectRoot", async () => {
    const project = await findProjectConfig({ log, path: projectPathA })
    expect(project && project.path).to.eq(projectPathA)
  })

  it("should find the project config when path is a subdir of projectRoot", async () => {
    // modulePathA is a subdir of projectPathA
    const project = await findProjectConfig({ log, path: modulePathA })
    expect(project && project.path).to.eq(projectPathA)
  })

  it("should find the project config when path is projectRoot and config is in a custom-named file", async () => {
    const project = await findProjectConfig({ log, path: customConfigPath })
    expect(project && project.path).to.eq(customConfigPath)
  })

  it("should find the project root from a subdir of projectRoot and config is in a custom-named file", async () => {
    const modulePath = join(customConfigPath, "module-a")
    const project = await findProjectConfig({ log, path: modulePath })
    expect(project && project.path).to.eq(customConfigPath)
  })

  it("should throw an error if multiple projects are found in same config file", async () => {
    await expectError(async () => await findProjectConfig({ log, path: projectPathDuplicateProjects }), {
      contains: "Multiple project declarations found in",
    })
  })

  it("should throw an error if multiple projects are found in multiple config files", async () => {
    await expectError(async () => await findProjectConfig({ log, path: projectPathMultipleProjects }), {
      contains: "Multiple project declarations found at paths",
    })
  })
})

describe("loadAndValidateYaml", () => {
  it("should load and validate yaml and annotate every document with the source", async () => {
    const yaml = dedent`
      apiVersion: v1
      kind: Test
      spec:
        foo: bar
      name: foo
    `

    const yamlDocs = await loadAndValidateYaml({
      content: yaml,
      sourceDescription: "foo.yaml in directory bar",
      filename: "bar/foo.yaml",
    })

    expect(yamlDocs).to.have.length(1)
    expect(yamlDocs[0].source).to.equal(yaml)
    expect(yamlDocs[0].toJS()).to.eql({
      apiVersion: "v1",
      kind: "Test",
      spec: {
        foo: "bar",
      },
      name: "foo",
    })
  })

  it("supports loading multiple documents", async () => {
    const yaml = dedent`
      name: doc1
      ---
      name: doc2
      ---
      name: doc3
    `

    const yamlDocs = await loadAndValidateYaml({
      content: yaml,
      sourceDescription: "foo.yaml in directory bar",
      filename: "bar/foo.yaml",
    })

    expect(yamlDocs).to.have.length(3)

    // they all share the same source:
    expect(yamlDocs[0].source).to.equal(yaml)
    expect(yamlDocs[1].source).to.equal(yaml)
    expect(yamlDocs[2].source).to.equal(yaml)

    expect(yamlDocs[0].toJS()).to.eql({
      name: "doc1",
    })
    expect(yamlDocs[1].toJS()).to.eql({
      name: "doc2",
    })
    expect(yamlDocs[2].toJS()).to.eql({
      name: "doc3",
    })
  })

  it("should use the yaml 1.2 standard by default for reading", async () => {
    const yaml = dedent`
      # yaml 1.2 will interpret this as decimal number 777 (in accordance to the standard)
      oldYamlOctalNumber: 0777

      # yaml 1.2 will interpret this as octal number 0o777 (in accordance to the standard)
      newYamlOctalNumber: 0o777
    `

    const yamlDocs = await loadAndValidateYaml({
      content: yaml,
      sourceDescription: "foo.yaml in directory bar",
      filename: "bar/foo.yaml",
    })

    expect(yamlDocs).to.have.length(1)
    expect(yamlDocs[0].source).to.equal(yaml)
    expect(yamlDocs[0].toJS()).to.eql({
      oldYamlOctalNumber: 777,
      newYamlOctalNumber: 0o777,
    })
  })

  it("should allows using the 1.1 yaml standard with the '%YAML 1.1' directive", async () => {
    const yaml = dedent`
      %YAML 1.1
      ---

      # yaml 1.1 will interpret this as octal number 0o777 (in accordance to the standard)
      oldYamlOctalNumber: 0777

      # yaml 1.1 will interpret this as string (in accordance to the standard)
      newYamlOctalNumber: 0o777
    `

    const yamlDocs = await loadAndValidateYaml({
      content: yaml,
      sourceDescription: "foo.yaml in directory bar",
      filename: "bar/foo.yaml",
    })

    expect(yamlDocs).to.have.length(1)
    expect(yamlDocs[0].source).to.equal(yaml)
    expect(yamlDocs[0].toJS()).to.eql({
      oldYamlOctalNumber: 0o777,
      newYamlOctalNumber: "0o777",
    })
  })

  it("should allow using the 1.1 yaml standard using the version parameter", async () => {
    const yaml = dedent`
      # yaml 1.1 will interpret this as octal number 0o777 (in accordance to the standard)
      oldYamlOctalNumber: 0777

      # yaml 1.1 will interpret this as string (in accordance to the standard)
      newYamlOctalNumber: 0o777
    `

    // we use the version parameter to force the yaml 1.1 standard
    const yamlDocs = await loadAndValidateYaml({
      content: yaml,
      sourceDescription: "foo.yaml in directory bar",
      filename: "bar/foo.yaml",
      version: "1.1",
    })

    expect(yamlDocs).to.have.length(1)
    expect(yamlDocs[0].source).to.equal(yaml)
    expect(yamlDocs[0].toJS()).to.eql({
      oldYamlOctalNumber: 0o777,
      newYamlOctalNumber: "0o777",
    })
  })

  it("should throw ConfigurationError if yaml contains reference to undefined alias", async () => {
    const yaml = dedent`
      foo: *bar
    `

    await expectError(
      () =>
        loadAndValidateYaml({
          content: yaml,
          sourceDescription: "foo.yaml in directory bar",
          filename: "bar/foo.yaml",
        }),
      (err) => {
        expect(err.message).to.eql(dedent`
          Could not parse foo.yaml in directory bar as valid YAML: YAMLException: unidentified alias "bar" (1:10)

           1 | foo: *bar
          --------------^
        `)
      }
    )
  })
})
