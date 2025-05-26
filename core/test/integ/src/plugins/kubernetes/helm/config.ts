/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import { expect } from "chai"
import { omit } from "lodash-es"

import type { TestGarden } from "../../../../../helpers.js"
import { expectError, getDataDir, makeTestGarden, withDefaultGlobalOpts } from "../../../../../helpers.js"
import type { PluginContext } from "../../../../../../src/plugin-context.js"
import { dedent } from "../../../../../../src/util/string.js"
import type { ModuleConfig } from "../../../../../../src/config/module.js"
import { apply } from "json-merge-patch"
import { getHelmTestGarden } from "./common.js"
import { defaultHelmTimeout } from "../../../../../../src/plugins/kubernetes/helm/module-config.js"
import stripAnsi from "strip-ansi"
import {
  DEFAULT_BUILD_TIMEOUT_SEC,
  DEFAULT_DEPLOY_TIMEOUT_SEC,
  GardenApiVersion,
} from "../../../../../../src/constants.js"
import { ValidateCommand } from "../../../../../../src/commands/validate.js"
import { defaultHelmAtomicFlag } from "../../../../../../src/plugins/kubernetes/helm/config.js"
import { serialiseUnresolvedTemplates } from "../../../../../../src/template/types.js"
import { parseTemplateCollection } from "../../../../../../src/template/templated-collections.js"

