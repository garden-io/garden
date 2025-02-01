/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import tmp from "tmp-promise"
import type { ProjectConfig } from "../../../../src/config/project.js"
import {
  resolveProjectConfig,
  pickEnvironment,
  defaultProjectVarfilePath,
  defaultEnvVarfilePath,
  parseEnvironment,
  defaultNamespace,
  fixedPlugins,
  defaultEnvironment,
} from "../../../../src/config/project.js"
import { createProjectConfig, expectError } from "../../../helpers.js"
import fsExtra from "fs-extra"
import { dedent } from "../../../../src/util/string.js"
import { resolve, join } from "path"
import { getRootLogger } from "../../../../src/logger/logger.js"
import { deepEvaluate } from "../../../../src/template/evaluate.js"
import { deepResolveContext } from "../../../../src/config/template-contexts/base.js"
import { omit } from "lodash-es"
import { serialiseUnresolvedTemplates } from "../../../../src/template/types.js"
import type { DeepPrimitiveMap } from "@garden-io/platform-api-types"
import { ProjectConfigContext } from "../../../../src/config/template-contexts/project.js"
import { TestContext } from "./template-contexts/base.js"

const { realpath, writeFile } = fsExtra

const enterpriseDomain = "https://garden.mydomain.com"
const commandInfo = { name: "test", args: {}, opts: {} }

const vcsInfo = {
  branch: "main",
  commitHash: "abcdefgh",
  originUrl: "https://example.com/foo",
}

const log = getRootLogger().createLog()

