/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { platform } from "os"
import { expect } from "chai"
import tmp from "tmp-promise"
import {
  ProjectConfig,
  resolveProjectConfig,
  defaultEnvironments,
  pickEnvironment,
  defaultVarfilePath,
  defaultEnvVarfilePath,
  parseEnvironment,
  defaultNamespace,
  fixedPlugins,
} from "../../../../src/config/project"
import { DEFAULT_API_VERSION } from "../../../../src/constants"
import { expectError } from "../../../helpers"
import { defaultDotIgnoreFiles } from "../../../../src/util/fs"
import { realpath, writeFile } from "fs-extra"
import { dedent } from "../../../../src/util/string"
import { resolve, join } from "path"
import stripAnsi from "strip-ansi"
import { keyBy } from "lodash"

const enterpriseDomain = "https://garden.mydomain.com"
const commandInfo = { name: "test", args: {}, opts: {} }

describe("resolveProjectConfig", () => {
  it("should pass through a canonical project config", async () => {
    const defaultEnvironment = "default"
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment,
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [{ name: "default", defaultNamespace, variables: {} }],
      outputs: [],
      providers: [{ name: "some-provider", dependencies: [] }],
      variables: {},
    }

    expect(
      resolveProjectConfig({
        defaultEnvironment,
        config,
        artifactsPath: "/tmp",
        branch: "main",
        username: "some-user",
        loggedIn: true,
        enterpriseDomain,
        secrets: {},
        commandInfo,
      })
    ).to.eql({
      ...config,
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {},
        },
      ],
      sources: [],
      varfile: defaultVarfilePath,
    })
  })

  it("should inject a default environment if none is specified", async () => {
    const defaultEnvironment = "local"
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment,
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [],
      outputs: [],
      providers: [{ name: "some-provider", dependencies: [] }],
      variables: {},
    }

    expect(
      resolveProjectConfig({
        defaultEnvironment,
        config,
        artifactsPath: "/tmp",
        branch: "main",
        username: "some-user",
        loggedIn: true,
        enterpriseDomain,
        secrets: {},
        commandInfo,
      })
    ).to.eql({
      ...config,
      sources: [],
      environments: defaultEnvironments,
      varfile: defaultVarfilePath,
    })
  })

  it("should resolve template strings on fields other than environments, providers and remote sources", async () => {
    const repositoryUrl = "git://github.com/foo/bar.git#boo"
    const defaultEnvironment = "default"

    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment,
      dotIgnoreFiles: defaultDotIgnoreFiles,
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
    }

    process.env.TEST_ENV_VAR = "foo"

    expect(
      resolveProjectConfig({
        defaultEnvironment,
        config,
        artifactsPath: "/tmp",
        branch: "main",
        username: "some-user",
        loggedIn: true,
        enterpriseDomain,
        secrets: { foo: "banana" },
        commandInfo,
      })
    ).to.eql({
      ...config,
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
      varfile: defaultVarfilePath,
      variables: {
        platform: platform(),
        secret: "banana",
        projectPath: config.path,
        envVar: "foo",
      },
    })

    delete process.env.TEST_ENV_VAR
  })

  it("should pass through templated fields on provider configs", async () => {
    const defaultEnvironment = "default"
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment,
      dotIgnoreFiles: defaultDotIgnoreFiles,
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
      variables: {},
    }

    process.env.TEST_ENV_VAR_A = "foo"
    process.env.TEST_ENV_VAR_B = "boo"

    expect(
      resolveProjectConfig({
        defaultEnvironment,
        config,
        artifactsPath: "/tmp",
        branch: "main",
        username: "some-user",
        loggedIn: true,
        enterpriseDomain,
        secrets: {},
        commandInfo,
      })
    ).to.eql({
      ...config,
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
          dependencies: [],
          someKey: "${local.env.TEST_ENV_VAR_A}",
        },
        {
          name: "provider-b",
          dependencies: [],
          environments: ["default"],
          someKey: "${local.env.TEST_ENV_VAR_B}",
        },
      ],
      sources: [],
      varfile: defaultVarfilePath,
    })

    delete process.env.TEST_ENV_VAR_A
    delete process.env.TEST_ENV_VAR_B
  })

  it("should pass through templated fields on environment configs", async () => {
    const defaultEnvironment = "default"
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment,
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {
            envVar: "${var.foo}",
          },
        },
      ],
      providers: [],
      variables: {},
    }

    const result = resolveProjectConfig({
      defaultEnvironment,
      config,
      artifactsPath: "/tmp",
      branch: "main",
      username: "some-user",
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    expect(result.environments[0].variables).to.eql(config.environments[0].variables)
  })

  it("should pass through templated fields on remote source configs", async () => {
    const repositoryUrl = "git://github.com/foo/bar.git#boo"
    const defaultEnvironment = "default"

    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment,
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {},
        },
      ],
      providers: [],
      sources: [
        {
          name: "${local.env.TEST_ENV_VAR}",
          repositoryUrl,
        },
      ],
      variables: {},
    }

    process.env.TEST_ENV_VAR = "foo"

    expect(
      resolveProjectConfig({
        defaultEnvironment,
        config,
        artifactsPath: "/tmp",
        branch: "main",
        username: "some-user",
        loggedIn: true,
        enterpriseDomain,
        secrets: {},
        commandInfo,
      })
    ).to.eql({
      ...config,
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
      varfile: defaultVarfilePath,
      variables: {},
    })

    delete process.env.TEST_ENV_VAR
  })

  it("should set defaultEnvironment to first environment if not configured", async () => {
    const defaultEnvironment = ""
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment,
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [],
      outputs: [],
      providers: [{ name: "some-provider", dependencies: [] }],
      variables: {},
    }

    expect(
      resolveProjectConfig({
        defaultEnvironment,
        config,
        artifactsPath: "/tmp",
        branch: "main",
        username: "some-user",
        loggedIn: true,
        enterpriseDomain,
        secrets: {},
        commandInfo,
      })
    ).to.eql({
      ...config,
      defaultEnvironment: "local",
      environments: defaultEnvironments,
      sources: [],
      varfile: defaultVarfilePath,
    })
  })

  it("should populate default values in the schema", async () => {
    const defaultEnvironment = ""
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment,
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [],
      outputs: [],
      providers: [{ name: "some-provider", dependencies: [] }],
      variables: {},
    }

    expect(
      resolveProjectConfig({
        defaultEnvironment,
        config,
        artifactsPath: "/tmp",
        branch: "main",
        username: "some-user",
        loggedIn: true,
        enterpriseDomain,
        secrets: {},
        commandInfo,
      })
    ).to.eql({
      ...config,
      defaultEnvironment: "local",
      environments: defaultEnvironments,
      sources: [],
      varfile: defaultVarfilePath,
    })
  })

  it("should include providers in correct precedence order from all possible config keys", async () => {
    const defaultEnvironment = "default"
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
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
    }

    expect(
      resolveProjectConfig({
        defaultEnvironment,
        config,
        artifactsPath: "/tmp",
        branch: "main",
        username: "some-user",
        loggedIn: true,
        enterpriseDomain,
        secrets: {},
        commandInfo,
      })
    ).to.eql({
      ...config,
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
          dependencies: [],
        },
        {
          name: "provider-b",
          environments: ["default"],
          dependencies: [],
        },
        {
          name: "provider-c",
          dependencies: [],
        },
      ],
      sources: [],
      varfile: defaultVarfilePath,
    })
  })

  it("should convert old-style environment/provider config to the new canonical form", async () => {
    const defaultEnvironment = "default"
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [
        {
          name: "default",
          defaultNamespace,
          providers: [
            {
              name: "provider-b",
            },
          ],
          variables: {
            envVar: "bar",
          },
        },
      ],
      outputs: [],
      providers: [
        {
          name: "provider-a",
        },
      ],
      variables: {
        defaultVar: "foo",
      },
    }

    expect(
      resolveProjectConfig({
        defaultEnvironment,
        config,
        artifactsPath: "/tmp",
        branch: "main",
        username: "some-user",
        loggedIn: true,
        enterpriseDomain,
        secrets: {},
        commandInfo,
      })
    ).to.eql({
      ...config,
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {
            envVar: "bar",
          },
        },
      ],
      outputs: [],
      providers: [
        {
          name: "provider-a",
          dependencies: [],
        },
        {
          name: "provider-b",
          environments: ["default"],
        },
      ],
      sources: [],
      varfile: defaultVarfilePath,
      variables: {
        defaultVar: "foo",
      },
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
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [{ name: "default", defaultNamespace, variables: {} }],
      providers: [],
      variables: {},
    }

    await expectError(
      () =>
        pickEnvironment({
          projectConfig: config,
          envString: "foo",
          artifactsPath,
          branch: "main",
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
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [{ name: "default", defaultNamespace, variables: {} }],
      providers: [],
      variables: {},
    }

    expect(
      await pickEnvironment({
        projectConfig: config,
        envString: "default",
        artifactsPath,
        branch: "main",
        username,
        loggedIn: true,
        enterpriseDomain,
        secrets: {},
        commandInfo,
      })
    ).to.eql({
      environmentName: "default",
      namespace: "default",
      providers: fixedPlugins.map((name) => ({ name })),
      production: false,
      variables: {},
    })
  })

  it("should correctly merge provider configurations using JSON Merge Patch", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {},
          providers: [{ name: "my-provider", b: "d" }, { name: "env-provider" }],
        },
      ],
      providers: [
        { name: "container", newKey: "foo" },
        { name: "my-provider", a: "a" },
        { name: "my-provider", b: "b" },
        { name: "my-provider", a: "c" },
      ],
      variables: {},
    }

    expect(
      await pickEnvironment({
        projectConfig: config,
        envString: "default",
        artifactsPath,
        branch: "main",
        username,
        loggedIn: true,
        enterpriseDomain,
        secrets: {},
        commandInfo,
      })
    ).to.eql({
      environmentName: "default",
      namespace: "default",
      providers: [
        { name: "exec" },
        { name: "container", newKey: "foo" },
        { name: "templated" },
        { name: "my-provider", a: "c", b: "d" },
        { name: "env-provider" },
      ],
      production: false,
      variables: {},
    })
  })

  it("should remove null values in provider configs (as per the JSON Merge Patch spec)", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [{ name: "default", defaultNamespace, variables: {} }],
      providers: [
        { name: "container", newKey: "foo" },
        { name: "my-provider", a: "a" },
        { name: "my-provider", b: "b" },
        { name: "my-provider", a: null },
      ],
      variables: {},
    }

    expect(
      await pickEnvironment({
        projectConfig: config,
        envString: "default",
        artifactsPath,
        branch: "main",
        username,
        loggedIn: true,
        enterpriseDomain,
        secrets: {},
        commandInfo,
      })
    ).to.eql({
      environmentName: "default",
      namespace: "default",
      providers: [
        { name: "exec" },
        { name: "container", newKey: "foo" },
        { name: "templated" },
        { name: "my-provider", b: "b" },
      ],
      production: false,
      variables: {},
    })
  })

  it("should correctly merge project and environment variables", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
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
    }

    const result = await pickEnvironment({
      projectConfig: config,
      envString: "default",
      artifactsPath,
      branch: "main",
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    expect(result.variables).to.eql({
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
    const varfilePath = resolve(tmpPath, defaultVarfilePath)
    await writeFile(
      varfilePath,
      dedent`
      a=a
      b=b
    `
    )

    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: tmpPath,
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
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
      providers: [],
      variables: {},
    }

    const result = await pickEnvironment({
      projectConfig: config,
      envString: "default",
      artifactsPath,
      branch: "main",
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    expect(result.variables).to.eql({
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

    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: tmpPath,
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {},
        },
      ],
      providers: [],
      variables: {
        a: "a",
        b: "b",
      },
    }

    const result = await pickEnvironment({
      projectConfig: config,
      envString: "default",
      artifactsPath,
      branch: "main",
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    expect(result.variables).to.eql({
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

    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: tmpPath,
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
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
      providers: [],
      varfile: "foo.env",
      variables: {},
    }

    const result = await pickEnvironment({
      projectConfig: config,
      envString: "default",
      artifactsPath,
      branch: "main",
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    expect(result.variables).to.eql({
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

    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: tmpPath,
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [
        {
          name: "default",
          defaultNamespace,
          varfile: "foo.env",
          variables: {},
        },
      ],
      providers: [],
      variables: {
        a: "a",
        b: "b",
      },
    }

    const result = await pickEnvironment({
      projectConfig: config,
      envString: "default",
      artifactsPath,
      branch: "main",
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    expect(result.variables).to.eql({
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

    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: tmpPath,
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {},
          varfile: "foo.default.yaml",
        },
      ],
      providers: [],
      varfile: "foo.yml",
      variables: {},
    }

    const result = await pickEnvironment({
      projectConfig: config,
      envString: "default",
      artifactsPath,
      branch: "main",
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    expect(result.variables).to.eql({
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

    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: tmpPath,
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {},
          varfile: "foo.default.json",
        },
      ],
      providers: [],
      varfile: "foo.json",
      variables: {},
    }

    const result = await pickEnvironment({
      projectConfig: config,
      envString: "default",
      artifactsPath,
      branch: "main",
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    expect(result.variables).to.eql({
      a: "new-value",
      b: { some: "value", additional: "value" },
      c: ["some", "values"],
      d: "something",
    })
  })

  it("should resolve template strings in the picked environment", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [
        { name: "default", defaultNamespace, variables: { local: "${local.username}", secret: "${secrets.foo}" } },
      ],
      providers: [],
      variables: {},
    }

    const result = await pickEnvironment({
      projectConfig: config,
      envString: "default",
      artifactsPath,
      branch: "main",
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: { foo: "banana" },
      commandInfo,
    })

    expect(result.variables).to.eql({
      local: username,
      secret: "banana",
    })
  })

  it("should ignore template strings in other environments", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [
        { name: "default", defaultNamespace, variables: {} },
        { name: "other", defaultNamespace, variables: { foo: "${var.missing}", secret: "${secrets.missing}" } },
      ],
      providers: [],
      variables: {},
    }

    await pickEnvironment({
      projectConfig: config,
      envString: "default",
      artifactsPath,
      branch: "main",
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })
  })

  it("should pass through template strings in the providers field on environments", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {},
          providers: [{ name: "my-provider", a: "${var.missing}", b: "${secrets.missing}" }],
        },
      ],
      providers: [],
      variables: {},
    }

    const result = await pickEnvironment({
      projectConfig: config,
      envString: "default",
      artifactsPath,
      branch: "main",
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    expect(keyBy(result.providers, "name")["my-provider"].a).to.equal("${var.missing}")
  })

  it("should allow referencing top-level variables", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [{ name: "default", defaultNamespace, variables: { foo: "${var.foo}" } }],
      providers: [],
      variables: { foo: "value" },
    }

    const result = await pickEnvironment({
      projectConfig: config,
      envString: "default",
      artifactsPath,
      branch: "main",
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    expect(result.variables).to.eql({
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
      resolve(tmpPath, defaultVarfilePath),
      dedent`
      b=B
      c=c
    `
    )

    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: tmpPath,
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
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
      providers: [],
      // Precedence 4/4 (lowest)
      variables: {
        a: "a",
        b: "b",
      },
    }

    const result = await pickEnvironment({
      projectConfig: config,
      envString: "default",
      artifactsPath,
      branch: "main",
      username,
      loggedIn: true,
      enterpriseDomain,
      secrets: {},
      commandInfo,
    })

    expect(result.variables).to.eql({
      a: "a",
      b: "B",
      c: "C",
      d: "D",
      e: "e",
    })
  })

  it("should validate the picked environment", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: tmpPath,
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [
        {
          name: "default",
          defaultNamespace: "${var.foo}",
          variables: {},
        },
      ],
      providers: [],
      variables: {
        foo: 123,
      },
    }

    await expectError(
      () =>
        pickEnvironment({
          projectConfig: config,
          envString: "default",
          artifactsPath,
          branch: "main",
          username,
          loggedIn: true,
          enterpriseDomain,
          secrets: {},
          commandInfo,
        }),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(
          "Error validating environment default: key .defaultNamespace must be a string"
        )
    )
  })

  it("should throw if project varfile is set to non-default and it doesn't exist", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: tmpPath,
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {},
        },
      ],
      providers: [],
      varfile: "foo.env",
      variables: {},
    }

    await expectError(
      () =>
        pickEnvironment({
          projectConfig: config,
          envString: "default",
          artifactsPath,
          branch: "main",
          username,
          loggedIn: true,
          enterpriseDomain,
          secrets: {},
          commandInfo,
        }),
      (err) => expect(err.message).to.equal("Could not find varfile at path 'foo.env'")
    )
  })

  it("should throw if environment varfile is set to non-default and it doesn't exist", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: tmpPath,
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [
        {
          name: "default",
          defaultNamespace,
          varfile: "foo.env",
          variables: {},
        },
      ],
      providers: [],
      variables: {},
    }

    await expectError(
      () =>
        pickEnvironment({
          projectConfig: config,
          envString: "default",
          artifactsPath,
          branch: "main",
          username,
          loggedIn: true,
          enterpriseDomain,
          secrets: {},
          commandInfo,
        }),
      (err) => expect(err.message).to.equal("Could not find varfile at path 'foo.env'")
    )
  })

  it("should set environment namespace if specified and defaultNamespace=null", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [{ name: "default", defaultNamespace, variables: {} }],
      providers: [],
      variables: {},
    }

    expect(
      await pickEnvironment({
        projectConfig: config,
        envString: "foo.default",
        artifactsPath,
        branch: "main",
        username,
        loggedIn: true,
        enterpriseDomain,
        secrets: {},
        commandInfo,
      })
    ).to.eql({
      environmentName: "default",
      namespace: "foo",
      providers: fixedPlugins.map((name) => ({ name })),
      production: false,
      variables: {},
    })
  })

  it("should use explicit namespace if specified and there is a default", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [{ name: "default", defaultNamespace, variables: {} }],
      providers: [],
      variables: {},
    }

    expect(
      await pickEnvironment({
        projectConfig: config,
        envString: "foo.default",
        artifactsPath,
        branch: "main",
        username,
        loggedIn: true,
        enterpriseDomain,
        secrets: {},
        commandInfo,
      })
    ).to.eql({
      environmentName: "default",
      namespace: "foo",
      providers: fixedPlugins.map((name) => ({ name })),
      production: false,
      variables: {},
    })
  })

  it("should use defaultNamespace if set and no explicit namespace is specified", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [{ name: "default", defaultNamespace, variables: {} }],
      providers: [],
      variables: {},
    }

    expect(
      await pickEnvironment({
        projectConfig: config,
        envString: "default",
        artifactsPath,
        username,
        branch: "main",
        loggedIn: true,
        enterpriseDomain,
        secrets: {},
        commandInfo,
      })
    ).to.eql({
      environmentName: "default",
      namespace: "default",
      providers: fixedPlugins.map((name) => ({ name })),
      production: false,
      variables: {},
    })
  })

  it("should throw if invalid environment is specified", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [{ name: "default", defaultNamespace, variables: {} }],
      providers: [],
      variables: {},
    }

    await expectError(
      () =>
        pickEnvironment({
          projectConfig: config,
          envString: "$.%",
          artifactsPath,
          branch: "main",
          username,
          loggedIn: true,
          enterpriseDomain,
          secrets: {},
          commandInfo,
        }),
      (err) =>
        expect(err.message).to.equal(
          "Invalid environment specified ($.%): must be a valid environment name or <namespace>.<environment>"
        )
    )
  })

  it("should throw if environment requires namespace but none is specified and defaultNamespace=null", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [{ name: "default", defaultNamespace: null, variables: {} }],
      providers: [],
      variables: {},
    }

    await expectError(
      () =>
        pickEnvironment({
          projectConfig: config,
          envString: "default",
          artifactsPath,
          branch: "main",
          username,
          loggedIn: true,
          enterpriseDomain,
          secrets: {},
          commandInfo,
        }),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(
          "Environment default has defaultNamespace set to null, and no explicit namespace was specified. Please either set a defaultNamespace or explicitly set a namespace at runtime (e.g. --env=some-namespace.default)."
        )
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
    expectError(
      () => parseEnvironment("a.b.c"),
      (err) =>
        expect(err.message).to.equal("Invalid environment specified (a.b.c): may only contain a single delimiter")
    )
  })

  it("should throw if string is not a valid hostname", () => {
    expectError(
      () => parseEnvironment("&.$"),
      (err) =>
        expect(err.message).to.equal(
          "Invalid environment specified (&.$): must be a valid environment name or <namespace>.<environment>"
        )
    )
  })
})