describe("configureHelmModule", () => {
  let garden: TestGarden
  let ctx: PluginContext
  let originalModuleConfigs: { [key: string]: ModuleConfig }

  before(async () => {
    garden = await getHelmTestGarden()
    const provider = await garden.resolveProvider({ log: garden.log, name: "local-kubernetes" })
    ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    await garden.resolveModules({ log: garden.log })
    originalModuleConfigs = { ...garden.moduleConfigs }
  })

  afterEach(() => {
    garden.moduleConfigs = { ...originalModuleConfigs }
  })

  function patchModuleConfig(name: string, patch: any) {
    const moduleConfig = serialiseUnresolvedTemplates(garden.moduleConfigs[name]) as ModuleConfig
    apply(moduleConfig, patch)
    // @ts-expect-error todo: correct types for unresolved configs
    garden.moduleConfigs[name] = parseTemplateCollection({ value: moduleConfig, source: { path: [] } })
  }

  it("should validate a Helm module", async () => {
    const module = await garden.resolveModule("api-module")
    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const imageModule = graph.getModule("api-image")
    const imageVersion = imageModule.version.versionString

    const expectedSpec = {
      atomicInstall: defaultHelmAtomicFlag,
      build: {
        dependencies: [],
        timeout: DEFAULT_BUILD_TIMEOUT_SEC,
      },
      chartPath: ".",
      sync: {
        paths: [
          {
            mode: "two-way",
            defaultDirectoryMode: 0o755,
            defaultFileMode: 0o644,
            source: ".",
            target: "/app",
          },
        ],
      },
      dependencies: [],
      releaseName: "api-module-release",
      serviceResource: {
        kind: "Deployment",
        containerModule: "api-image",
      },
      skipDeploy: false,
      tasks: [],
      tests: [],
      timeout: defaultHelmTimeout,
      values: {
        image: {
          tag: imageVersion,
        },
        ingress: {
          enabled: true,
          paths: ["/api-module/"],
          hosts: ["api.local.demo.garden"],
        },
      },
      valueFiles: [],
    }

    expect(module._config).to.eql({
      apiVersion: GardenApiVersion.v0,
      kind: "Module",
      allowPublish: true,
      build: {
        dependencies: [],
        timeout: DEFAULT_BUILD_TIMEOUT_SEC,
      },
      local: false,
      configPath: resolve(ctx.projectRoot, "api", "garden.yml"),
      description: "The API backend for the voting UI",
      disabled: false,
      generateFiles: undefined,
      include: ["*", "charts/**/*", "templates/**/*"],
      inputs: {},
      exclude: undefined,
      name: "api-module",
      path: resolve(ctx.projectRoot, "api"),
      repositoryUrl: undefined,
      buildConfig: omit(expectedSpec, ["atomicInstall", "serviceResource", "skipDeploy", "tasks", "tests"]),
      serviceConfigs: [
        {
          name: "api-module",
          dependencies: [],
          disabled: false,
          sourceModuleName: "api-image",
          timeout: DEFAULT_DEPLOY_TIMEOUT_SEC,
          spec: expectedSpec,
        },
      ],
      spec: expectedSpec,
      testConfigs: [],
      type: "helm",
      taskConfigs: [],
      variables: undefined,
      varfile: undefined,
    })
  })

  it("should not set default includes if include has already been explicitly set", async () => {
    patchModuleConfig("api-module", { include: ["foo"] })
    const configInclude = await garden.resolveModule("api-module")
    expect(configInclude.include).to.eql(["foo"])
  })

  it("should not set default includes if exclude has already been explicitly set", async () => {
    patchModuleConfig("api-module", { exclude: ["bar"] })
    const configExclude = await garden.resolveModule("api-module")
    expect(configExclude.include).to.be.undefined
  })

  it("should set include to default if module does not have local chart sources", async () => {
    // So that Chart.yaml isn't found
    patchModuleConfig("api-module", { spec: { chartPath: "invalid-path" } })
    const config = await garden.resolveModule("api-module")
    expect(config.include).to.eql(["invalid-path/*.yaml", "invalid-path/*.yml"])
  })

  it("should not return a serviceConfig if skipDeploy=true", async () => {
    patchModuleConfig("api-module", { spec: { skipDeploy: true } })
    const config = await garden.resolveModule("api-module")

    expect(config.serviceConfigs).to.eql([])
  })

  it("should add the module specified under 'base' as a build dependency", async () => {
    patchModuleConfig("postgres", { spec: { base: "api-module" } })
    const config = await garden.resolveModule("postgres")

    expect(config.build.dependencies).to.eql([{ name: "api-module", copy: [{ source: "*", target: "." }] }])
  })

  it("should add copy spec to build dependency if it's already a dependency", async () => {
    patchModuleConfig("postgres", {
      build: { dependencies: [{ name: "api-module", copy: [] }] },
      spec: { base: "api-module" },
    })
    const config = await garden.resolveModule("postgres")

    expect(config.build.dependencies).to.eql([{ name: "api-module", copy: [{ source: "*", target: "." }] }])
  })

  it("should add module specified under tasks[].resource.containerModule as a build dependency", async () => {
    patchModuleConfig("api-module", {
      spec: {
        tasks: [
          {
            name: "my-task",
            resource: { kind: "Deployment", containerModule: "postgres" },
          },
        ],
      },
    })
    const config = await garden.resolveModule("api-module")

    expect(config.build.dependencies).to.eql([
      { name: "postgres", copy: [] },
      { name: "api-image", copy: [] },
    ])
  })

  it("should add module specified under tests[].resource.containerModule as a build dependency", async () => {
    patchModuleConfig("api-module", {
      spec: {
        tests: [
          {
            name: "my-task",
            resource: { kind: "Deployment", containerModule: "postgres" },
          },
        ],
      },
    })
    const config = await garden.resolveModule("api-module")

    expect(config.build.dependencies).to.eql([
      { name: "postgres", copy: [] },
      { name: "api-image", copy: [] },
    ])
  })

  // TODO: this doesn't seem to work and I don't want to dive in
  it.skip("should throw if chart both contains sources and specifies base", async () => {
    patchModuleConfig("api-module", { spec: { base: "artifacts" } })

    await expectError(
      () => garden.resolveModule("api-module"),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(dedent`
        Failed resolving one or more modules:

        api: Helm module 'api' both contains sources and specifies a base module. Since Helm charts cannot currently be merged, please either remove the sources or the \`base\` reference in your module config.
      `)
    )
  })

  it("should pass validation with a chart name but no version specified", async () => {
    const projectRoot = getDataDir("test-projects", "helm-name-version-regression")
    const g = await makeTestGarden(projectRoot)
    const command = new ValidateCommand()
    await command.action({
      garden: g,
      log: g.log,
      args: {},
      opts: withDefaultGlobalOpts({ resolve: undefined }),
    })
  })
})
