/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"
import { actionConfigsToGraph } from "../../../../src/graph/actions.js"
import { ModuleGraph } from "../../../../src/graph/modules.js"
import type { Log } from "../../../../src/logger/log-entry.js"
import { dumpYaml } from "../../../../src/util/serialization.js"
import type { TempDirectory, TestGarden } from "../../../helpers.js"
import { createProjectConfig, expectError, makeTempGarden } from "../../../helpers.js"
import {
  DEFAULT_BUILD_TIMEOUT_SEC,
  DEFAULT_DEPLOY_TIMEOUT_SEC,
  DEFAULT_RUN_TIMEOUT_SEC,
  DEFAULT_TEST_TIMEOUT_SEC,
} from "../../../../src/constants.js"
import { getRemoteSourceLocalPath } from "../../../../src/util/ext-source-util.js"
import { clearVarfileCache } from "../../../../src/config/base.js"
import { parseTemplateCollection } from "../../../../src/template/templated-collections.js"
import { deepResolveContext } from "../../../../src/config/template-contexts/base.js"

describe("actionConfigsToGraph", () => {
  let tmpDir: TempDirectory
  let garden: TestGarden
  let log: Log

  before(async () => {
    const result = await makeTempGarden()
    tmpDir = result.tmpDir
    garden = result.garden
    log = garden.log
  })

  afterEach(() => {
    // Some tests re-use and re-write existing varfiles, so we need to clear the cache explicitly.
    clearVarfileCache()
  })

  it("resolves a Build action", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Build",
          type: "test",
          name: "foo",
          timeout: DEFAULT_BUILD_TIMEOUT_SEC,
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      actionModes: {},
      linkedSources: {},
    })

    const actions = graph.getActions()
    const action = actions[0]

    expect(actions.length).to.equal(1)
    expect(action.kind).to.equal("Build")
    expect(action.name).to.equal("foo")
    expect(action.sourcePath()).to.equal(tmpDir.path)
  })

  it("resolves a Deploy action", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Deploy",
          type: "test",
          name: "foo",
          timeout: DEFAULT_DEPLOY_TIMEOUT_SEC,
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      actionModes: {},
      linkedSources: {},
    })

    const actions = graph.getActions()
    const action = actions[0]

    expect(actions.length).to.equal(1)
    expect(action.kind).to.equal("Deploy")
    expect(action.name).to.equal("foo")
    expect(action.sourcePath()).to.equal(tmpDir.path)
  })

  it("resolves a Run action", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Run",
          type: "test",
          name: "foo",
          timeout: DEFAULT_RUN_TIMEOUT_SEC,
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      actionModes: {},
      linkedSources: {},
    })

    const actions = graph.getActions()
    const action = actions[0]

    expect(actions.length).to.equal(1)
    expect(action.kind).to.equal("Run")
    expect(action.name).to.equal("foo")
    expect(action.sourcePath()).to.equal(tmpDir.path)
  })

  it("resolves a Test action", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Test",
          type: "test",
          name: "foo",
          timeout: DEFAULT_TEST_TIMEOUT_SEC,
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      actionModes: {},
      linkedSources: {},
    })

    const actions = graph.getActions()
    const action = actions[0]

    expect(actions.length).to.equal(1)
    expect(action.kind).to.equal("Test")
    expect(action.name).to.equal("foo")
    expect(action.sourcePath()).to.equal(tmpDir.path)
  })

  it("resolves actions in groups", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [
        {
          kind: "Group",
          name: "foo",
          path: tmpDir.path,
          actions: [
            {
              kind: "Test",
              type: "test",
              name: "foo",
              timeout: DEFAULT_TEST_TIMEOUT_SEC,
              internal: {
                basePath: tmpDir.path,
              },
              spec: {},
            },
          ],
        },
      ],
      configs: [],
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      actionModes: {},
      linkedSources: {},
    })

    const actions = graph.getActions()
    const action = actions[0]

    expect(actions.length).to.equal(1)
    expect(action.kind).to.equal("Test")
    expect(action.name).to.equal("foo")
    expect(action.sourcePath()).to.equal(tmpDir.path)
  })

  it("adds dependencies from copyFrom on Build actions", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Build",
          type: "test",
          name: "foo",
          timeout: DEFAULT_BUILD_TIMEOUT_SEC,
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
        {
          kind: "Build",
          type: "test",
          name: "bar",
          timeout: DEFAULT_BUILD_TIMEOUT_SEC,
          copyFrom: [{ build: "foo", sourcePath: ".", targetPath: "app" }],
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      actionModes: {},
      linkedSources: {},
    })

    const action = graph.getBuild("bar")
    const deps = action.getDependencyReferences()

    expect(deps).to.eql([
      {
        explicit: true,
        kind: "Build",
        name: "foo",
        type: "test",
        needsExecutedOutputs: false,
        needsStaticOutputs: false,
      },
    ])
  })

  it("adds build reference on runtime actions as dependency", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Build",
          type: "test",
          name: "foo",
          timeout: DEFAULT_BUILD_TIMEOUT_SEC,
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
        {
          kind: "Deploy",
          type: "test",
          name: "bar",
          build: "foo",
          timeout: DEFAULT_DEPLOY_TIMEOUT_SEC,
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      actionModes: {},
      linkedSources: {},
    })

    const action = graph.getDeploy("bar")
    const deps = action.getDependencyReferences()

    expect(deps).to.eql([
      {
        explicit: true,
        kind: "Build",
        type: "test",
        name: "foo",
        needsExecutedOutputs: false,
        needsStaticOutputs: false,
      },
    ])
  })

  it("adds implicit dependencies from template references in config", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: parseTemplateCollection({
        value: [
          {
            kind: "Build",
            type: "test",
            name: "foo",
            timeout: DEFAULT_BUILD_TIMEOUT_SEC,
            internal: {
              basePath: tmpDir.path,
            },
            spec: {},
          },
          {
            kind: "Build",
            type: "test",
            name: "bar",
            timeout: DEFAULT_BUILD_TIMEOUT_SEC,
            internal: {
              basePath: tmpDir.path,
            },
            spec: {
              command: ["echo", "${actions.build.foo.version}"],
            },
          },
        ] as const,
        source: {
          path: [],
        },
      }),
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      actionModes: {},
      linkedSources: {},
    })

    const action = graph.getBuild("bar")
    const deps = action.getDependencyReferences()

    expect(deps).to.eql([
      {
        explicit: false,
        kind: "Build",
        type: "test",
        name: "foo",
        needsExecutedOutputs: false,
        needsStaticOutputs: true,
      },
    ])
  })

  it("flags implicit dependency as needing execution if a non-static output is referenced", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: parseTemplateCollection({
        value: [
          {
            kind: "Build",
            type: "test",
            name: "foo",
            timeout: DEFAULT_BUILD_TIMEOUT_SEC,
            internal: {
              basePath: tmpDir.path,
            },
            spec: {},
          },
          {
            kind: "Build",
            type: "test",
            name: "bar",
            timeout: DEFAULT_BUILD_TIMEOUT_SEC,
            internal: {
              basePath: tmpDir.path,
            },
            spec: {
              command: ["echo", "${actions.build.foo.outputs.bar}"],
            },
          },
        ] as const,
        source: { path: [] },
      }),
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      actionModes: {},
      linkedSources: {},
    })

    const action = graph.getBuild("bar")
    const deps = action.getDependencyReferences()

    expect(deps).to.eql([
      {
        explicit: false,
        kind: "Build",
        type: "test",
        name: "foo",
        needsExecutedOutputs: true,
        needsStaticOutputs: false,
      },
    ])
  })

  it("does not mark an implicit dependency needing execution if a static output of dependency is referenced", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: parseTemplateCollection({
        value: [
          {
            kind: "Build",
            type: "container",
            name: "foo",
            timeout: DEFAULT_BUILD_TIMEOUT_SEC,
            internal: {
              basePath: tmpDir.path,
            },
            spec: {},
          },
          {
            kind: "Deploy",
            type: "test",
            name: "bar",
            timeout: DEFAULT_BUILD_TIMEOUT_SEC,
            internal: {
              basePath: tmpDir.path,
            },
            spec: {
              command: ["echo", "${actions.build.foo.outputs.deploymentImageName}"],
            },
          },
        ] as const,
        source: { path: [] },
      }),
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      actionModes: {},
      linkedSources: {},
    })

    const action = graph.getDeploy("bar")
    const deps = action.getDependencyReferences()

    expect(deps).to.eql([
      {
        explicit: false,
        kind: "Build",
        type: "container",
        name: "foo",
        needsExecutedOutputs: false,
        needsStaticOutputs: true,
      },
    ])
  })

  it("correctly sets compatibleTypes for an action type with no base", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Build",
          type: "test",
          name: "foo",
          timeout: DEFAULT_BUILD_TIMEOUT_SEC,
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      actionModes: {},
      linkedSources: {},
    })

    const action = graph.getBuild("foo")

    expect(action.isCompatible("test")).to.be.true
  })

  // TODO-G2
  it.skip("correctly sets compatibleTypes for an action type with a base", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Build",
          type: "test",
          name: "foo",
          timeout: DEFAULT_BUILD_TIMEOUT_SEC,
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      actionModes: {},
      linkedSources: {},
    })

    const action = graph.getBuild("bar")

    expect(action.isCompatible("base")).to.be.true
  })

  it("sets variables for the action", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: parseTemplateCollection({
        value: [
          {
            kind: "Build",
            type: "test",
            name: "foo",
            timeout: DEFAULT_BUILD_TIMEOUT_SEC,
            variables: {
              projectName: "${project.name}" as string,
            },
            internal: {
              basePath: tmpDir.path,
            },
            spec: {},
          },
        ] as const,
        source: { path: [] },
      }),
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      actionModes: {},
      linkedSources: {},
    })

    const action = graph.getBuild("foo")
    const varContext = action.getVariablesContext()
    const resolved = deepResolveContext("action variables", varContext, garden.getProjectConfigContext())

    expect(resolved).to.eql({
      projectName: garden.projectName,
    })
  })

  it("loads varfiles for the action and resolve template strings in varfile", async () => {
    const varfilePath = join(tmpDir.path, "varfile.yml")
    await dumpYaml(varfilePath, {
      projectName: "${project.name}",
    })

    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Build",
          type: "test",
          name: "foo",
          timeout: DEFAULT_BUILD_TIMEOUT_SEC,
          varfiles: [varfilePath],
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      actionModes: {},
      linkedSources: {},
    })

    const action = graph.getBuild("foo")
    const varContext = action.getVariablesContext()

    expect(
      varContext.resolve({ nodePath: [], key: [], opts: {}, rootContext: garden.getProjectConfigContext() })
    ).to.eql({
      found: true,
      resolved: {
        projectName: "test",
      },
    })
  })

  it("loads optional varfiles for the action and resolve template strings in varfile", async () => {
    const varfilePath = join(tmpDir.path, "varfile.yml")
    await dumpYaml(varfilePath, {
      projectName: "${project.name}",
    })

    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Build",
          type: "test",
          name: "foo",
          timeout: DEFAULT_BUILD_TIMEOUT_SEC,
          varfiles: [{ path: varfilePath, optional: true }],
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      actionModes: {},
      linkedSources: {},
    })

    const action = graph.getBuild("foo")
    const varContext = action.getVariablesContext()

    expect(
      varContext.resolve({ nodePath: [], key: [], opts: {}, rootContext: garden.getProjectConfigContext() })
    ).to.eql({
      found: true,
      resolved: { projectName: "test" },
    })
  })

  it("correctly merges varfile with variables", async () => {
    const varfilePath = join(tmpDir.path, "varfile.yml")
    await dumpYaml(varfilePath, {
      foo: "FOO",
      bar: "BAR",
    })

    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Build",
          type: "test",
          name: "foo",
          timeout: DEFAULT_BUILD_TIMEOUT_SEC,
          variables: {
            foo: "foo",
            baz: "baz",
          },
          varfiles: [varfilePath],
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      actionModes: {},
      linkedSources: {},
    })

    const action = graph.getBuild("foo")
    const varContext = action.getVariablesContext()

    expect(
      varContext.resolve({ nodePath: [], key: [], opts: {}, rootContext: garden.getProjectConfigContext() })
    ).to.eql({
      found: true,
      resolved: { foo: "FOO", bar: "BAR", baz: "baz" },
    })
  })

  it("correctly merges varfile with variables when some variables are overridden with --var cli flag", async () => {
    const dummyGardenInstance = await makeTempGarden({
      config: createProjectConfig({
        name: "test",
        environments: [{ name: "default", defaultNamespace: "foo", variables: {} }],
      }),
      variableOverrides: { "foo": "NEW_FOO", "nested.key1": "NEW_KEY_1_VALUE" },
    })

    const _tmpDir = dummyGardenInstance.tmpDir
    const _garden = dummyGardenInstance.garden
    const _log = _garden.log

    try {
      const varfilePath = join(_tmpDir.path, "varfile.yml")
      await dumpYaml(varfilePath, {
        foo: "FOO",
        bar: "BAR",
        nested: {
          key1: "SOME_VALUE",
        },
      })

      const graph = await actionConfigsToGraph({
        garden: _garden,
        log: _log,
        groupConfigs: [],
        configs: [
          {
            kind: "Build",
            type: "test",
            name: "foo",
            timeout: DEFAULT_BUILD_TIMEOUT_SEC,
            variables: {
              foo: "foo",
              baz: "baz",
            },
            varfiles: [varfilePath],
            internal: {
              basePath: _tmpDir.path,
            },
            spec: {},
          },
        ],
        moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
        actionModes: {},
        linkedSources: {},
      })

      const action = graph.getBuild("foo")
      const varContext = action.getVariablesContext()

      expect(
        varContext.resolve({ nodePath: [], key: [], opts: {}, rootContext: garden.getProjectConfigContext() })
      ).to.eql({
        found: true,
        resolved: {
          foo: "NEW_FOO",
          bar: "BAR",
          baz: "baz",
          nested: {
            key1: "NEW_KEY_1_VALUE",
          },
        },
      })
    } finally {
      await _tmpDir.cleanup()
    }
  })

  it("sets sync mode correctly if explicitly set in actionModes", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Deploy",
          type: "test",
          name: "foo",
          timeout: DEFAULT_DEPLOY_TIMEOUT_SEC,
          variables: {},
          internal: {
            basePath: tmpDir.path,
          },
          spec: {
            // Set so that sync comes up as a supported mode
            persistent: true,
          },
        },
      ],
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      linkedSources: {},
      actionModes: {
        sync: ["deploy.foo"],
      },
    })

    const action = graph.getDeploy("foo")

    expect(action.mode()).to.equal("sync")
  })

  it("sets local mode correctly if explicitly set in actionModes", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Deploy",
          type: "test",
          name: "foo",
          timeout: DEFAULT_DEPLOY_TIMEOUT_SEC,
          variables: {},
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      linkedSources: {},
      actionModes: {
        sync: ["deploy.foo"],
      },
    })

    const action = graph.getDeploy("foo")

    expect(action.mode()).to.equal("sync")
  })

  it("sets mode if matched in full wildcard", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Deploy",
          type: "test",
          name: "foo",
          timeout: DEFAULT_DEPLOY_TIMEOUT_SEC,
          variables: {},
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      linkedSources: {},
      actionModes: {
        sync: ["*"],
      },
    })

    const action = graph.getDeploy("foo")

    expect(action.mode()).to.equal("sync")
  })

  it("sets mode if matched in partial wildcard", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Deploy",
          type: "test",
          name: "foo",
          timeout: DEFAULT_DEPLOY_TIMEOUT_SEC,
          variables: {},
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      linkedSources: {},
      actionModes: {
        sync: ["deploy.f*"],
      },
    })

    const action = graph.getDeploy("foo")

    expect(action.mode()).to.equal("sync")
  })

  it("deploy action mode overrides the mode of a dependency build action", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Deploy",
          type: "test",
          name: "foo",
          timeout: DEFAULT_DEPLOY_TIMEOUT_SEC,
          variables: {},
          dependencies: [{ kind: "Build", name: "foo" }],
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
        {
          kind: "Build",
          type: "test",
          name: "foo",
          timeout: DEFAULT_DEPLOY_TIMEOUT_SEC,
          variables: {},
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      linkedSources: {},
      actionModes: {
        sync: ["deploy.*"],
      },
    })

    const deploy = graph.getDeploy("foo")
    expect(deploy.mode()).to.equal("local")

    const build = graph.getBuild("foo")
    expect(build.mode()).to.equal("sync")
  })

  it("throws if an unknown action kind is given", async () => {
    await expectError(
      () =>
        actionConfigsToGraph({
          garden,
          log,
          groupConfigs: [],
          configs: [
            {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              kind: <any>"Boop",
              type: "test",
              name: "foo",
              timeout: DEFAULT_BUILD_TIMEOUT_SEC,
              internal: {
                basePath: tmpDir.path,
              },
              spec: {},
            },
          ],
          moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
          actionModes: {},
          linkedSources: {},
        }),
      (err) => expect(err.message).to.equal("Unknown action kind: Boop")
    )
  })

  it("throws if two actions with same key are given and neither is disabled", async () => {
    await expectError(
      () =>
        actionConfigsToGraph({
          garden,
          log,
          groupConfigs: [],
          configs: [
            {
              kind: "Build",
              type: "test",
              name: "foo",
              timeout: DEFAULT_BUILD_TIMEOUT_SEC,
              internal: {
                basePath: tmpDir.path,
              },
              spec: {},
            },
            {
              kind: "Build",
              type: "test",
              name: "foo",
              timeout: DEFAULT_BUILD_TIMEOUT_SEC,
              internal: {
                basePath: tmpDir.path,
              },
              spec: {},
            },
          ],
          moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
          actionModes: {},
          linkedSources: {},
        }),
      {
        contains: ["Found two actions of the same name and kind"],
      }
    )
  })

  it("allows two actions with same key if one is disabled (disabled comes in first)", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Build",
          type: "test",
          name: "foo",
          disabled: true,
          timeout: 123,
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
        {
          kind: "Build",
          type: "test",
          name: "foo",
          timeout: 456,
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      actionModes: {},
      linkedSources: {},
    })

    const action = graph.getBuild("foo")
    expect(action.getConfig("timeout")).to.equal(456)
  })

  it("allows two actions with same key if one is disabled (disabled comes in second)", async () => {
    const graph = await actionConfigsToGraph({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: "Build",
          type: "test",
          name: "foo",
          timeout: 123,
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
        {
          kind: "Build",
          type: "test",
          name: "foo",
          disabled: true,
          timeout: 456,
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},
        },
      ],
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      actionModes: {},
      linkedSources: {},
    })

    const action = graph.getBuild("foo")
    expect(action.getConfig("timeout")).to.equal(123)
  })

  describe("action with source.repository.url set", () => {
    it("sets the base path to the local cloned path when a repositoryUrl is specified", async () => {
      const repoUrl = "https://github.com/garden-io/garden-example-remote-module-jworker.git#main"
      const graph = await actionConfigsToGraph({
        garden,
        log,
        groupConfigs: [],
        configs: [
          {
            kind: "Build",
            type: "test",
            name: "foo",
            timeout: DEFAULT_BUILD_TIMEOUT_SEC,
            internal: {
              basePath: tmpDir.path,
            },
            spec: {},
            source: {
              repository: { url: repoUrl },
            },
          },
        ],
        moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
        actionModes: {},
        linkedSources: {},
      })
      const action = graph.getBuild("foo")

      const clonePath = getRemoteSourceLocalPath({
        name: action.key(),
        url: repoUrl,
        type: "action",
        gardenDirPath: garden.gardenDirPath,
      })
      expect(action._config.internal.basePath.startsWith(clonePath)).to.be.true
    })
  })

  describe("file inclusion-exclusion", () => {
    const getBaseParams = ({ include, exclude }: { include?: string[]; exclude?: string[] }) => ({
      garden,
      log,
      groupConfigs: [],
      configs: [
        {
          kind: <const>"Build",
          type: <const>"test",
          name: "foo",
          timeout: DEFAULT_BUILD_TIMEOUT_SEC,
          internal: {
            basePath: tmpDir.path,
          },
          spec: {},

          include,
          exclude,
        },
      ],
      moduleGraph: new ModuleGraph({ modules: [], moduleTypes: {} }),
      actionModes: {},
      linkedSources: {},
    })

    it("sets include and exclude", async () => {
      const graph = await actionConfigsToGraph({
        ...getBaseParams({
          include: ["include-file"],
          exclude: ["exclude-file"],
        }),
      })
      const action = graph.getBuild("foo")

      expect(action.getConfig().include).to.eql(["include-file"])
      expect(action.getConfig().exclude).to.eql(["exclude-file"])
    })

    it("sets include to [] if all is excluded", async () => {
      const graph = await actionConfigsToGraph({
        ...getBaseParams({
          include: undefined,
          exclude: ["**/*", "some-thing-else"],
        }),
      })
      const action = graph.getBuild("foo")

      expect(action.getConfig().include).to.eql([])
    })

    it("throws if everything is excluded but an include is attempted", async () => {
      await expectError(
        () =>
          actionConfigsToGraph({
            ...getBaseParams({
              include: ["some-file"],
              exclude: ["**/*"],
            }),
          }),
        {
          contains: ['tries to include files but excludes all files via "**/*"'],
        }
      )
    })
  })
})
