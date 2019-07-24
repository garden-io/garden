import { platform } from "os"
import { expect } from "chai"
import {
  ProjectConfig,
  resolveProjectConfig,
  defaultEnvironments,
  pickEnvironment,
} from "../../../../src/config/project"
import { DEFAULT_API_VERSION } from "../../../../src/constants"
import { expectError } from "../../../helpers"
import { defaultDotIgnoreFiles } from "../../../../src/util/fs"

describe("resolveProjectConfig", () => {
  it("should pass through a canonical project config", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [
        { name: "default", variables: {} },
      ],
      providers: [
        { name: "some-provider" },
      ],
      variables: {},
    }

    expect(await resolveProjectConfig(config)).to.eql({
      ...config,
      environmentDefaults: {
        providers: [],
        variables: {},
      },
      environments: [
        { name: "default", providers: [], variables: {} },
      ],
      sources: [],
    })
  })

  it("should inject a default environment if none is specified", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "local",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [],
      providers: [
        { name: "some-provider" },
      ],
      variables: {},
    }

    expect(await resolveProjectConfig(config)).to.eql({
      ...config,
      environmentDefaults: {
        providers: [],
        variables: {},
      },
      environments: defaultEnvironments,
      sources: [],
    })
  })

  it("should resolve template strings on fields other than provider configs", async () => {
    const repositoryUrl = "git://github.com/foo/bar.git#boo"

    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environmentDefaults: {
        variables: {
          defaultEnvVar: "\${local.env.TEST_ENV_VAR}",
        },
      },
      environments: [
        {
          name: "default",
          variables: {
            envVar: "\${local.env.TEST_ENV_VAR}",
          },
        },
      ],
      providers: [
        { name: "some-provider" },
      ],
      sources: [
        {
          name: "\${local.env.TEST_ENV_VAR}",
          repositoryUrl,
        },
      ],
      variables: {
        platform: "\${local.platform}",
      },
    }

    process.env.TEST_ENV_VAR = "foo"

    expect(await resolveProjectConfig(config)).to.eql({
      ...config,
      environmentDefaults: {
        providers: [],
        variables: {},
      },
      environments: [
        {
          name: "default",
          providers: [],
          variables: {
            envVar: "foo",
          },
        },
      ],
      sources: [
        {
          name: "foo",
          repositoryUrl,
        },
      ],
      variables: {
        defaultEnvVar: "foo",
        platform: platform(),
      },
    })

    delete process.env.TEST_ENV_VAR
  })

  it("should pass through templated fields on provider configs", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environmentDefaults: {
        providers: [
          {
            name: "provider-a",
            someKey: "\${local.env.TEST_ENV_VAR_A}",
          },
        ],
        variables: {},
      },
      environments: [
        {
          name: "default",
          providers: [
            {
              name: "provider-b",
              someKey: "\${local.env.TEST_ENV_VAR_B}",
            },
          ],
          variables: {
            envVar: "foo",
          },
        },
      ],
      providers: [
        {
          name: "provider-c",
          someKey: "\${local.env.TEST_ENV_VAR_C}",
        },
      ],
      variables: {},
    }

    process.env.TEST_ENV_VAR_A = "foo"
    process.env.TEST_ENV_VAR_B = "boo"
    process.env.TEST_ENV_VAR_C = "moo"

    expect(await resolveProjectConfig(config)).to.eql({
      ...config,
      environmentDefaults: {
        providers: [],
        variables: {},
      },
      environments: [
        {
          name: "default",
          providers: [],
          variables: {
            envVar: "foo",
          },
        },
      ],
      providers: [
        {
          name: "provider-a",
          someKey: "\${local.env.TEST_ENV_VAR_A}",
        },
        {
          name: "provider-c",
          someKey: "\${local.env.TEST_ENV_VAR_C}",
        },
        {
          name: "provider-b",
          environments: ["default"],
          someKey: "\${local.env.TEST_ENV_VAR_B}",
        },
      ],
      sources: [],
    })

    delete process.env.TEST_ENV_VAR_A
    delete process.env.TEST_ENV_VAR_B
    delete process.env.TEST_ENV_VAR_C
  })

  it("should set defaultEnvironment to first environment if not configured", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [],
      providers: [
        { name: "some-provider" },
      ],
      variables: {},
    }

    expect(await resolveProjectConfig(config)).to.eql({
      ...config,
      defaultEnvironment: "local",
      environmentDefaults: {
        providers: [],
        variables: {},
      },
      environments: defaultEnvironments,
      sources: [],
    })
  })

  it("should populate default values in the schema", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [],
      providers: [
        { name: "some-provider" },
      ],
      variables: {},
    }

    expect(await resolveProjectConfig(config)).to.eql({
      ...config,
      defaultEnvironment: "local",
      environmentDefaults: {
        providers: [],
        variables: {},
      },
      environments: defaultEnvironments,
      sources: [],
    })
  })

  it("should include providers in correct precedency order from all possible config keys", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environmentDefaults: {
        providers: [
          {
            name: "provider-a",
          },
        ],
        variables: {},
      },
      environments: [
        {
          name: "default",
          providers: [
            {
              name: "provider-b",
            },
          ],
          variables: {
            envVar: "foo",
          },
        },
      ],
      providers: [
        {
          name: "provider-c",
        },
      ],
      variables: {},
    }

    expect(await resolveProjectConfig(config)).to.eql({
      ...config,
      environmentDefaults: {
        providers: [],
        variables: {},
      },
      environments: [
        {
          name: "default",
          providers: [],
          variables: {
            envVar: "foo",
          },
        },
      ],
      providers: [
        {
          name: "provider-a",
        },
        {
          name: "provider-c",
        },
        {
          name: "provider-b",
          environments: ["default"],
        },
      ],
      sources: [],
    })
  })

  it("should convert old-style environment/provider config to the new canonical form", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environmentDefaults: {
        providers: [
          {
            name: "provider-a",
          },
        ],
        variables: {
          defaultVar: "foo",
        },
      },
      environments: [
        {
          name: "default",
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
      providers: [],
      variables: {},
    }

    expect(await resolveProjectConfig(config)).to.eql({
      ...config,
      environmentDefaults: {
        providers: [],
        variables: {},
      },
      environments: [
        {
          name: "default",
          providers: [],
          variables: {
            envVar: "bar",
          },
        },
      ],
      providers: [
        {
          name: "provider-a",
        },
        {
          name: "provider-b",
          environments: ["default"],
        },
      ],
      sources: [],
      variables: {
        defaultVar: "foo",
      },
    })
  })
})