describe("resolveProjectConfig", () => {
  it("should pass through a canonical project config", async () => {
    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: "/tmp/foo",
      outputs: [],
      providers: [{ name: "some-provider", dependencies: [] }],
    })

    expect(
      resolveProjectConfig({
        log,
        defaultEnvironmentName: "default",
        config,
        context: new ProjectConfigContext({
          projectName: config.name,
          projectRoot: config.path,
          artifactsPath: "/tmp",
          vcsInfo,
          username: "some-user",
          loggedIn: true,
          enterpriseDomain,
          secrets: {},
          commandInfo,
        }),
      })
    ).to.eql({
      ...config,
      dotIgnoreFiles: [],
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {},
        },
      ],
      sources: [],
      varfile: defaultProjectVarfilePath,
    })
  })

  it("should resolve template strings on fields other than environments, providers and remote sources and variables", async () => {
    const repositoryUrl = "git://github.com/foo/bar.git#boo"

    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: "/tmp/foo",
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {
            envVar: "${local.env.TEST_ENV_VAR}",
            secretVar: "${secrets.foo}",
          },
        },
      ],
      providers: [{ name: "some-provider", dependencies: [] }],
      sources: [
        {
          name: "${local.env.TEST_ENV_VAR}",
          repositoryUrl,
        },
      ],
      variables: {
        platform: "${local.platform}",
        secret: "${secrets.foo}",
        projectPath: "${local.projectPath}",
        envVar: "${local.env.TEST_ENV_VAR}",
      },
    })

    process.env.TEST_ENV_VAR = "foo"

    expect(
      serialiseUnresolvedTemplates(
        resolveProjectConfig({
          log,
          defaultEnvironmentName: defaultEnvironment,
          config,
          context: new ProjectConfigContext({
            projectName: config.name,
            projectRoot: config.path,
            artifactsPath: "/tmp",
            vcsInfo,
            username: "some-user",
            loggedIn: true,
            enterpriseDomain,
            secrets: { foo: "banana" },
            commandInfo,
          }),
        })
      )
    ).to.eql({
      ...config,
      dotIgnoreFiles: [],
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {
            envVar: "${local.env.TEST_ENV_VAR}",
            secretVar: "${secrets.foo}",
          },
        },
      ],
      outputs: [],
      sources: [
        {
          name: "${local.env.TEST_ENV_VAR}",
          repositoryUrl,
        },
      ],
      varfile: defaultProjectVarfilePath,
      variables: {
        platform: "${local.platform}",
        secret: "${secrets.foo}",
        projectPath: "${local.projectPath}",
        envVar: "${local.env.TEST_ENV_VAR}",
      },
    })

    delete process.env.TEST_ENV_VAR
  })

  it("should pass through templated fields on provider configs", async () => {
    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: "/tmp/foo",
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {
            envVar: "foo",
          },
        },
      ],
      providers: [
        {
          name: "provider-a",
          someKey: "${local.env.TEST_ENV_VAR_A}",
        },
        {
          name: "provider-b",
          environments: ["default"],
          someKey: "${local.env.TEST_ENV_VAR_B}",
        },
      ],
    })

    process.env.TEST_ENV_VAR_A = "foo"
    process.env.TEST_ENV_VAR_B = "boo"

    expect(
      serialiseUnresolvedTemplates(
        resolveProjectConfig({
          log,
          defaultEnvironmentName: defaultEnvironment,
          config,
          context: new ProjectConfigContext({
            projectName: config.name,
            projectRoot: config.path,
            artifactsPath: "/tmp",
            vcsInfo,
            username: "some-user",
            loggedIn: true,
            enterpriseDomain,
            secrets: {},
            commandInfo,
          }),
        })
      )
    ).to.eql({
      ...(serialiseUnresolvedTemplates(config) as DeepPrimitiveMap),
      dotIgnoreFiles: [],
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {
            envVar: "foo",
          },
        },
      ],
      outputs: [],
      providers: [
        {
          name: "provider-a",
          someKey: "${local.env.TEST_ENV_VAR_A}",
        },
        {
          name: "provider-b",
          environments: ["default"],
          someKey: "${local.env.TEST_ENV_VAR_B}",
        },
      ],
      sources: [],
      varfile: defaultProjectVarfilePath,
    })

    delete process.env.TEST_ENV_VAR_A
    delete process.env.TEST_ENV_VAR_B
  })

  it("should pass through templated fields on environment configs", async () => {
    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: "/tmp/foo",
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {
            envVar: "${var.foo}",
          },
        },
      ],
    })

    const result = resolveProjectConfig({
      log,
      defaultEnvironmentName: defaultEnvironment,
      config,
      context: new ProjectConfigContext({
        projectName: config.name,
        projectRoot: config.path,
        artifactsPath: "/tmp",
        vcsInfo,
        username: "some-user",
        loggedIn: true,
        enterpriseDomain,
        secrets: {},
        commandInfo,
      }),
    })

    expect(result.environments[0].variables).to.eql(config.environments[0].variables)
  })

  it("should pass through templated fields on remote source configs", async () => {
    const repositoryUrl = "git://github.com/foo/bar.git#boo"

    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: "/tmp/foo",
      sources: [
        {
          name: "${local.env.TEST_ENV_VAR}",
          repositoryUrl,
        },
      ],
    })

    process.env.TEST_ENV_VAR = "foo"

    expect(
      serialiseUnresolvedTemplates(
        resolveProjectConfig({
          log,
          defaultEnvironmentName: defaultEnvironment,
          config,
          context: new ProjectConfigContext({
            projectName: config.name,
            projectRoot: config.path,
            artifactsPath: "/tmp",
            vcsInfo,
            username: "some-user",
            loggedIn: true,
            enterpriseDomain,
            secrets: {},
            commandInfo,
          }),
        })
      )
    ).to.eql({
      ...config,
      dotIgnoreFiles: [],
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {},
        },
      ],
      outputs: [],
      sources: [
        {
          name: "${local.env.TEST_ENV_VAR}",
          repositoryUrl,
        },
      ],
      varfile: defaultProjectVarfilePath,
      variables: {},
    })

    delete process.env.TEST_ENV_VAR
  })

  it("should set defaultEnvironment to first environment if not configured", async () => {
    const defaultEnvironmentName = ""
    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: defaultEnvironmentName,
      environments: [{ defaultNamespace: null, name: "first-env", variables: {} }],
      outputs: [],
      providers: [{ name: "some-provider" }],
      variables: {},
    })

    expect(
      resolveProjectConfig({
        log,
        defaultEnvironmentName,
        config,
        context: new ProjectConfigContext({
          projectName: config.name,
          projectRoot: config.path,
          artifactsPath: "/tmp",
          vcsInfo,
          username: "some-user",
          loggedIn: true,
          enterpriseDomain,
          secrets: {},
          commandInfo,
        }),
      })
    ).to.eql({
      ...config,
      dotIgnoreFiles: [],
      defaultEnvironment: "first-env",
      environments: [{ defaultNamespace: null, name: "first-env", variables: {} }],
      sources: [],
      varfile: defaultProjectVarfilePath,
    })
  })

  it("should populate default values in the schema", async () => {
    const defaultEnvironmentName = ""
    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: defaultEnvironmentName,
      environments: [{ defaultNamespace: null, name: "default", variables: {} }],
      outputs: [],
      providers: [{ name: "some-provider", dependencies: [] }],
      variables: {},
    })

    expect(
      resolveProjectConfig({
        log,
        defaultEnvironmentName,
        config,
        context: new ProjectConfigContext({
          projectName: config.name,
          projectRoot: config.path,
          artifactsPath: "/tmp",
          vcsInfo,
          username: "some-user",
          loggedIn: true,
          enterpriseDomain,
          secrets: {},
          commandInfo,
        }),
      })
    ).to.eql({
      ...config,
      dotIgnoreFiles: [],
      defaultEnvironment: "default",
      environments: [{ defaultNamespace: null, name: "default", variables: {} }],
      sources: [],
      varfile: defaultProjectVarfilePath,
    })
  })

  it("should include providers in correct precedence order from all possible config keys", async () => {
    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: "/tmp/foo",
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {
            envVar: "foo",
          },
        },
      ],
      outputs: [],
      providers: [
        {
          name: "provider-a",
        },
        {
          name: "provider-b",
          environments: ["default"],
        },
        {
          name: "provider-c",
        },
      ],
      variables: {},
    })

    const resolvedConfig = resolveProjectConfig({
      log,
      defaultEnvironmentName: defaultEnvironment,
      config,
      context: new ProjectConfigContext({
        projectName: config.name,
        projectRoot: config.path,
        artifactsPath: "/tmp",
        vcsInfo,
        username: "some-user",
        loggedIn: true,
        enterpriseDomain,
        secrets: {},
        commandInfo,
      }),
    })
    expect(resolvedConfig).to.eql({
      ...config,
      internal: {
        basePath: "/foo",
      },
      dotIgnoreFiles: [],
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {
            envVar: "foo",
          },
        },
      ],
      outputs: [],
      providers: [
        {
          name: "provider-a",
        },
        {
          name: "provider-b",
          environments: ["default"],
        },
        {
          name: "provider-c",
        },
      ],
      sources: [],
      varfile: defaultProjectVarfilePath,
    })
  })
})