describe("pickEnvironment", () => {
  it("should throw if selected environment isn't configured", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [
        { name: "default", variables: {} },
      ],
      providers: [],
      variables: {},
    }

    await expectError(() => pickEnvironment(config, "foo"), "parameter")
  })

  it("should include fixed providers in output", async () => {
    const config: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "my-project",
      path: "/tmp/foo",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [
        { name: "default", variables: {} },
      ],
      providers: [],
      variables: {},
    }

    expect(await pickEnvironment(config, "default")).to.eql({
      providers: [
        { name: "exec" },
        { name: "container" },
      ],
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
        { name: "default", variables: {} },
      ],
      providers: [
        { name: "container", newKey: "foo" },
        { name: "my-provider", a: "a" },
        { name: "my-provider", b: "b" },
        { name: "my-provider", a: "c" },
      ],
      variables: {},
    }

    expect(await pickEnvironment(config, "default")).to.eql({
      providers: [
        { name: "exec" },
        { name: "container", newKey: "foo" },
        { name: "my-provider", a: "c", b: "b" },
      ],
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
      environments: [
        { name: "default", variables: {} },
      ],
      providers: [
        { name: "container", newKey: "foo" },
        { name: "my-provider", a: "a" },
        { name: "my-provider", b: "b" },
        { name: "my-provider", a: null },
      ],
      variables: {},
    }

    expect(await pickEnvironment(config, "default")).to.eql({
      providers: [
        { name: "exec" },
        { name: "container", newKey: "foo" },
        { name: "my-provider", b: "b" },
      ],
      variables: {},
    })
  })
})