describe("pickEnvironment", () => {
  let tmpDir: tmp.DirectoryResult
  let tmpPath: string
  let artifactsPath: string
  const username = "test"

  beforeEach(async () => {
    tmpDir = await tmp.dir({ unsafeCleanup: true })
    tmpPath = await realpath(tmpDir.path)
    artifactsPath = join(tmpPath, ".garden", "artifacts")
  })

  afterEach(async () => {
    await tmpDir.cleanup()
  })

  it("should throw if selected environment isn't configured", async () => {
    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: "/tmp/foo",
    })

    await expectError(
      () =>
        pickEnvironment({
          projectContext: new ProjectConfigContext({
            projectName: config.name,
            projectRoot: config.path,
            artifactsPath,
            vcsInfo,
            username,
            loggedIn: true,
            enterpriseDomain: config.domain,
            secrets: {},
            commandInfo,
          }),
          projectConfig: config,
          variableOverrides: {},
          envString: "foo",
          artifactsPath,
          vcsInfo,
          username,
          loggedIn: true,
          enterpriseDomain,
          secrets: {},
          commandInfo,
        }),
      "parameter"
    )
  })

  it("should include fixed providers in output", async () => {
    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: "/tmp/foo",
    })

    const res = await pickEnvironment({
      projectContext: new ProjectConfigContext({
        projectName: config.name,
        projectRoot: config.path,
        artifactsPath,
        vcsInfo,
        username,
        loggedIn: true,
        enterpriseDomain: config.domain,
        secrets: {},
        commandInfo,
      }),
      projectConfig: config,
      variableOverrides: {},
      envString: "default",
      artifactsPath,
      vcsInfo,
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    const providerNames = res.providers.map((p) => p.name)

    for (const name of fixedPlugins) {
      expect(providerNames).to.include(name)
    }
  })

  it("should remove null values in provider configs (as per the JSON Merge Patch spec)", async () => {
    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: "/tmp/foo",
      providers: [
        { name: "container", newKey: "foo" },
        { name: "my-provider", a: "a" },
        { name: "my-provider", b: "b" },
        { name: "my-provider", a: null },
      ],
    })

    const env = await pickEnvironment({
      projectContext: new ProjectConfigContext({
        projectName: config.name,
        projectRoot: config.path,
        artifactsPath,
        vcsInfo,
        username,
        loggedIn: true,
        enterpriseDomain: config.domain,
        secrets: {},
        commandInfo,
      }),

      projectConfig: config,
      variableOverrides: {},
      envString: "default",
      artifactsPath,
      vcsInfo,
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    expect(omit(env, "providers", "variables")).to.eql({
      environmentName: "default",
      defaultNamespace: "default",
      namespace: "default",
      production: false,
    })
    const variables = deepResolveContext("resolved env variables", env.variables)
    expect(variables).to.eql({})

    const resolvedProviders = env.providers.map((p) =>
      deepEvaluate(p.unresolvedConfig, { context: new TestContext({}), opts: {} })
    )
    expect(resolvedProviders).to.eql([
      { name: "exec" },
      { name: "container", newKey: "foo" },
      { name: "templated" },
      {
        name: "my-provider",
        a: undefined, // setting a to undefined is semantically equivalent to removing it in this context
        b: "b",
      },
    ])
  })

  it("should correctly merge project and environment variables", async () => {
    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: "/tmp/foo",
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {
            b: "env value B",
            c: "env value C",
            array: [{ envArrayKey: "env array value" }],
            nested: {
              nestedB: "nested env value B",
              nestedC: "nested env value C",
            },
          },
        },
      ],
      providers: [],
      variables: {
        a: "project value A",
        b: "project value B",
        array: [{ projectArrayKey: "project array value" }],
        nested: {
          nestedA: "nested project value A",
          nestedB: "nested project value B",
        },
      },
    })

    const result = await pickEnvironment({
      projectContext: new ProjectConfigContext({
        projectName: config.name,
        projectRoot: config.path,
        artifactsPath,
        vcsInfo,
        username,
        loggedIn: true,
        enterpriseDomain: config.domain,
        secrets: {},
        commandInfo,
      }),

      projectConfig: config,
      variableOverrides: {},
      envString: "default",
      artifactsPath,
      vcsInfo,
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    const variables = deepResolveContext("resolved env variables", result.variables)
    expect(variables).to.eql({
      a: "project value A",
      b: "env value B",
      c: "env value C",
      array: [{ envArrayKey: "env array value", projectArrayKey: "project array value" }],
      nested: {
        nestedA: "nested project value A",
        nestedB: "nested env value B",
        nestedC: "nested env value C",
      },
    })
  })

  it("should load variables from default project varfile if it exists", async () => {
    const varfilePath = resolve(tmpPath, defaultProjectVarfilePath)
    await writeFile(
      varfilePath,
      dedent`
      a=a
      b=b
    `
    )

    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: tmpPath,
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {
            b: "B",
            c: "c",
          },
        },
      ],
    })

    const result = await pickEnvironment({
      projectContext: new ProjectConfigContext({
        projectName: config.name,
        projectRoot: config.path,
        artifactsPath,
        vcsInfo,
        username,
        loggedIn: true,
        enterpriseDomain: config.domain,
        secrets: {},
        commandInfo,
      }),

      projectConfig: config,
      variableOverrides: {},
      envString: "default",
      artifactsPath,
      vcsInfo,
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    const variables = deepResolveContext("resolved env variables", result.variables)
    expect(variables).to.eql({
      a: "a",
      b: "B",
      c: "c",
    })
  })

  it("should load variables from default environment varfile if it exists", async () => {
    const varfilePath = resolve(tmpPath, defaultEnvVarfilePath("default"))
    await writeFile(
      varfilePath,
      dedent`
      b=B
      c=c
    `
    )

    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: tmpPath,
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {},
        },
      ],
      variables: {
        a: "a",
        b: "b",
      },
    })

    const result = await pickEnvironment({
      projectContext: new ProjectConfigContext({
        projectName: config.name,
        projectRoot: config.path,
        artifactsPath,
        vcsInfo,
        username,
        loggedIn: true,
        enterpriseDomain: config.domain,
        secrets: {},
        commandInfo,
      }),

      projectConfig: config,
      variableOverrides: {},
      envString: "default",
      artifactsPath,
      vcsInfo,
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    const variables = deepResolveContext("resolved env variables", result.variables)
    expect(variables).to.eql({
      a: "a",
      b: "B",
      c: "c",
    })
  })

  it("should load variables from custom project varfile if specified", async () => {
    const varfilePath = resolve(tmpPath, "foo.env")
    await writeFile(
      varfilePath,
      dedent`
      a=a
      b=b
    `
    )

    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: tmpPath,
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {
            b: "B",
            c: "c",
          },
        },
      ],
      varfile: "foo.env",
    })

    const result = await pickEnvironment({
      projectContext: new ProjectConfigContext({
        projectName: config.name,
        projectRoot: config.path,
        artifactsPath,
        vcsInfo,
        username,
        loggedIn: true,
        enterpriseDomain: config.domain,
        secrets: {},
        commandInfo,
      }),

      projectConfig: config,
      variableOverrides: {},
      envString: "default",
      artifactsPath,
      vcsInfo,
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    const variables = deepResolveContext("resolved env variables", result.variables)
    expect(variables).to.eql({
      a: "a",
      b: "B",
      c: "c",
    })
  })

  it("should load variables from custom environment varfile if specified", async () => {
    const varfilePath = resolve(tmpPath, "foo.env")
    await writeFile(
      varfilePath,
      dedent`
      b=B
      c=c
    `
    )

    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: tmpPath,
      environments: [
        {
          name: "default",
          defaultNamespace,
          varfile: "foo.env",
          variables: {},
        },
      ],
      variables: {
        a: "a",
        b: "b",
      },
    })

    const result = await pickEnvironment({
      projectContext: new ProjectConfigContext({
        projectName: config.name,
        projectRoot: config.path,
        artifactsPath,
        vcsInfo,
        username,
        loggedIn: true,
        enterpriseDomain: config.domain,
        secrets: {},
        commandInfo,
      }),

      projectConfig: config,
      variableOverrides: {},
      envString: "default",
      artifactsPath,
      vcsInfo,
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    const variables = deepResolveContext("resolved env variables", result.variables)
    expect(variables).to.eql({
      a: "a",
      b: "B",
      c: "c",
    })
  })

  it("should load variables from YAML varfiles if specified", async () => {
    await writeFile(
      resolve(tmpPath, "foo.yml"),
      dedent`
      a: value-a
      b:
        some: value
      c:
        - some
        - values
      `
    )

    await writeFile(
      resolve(tmpPath, "foo.default.yaml"),
      dedent`
      a: new-value
      b:
        additional: value
      d: something
      `
    )

    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: tmpPath,
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {},
          varfile: "foo.default.yaml",
        },
      ],
      varfile: "foo.yml",
    })

    const result = await pickEnvironment({
      projectContext: new ProjectConfigContext({
        projectName: config.name,
        projectRoot: config.path,
        artifactsPath,
        vcsInfo,
        username,
        loggedIn: true,
        enterpriseDomain: config.domain,
        secrets: {},
        commandInfo,
      }),

      projectConfig: config,
      variableOverrides: {},
      envString: "default",
      artifactsPath,
      vcsInfo,
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    const variables = deepResolveContext("resolved env variables", result.variables)
    expect(variables).to.eql({
      a: "new-value",
      b: { some: "value", additional: "value" },
      c: ["some", "values"],
      d: "something",
    })
  })

  it("should load variables from JSON varfiles if specified", async () => {
    await writeFile(
      resolve(tmpPath, "foo.json"),
      dedent`
      {
        "a": "value-a",
        "b": { "some": "value" },
        "c": ["some", "values"]
      }
      `
    )

    await writeFile(
      resolve(tmpPath, "foo.default.json"),
      dedent`
      {
        "a": "new-value",
        "b": { "additional": "value" },
        "d": "something"
      }
      `
    )

    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: tmpPath,
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {},
          varfile: "foo.default.json",
        },
      ],
      varfile: "foo.json",
    })

    const result = await pickEnvironment({
      projectContext: new ProjectConfigContext({
        projectName: config.name,
        projectRoot: config.path,
        artifactsPath,
        vcsInfo,
        username,
        loggedIn: true,
        enterpriseDomain: config.domain,
        secrets: {},
        commandInfo,
      }),

      projectConfig: config,
      variableOverrides: {},
      envString: "default",
      artifactsPath,
      vcsInfo,
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    const variables = deepResolveContext("resolved env variables", result.variables)
    expect(variables).to.eql({
      a: "new-value",
      b: { some: "value", additional: "value" },
      c: ["some", "values"],
      d: "something",
    })
  })

  it("should resolve template strings in the picked environment", async () => {
    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: "/tmp/foo",
      environments: [
        { name: "default", defaultNamespace, variables: { local: "${local.username}", secret: "${secrets.foo}" } },
      ],
    })

    const result = await pickEnvironment({
      projectContext: new ProjectConfigContext({
        projectName: config.name,
        projectRoot: config.path,
        artifactsPath,
        vcsInfo,
        username,
        loggedIn: true,
        enterpriseDomain: config.domain,
        secrets: {},
        commandInfo,
      }),

      projectConfig: config,
      variableOverrides: {},
      envString: "default",
      artifactsPath,
      vcsInfo,
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: { foo: "banana" },
      commandInfo,
    })

    const variables = deepResolveContext("resolved env variables", result.variables)
    expect(variables).to.eql({
      local: username,
      secret: "banana",
    })
  })

  it("should ignore template strings in other environments", async () => {
    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: "/tmp/foo",
      environments: [
        { name: "default", defaultNamespace, variables: {} },
        { name: "other", defaultNamespace, variables: { foo: "${var.missing}", secret: "${secrets.missing}" } },
      ],
    })

    await pickEnvironment({
      projectContext: new ProjectConfigContext({
        projectName: config.name,
        projectRoot: config.path,
        artifactsPath,
        vcsInfo,
        username,
        loggedIn: true,
        enterpriseDomain: config.domain,
        secrets: {},
        commandInfo,
      }),

      projectConfig: config,
      variableOverrides: {},
      envString: "default",
      artifactsPath,
      vcsInfo,
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })
  })

  it("should allow referencing top-level variables", async () => {
    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: "/tmp/foo",
      environments: [{ name: "default", defaultNamespace, variables: { foo: "${var.foo}" } }],
      variables: { foo: "value" },
    })

    const result = await pickEnvironment({
      projectContext: new ProjectConfigContext({
        projectName: config.name,
        projectRoot: config.path,
        artifactsPath,
        vcsInfo,
        username,
        loggedIn: true,
        enterpriseDomain: config.domain,
        secrets: {},
        commandInfo,
      }),

      projectConfig: config,
      variableOverrides: {},
      envString: "default",
      artifactsPath,
      vcsInfo,
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    const variables = deepResolveContext("resolved env variables", result.variables)
    expect(variables).to.eql({
      foo: "value",
    })
  })

  it("should correctly merge all variable sources in precedence order (variables fields and varfiles)", async () => {
    // Precedence 1/4 (highest)
    await writeFile(
      resolve(tmpPath, defaultEnvVarfilePath("default")),
      dedent`
      d=D
      e=e
    `
    )

    // Precedence 3/4
    await writeFile(
      resolve(tmpPath, defaultProjectVarfilePath),
      dedent`
      b=B
      c=c
    `
    )

    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: tmpPath,
      environments: [
        {
          name: "default",
          defaultNamespace,
          // Precedence 2/4
          variables: {
            c: "C",
            d: "d",
          },
        },
      ],
      // Precedence 4/4 (lowest)
      variables: {
        a: "a",
        b: "b",
      },
    })

    const result = await pickEnvironment({
      projectContext: new ProjectConfigContext({
        projectName: config.name,
        projectRoot: config.path,
        artifactsPath,
        vcsInfo,
        username,
        loggedIn: true,
        enterpriseDomain: config.domain,
        secrets: {},
        commandInfo,
      }),

      projectConfig: config,
      variableOverrides: {},
      envString: "default",
      artifactsPath,
      vcsInfo,
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    const variables = deepResolveContext("resolved env variables", result.variables)
    expect(variables).to.eql({
      a: "a",
      b: "B",
      c: "C",
      d: "D",
      e: "e",
    })
  })

  it("should validate the picked environment", async () => {
    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: tmpPath,
      environments: [
        {
          name: "default",
          defaultNamespace: "${var.foo}",
          variables: {},
        },
      ],
      variables: {
        foo: 123,
      },
    })

    await expectError(
      () =>
        pickEnvironment({
          projectContext: new ProjectConfigContext({
            projectName: config.name,
            projectRoot: config.path,
            artifactsPath,
            vcsInfo,
            username,
            loggedIn: true,
            enterpriseDomain: config.domain,
            secrets: {},
            commandInfo,
          }),

          projectConfig: config,
          variableOverrides: {},
          envString: "default",
          artifactsPath,
          vcsInfo,
          username,
          loggedIn: true,
          enterpriseDomain,
          secrets: {},
          commandInfo,
        }),
      { contains: ["Error validating environment default", "defaultNamespace must be a string"] }
    )
  })

  it("should throw if project varfile is set to non-default and it doesn't exist", async () => {
    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: tmpPath,
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {},
        },
      ],
      varfile: "foo.env",
    })

    await expectError(
      () =>
        pickEnvironment({
          projectContext: new ProjectConfigContext({
            projectName: config.name,
            projectRoot: config.path,
            artifactsPath,
            vcsInfo,
            username,
            loggedIn: true,
            enterpriseDomain: config.domain,
            secrets: {},
            commandInfo,
          }),

          projectConfig: config,
          variableOverrides: {},
          envString: "default",
          artifactsPath,
          vcsInfo,
          username,
          loggedIn: true,
          enterpriseDomain,
          secrets: {},
          commandInfo,
        }),
      { contains: "Could not find varfile at path 'foo.env'" }
    )
  })

  it("should throw if environment varfile is set to non-default and it doesn't exist", async () => {
    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: tmpPath,
      environments: [
        {
          name: "default",
          defaultNamespace,
          varfile: "foo.env",
          variables: {},
        },
      ],
    })

    await expectError(
      () =>
        pickEnvironment({
          projectContext: new ProjectConfigContext({
            projectName: config.name,
            projectRoot: config.path,
            artifactsPath,
            vcsInfo,
            username,
            loggedIn: true,
            enterpriseDomain: config.domain,
            secrets: {},
            commandInfo,
          }),

          projectConfig: config,
          variableOverrides: {},
          envString: "default",
          artifactsPath,
          vcsInfo,
          username,
          loggedIn: true,
          enterpriseDomain,
          secrets: {},
          commandInfo,
        }),
      { contains: "Could not find varfile at path 'foo.env'" }
    )
  })

  it("should set environment namespace if specified and defaultNamespace=null", async () => {
    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: "/tmp/foo",
    })

    const res = await pickEnvironment({
      projectContext: new ProjectConfigContext({
        projectName: config.name,
        projectRoot: config.path,
        artifactsPath,
        vcsInfo,
        username,
        loggedIn: true,
        enterpriseDomain: config.domain,
        secrets: {},
        commandInfo,
      }),

      projectConfig: config,
      variableOverrides: {},
      envString: "foo.default",
      artifactsPath,
      vcsInfo,
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    expect(res.environmentName).to.equal("default")
    expect(res.namespace).to.equal("foo")
  })

  it("should use explicit namespace if specified and there is a default", async () => {
    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: "/tmp/foo",
    })

    const res = await pickEnvironment({
      projectContext: new ProjectConfigContext({
        projectName: config.name,
        projectRoot: config.path,
        artifactsPath,
        vcsInfo,
        username,
        loggedIn: true,
        enterpriseDomain: config.domain,
        secrets: {},
        commandInfo,
      }),

      projectConfig: config,
      variableOverrides: {},
      envString: "foo.default",
      artifactsPath,
      vcsInfo,
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    expect(res.environmentName).to.equal("default")
    expect(res.namespace).to.equal("foo")
  })

  it("should use defaultNamespace if set and no explicit namespace is specified", async () => {
    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: "/tmp/foo",
    })

    const res = await pickEnvironment({
      projectContext: new ProjectConfigContext({
        projectName: config.name,
        projectRoot: config.path,
        artifactsPath,
        vcsInfo,
        username,
        loggedIn: true,
        enterpriseDomain: config.domain,
        secrets: {},
        commandInfo,
      }),

      projectConfig: config,
      variableOverrides: {},
      envString: "default",
      artifactsPath,
      username,
      vcsInfo,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    expect(res.environmentName).to.equal("default")
    expect(res.namespace).to.equal("default")
  })

  it("should throw if invalid environment is specified", async () => {
    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: "/tmp/foo",
    })

    await expectError(
      () =>
        pickEnvironment({
          projectContext: new ProjectConfigContext({
            projectName: config.name,
            projectRoot: config.path,
            artifactsPath,
            vcsInfo,
            username,
            loggedIn: true,
            enterpriseDomain: config.domain,
            secrets: {},
            commandInfo,
          }),

          projectConfig: config,
          variableOverrides: {},
          envString: "$.%",
          artifactsPath,
          vcsInfo,
          username,
          loggedIn: true,
          enterpriseDomain,
          secrets: {},
          commandInfo,
        }),
      { contains: "Invalid environment specified ($.%): must be a valid environment name or <namespace>.<environment>" }
    )
  })

  it("should throw if environment requires namespace but none is specified and defaultNamespace=null", async () => {
    const config: ProjectConfig = createProjectConfig({
      name: "my-project",
      path: "/tmp/foo",
      environments: [{ name: "default", defaultNamespace: null, variables: {} }],
    })

    await expectError(
      () =>
        pickEnvironment({
          projectContext: new ProjectConfigContext({
            projectName: config.name,
            projectRoot: config.path,
            artifactsPath,
            vcsInfo,
            username,
            loggedIn: true,
            enterpriseDomain: config.domain,
            secrets: {},
            commandInfo,
          }),
          projectConfig: config,
          variableOverrides: {},
          envString: "default",
          artifactsPath,
          vcsInfo,
          username,
          loggedIn: true,
          enterpriseDomain,
          secrets: {},
          commandInfo,
        }),
      {
        contains:
          "Environment default has defaultNamespace set to null in the project configuration, and no explicit namespace was specified. Please either set a defaultNamespace or explicitly set a namespace at runtime (e.g. --env=some-namespace.default).",
      }
    )
  })
})

describe("parseEnvironment", () => {
  it("should correctly parse with no namespace", () => {
    const result = parseEnvironment("env")
    expect(result).to.eql({ environment: "env" })
  })

  it("should correctly parse with a namespace", () => {
    const result = parseEnvironment("ns.env")
    expect(result).to.eql({ environment: "env", namespace: "ns" })
  })

  it("should throw if string contains more than two segments", () => {
    void expectError(() => parseEnvironment("a.b.c"), {
      contains: "Invalid environment specified (a.b.c): may only contain a single delimiter",
    })
  })

  it("should throw if string is not a valid hostname", () => {
    void expectError(() => parseEnvironment("&.$"), {
      contains: "Invalid environment specified (&.$): must be a valid environment name or <namespace>.<environment>",
    })
  })
})
