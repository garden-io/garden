/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"
import { BooleanParameter, IntegerParameter, StringParameter } from "../../../../src/cli/params.js"
import { CustomCommandWrapper, getCustomCommands } from "../../../../src/commands/custom.js"
import type { Log } from "../../../../src/logger/log-entry.js"
import type { TestGarden } from "../../../../src/util/testing.js"
import { expectError } from "../../../../src/util/testing.js"
import { makeTestGardenA, withDefaultGlobalOpts, makeTempDir } from "../../../helpers.js"
import { GardenApiVersion } from "../../../../src/constants.js"
import { TestGardenCli } from "../../../helpers/cli.js"
import { parseTemplateCollection } from "../../../../src/template/templated-collections.js"
import type { CommandResource } from "../../../../src/config/command.js"
import { shouldBeDropped } from "../../../../src/commands/helpers/steps.js"
import type { StepSpec } from "../../../../src/commands/helpers/steps.js"
import { dumpYaml } from "../../../../src/util/serialization.js"

describe("CustomCommandWrapper", () => {
  let garden: TestGarden
  let log: Log
  const cli = new TestGardenCli()

  before(async () => {
    garden = await makeTestGardenA()
    log = garden.log
  })

  it("correctly converts arguments from spec", () => {
    const cmd = new CustomCommandWrapper({
      apiVersion: GardenApiVersion.v0,
      kind: "Command",
      name: "test",
      internal: {
        basePath: "/tmp",
      },
      description: {
        short: "Test A",
      },
      args: [
        { type: "string", name: "a", description: "Arg A", required: true },
        { type: "integer", name: "b", description: "Arg B" },
      ],
      opts: [],
      variables: {},
    })

    expect(Object.keys(cmd.arguments!)).to.eql(["a", "b"])
    expect(cmd.arguments?.["a"]).to.be.instanceOf(StringParameter)
    expect(cmd.arguments?.["a"].required).to.be.true
    expect(cmd.arguments?.["b"]).to.be.instanceOf(IntegerParameter)
    expect(cmd.arguments?.["b"].required).to.be.false
  })

  it("correctly converts options from spec", () => {
    const cmd = new CustomCommandWrapper({
      apiVersion: GardenApiVersion.v0,
      kind: "Command",
      name: "test",
      internal: {
        basePath: "/tmp",
      },
      description: {
        short: "Test A",
      },
      args: [],
      opts: [
        { type: "string", name: "a", description: "Arg A", required: true },
        { type: "integer", name: "b", description: "Arg B" },
        { type: "boolean", name: "c", description: "Arg C" },
      ],
      variables: {},
    })

    expect(Object.keys(cmd.options!)).to.eql(["a", "b", "c"])
    expect(cmd.options?.["a"]).to.be.instanceOf(StringParameter)
    expect(cmd.options?.["a"].required).to.be.true
    expect(cmd.options?.["b"]).to.be.instanceOf(IntegerParameter)
    expect(cmd.options?.["b"].required).to.be.false
    expect(cmd.options?.["c"]).to.be.instanceOf(BooleanParameter)
    expect(cmd.options?.["c"].required).to.be.false
  })

  it("sets name and help text from spec", () => {
    const short = "Test"
    const long = "Here's the full description"

    const cmd = new CustomCommandWrapper(
      parseTemplateCollection({
        value: {
          apiVersion: GardenApiVersion.v0,
          kind: "Command",
          name: "test",
          internal: {
            basePath: "/tmp",
          },
          description: {
            short,
            long,
          },
          args: [],
          opts: [],
          variables: {},
        },
        source: { path: [] },
      })
    )

    expect(cmd.name).to.equal("test")
    expect(cmd.help).to.equal(short)
    expect(cmd.description).to.equal(long)
  })

  it("sets the ${args.$rest} variable correctly", async () => {
    const cmd = new CustomCommandWrapper(
      parseTemplateCollection({
        value: {
          apiVersion: GardenApiVersion.v0,
          kind: "Command",
          name: "test",
          internal: {
            basePath: "/tmp",
          },
          description: {
            short: "Test",
          },
          args: [
            { type: "string", name: "a", description: "Arg A", required: true },
            { type: "integer", name: "b", description: "Arg B" },
          ],
          opts: [
            { type: "string", name: "a", description: "Opt A", required: true },
            { type: "boolean", name: "b", description: "Opt B" },
          ],
          variables: {},
          exec: {
            command: ["echo", "${join(args.$rest, ' ')}" as string],
          },
        } as const,
        source: { path: [] },
      })
    )

    const { result } = await cmd.action({
      cli,
      garden,
      log,
      args: {
        a: "A",
        b: "B",
        $all: ["test", "foo", "bar", "bla", "--bla=blop", "-c", "d"],
      },
      opts: withDefaultGlobalOpts({}),
    })

    expect(result?.exec?.command).to.eql(["echo", "bla --bla=blop -c d"])
    expect(result?.exec?.exitCode).to.equal(0)
  })

  it("resolves template strings in command variables", async () => {
    const cmd = new CustomCommandWrapper(
      parseTemplateCollection({
        value: {
          apiVersion: GardenApiVersion.v0,
          kind: "Command",
          name: "test",
          internal: {
            basePath: "/tmp",
          },
          description: {
            short: "Test",
          },
          args: [],
          opts: [],
          variables: {
            foo: "${project.name}",
          },
          exec: {
            command: ["echo", "${var.foo}"],
          },
        },
        source: { path: [] },
      })
    )

    const { result } = await cmd.action({
      cli,
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({}),
    })

    expect(result?.exec?.command).to.eql(["echo", "test-project-a"])
    expect(result?.exec?.exitCode).to.equal(0)
  })

  it("runs an exec command with resolved templates", async () => {
    const cmd = new CustomCommandWrapper(
      parseTemplateCollection({
        value: {
          apiVersion: GardenApiVersion.v0,
          kind: "Command",
          name: "test",
          internal: {
            basePath: "/tmp",
          },
          description: {
            short: "Test",
          },
          args: [],
          opts: [],
          variables: {
            foo: "test",
          },
          exec: {
            command: ["echo", "${project.name}-${var.foo}"],
          },
        },
        source: { path: [] },
      })
    )

    const { result } = await cmd.action({
      cli,
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({}),
    })

    expect(result?.exec?.command).to.eql(["echo", "test-project-a-test"])
    expect(result?.exec?.exitCode).to.equal(0)
  })

  it("runs a Garden command with resolved templates", async () => {
    const cmd = new CustomCommandWrapper(
      parseTemplateCollection({
        value: {
          apiVersion: GardenApiVersion.v0,
          kind: "Command",
          name: "test",
          internal: {
            basePath: "/tmp",
          },
          description: {
            short: "Test",
          },
          args: [],
          opts: [],
          variables: {
            foo: "test",
          },
          gardenCommand: ["validate"],
        },
        source: { path: [] },
      })
    )

    const { result } = await cmd.action({
      cli,
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({}),
    })

    expect(result?.gardenCommand?.command).to.eql(["validate"])
  })

  it("runs exec command before Garden command if both are specified", async () => {
    const cmd = new CustomCommandWrapper(
      parseTemplateCollection({
        value: {
          apiVersion: GardenApiVersion.v0,
          kind: "Command",
          name: "test",
          internal: {
            basePath: "/tmp",
          },
          description: {
            short: "Test",
          },
          args: [],
          opts: [],
          variables: {},
          exec: {
            command: ["sleep", "1"],
          },
          gardenCommand: ["validate"],
        },
        source: { path: [] },
      })
    )

    const { result } = await cmd.action({
      cli,
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({}),
    })

    expect(result?.gardenCommand?.startedAt).to.be.greaterThan(result?.exec?.startedAt!)
  })

  it("exposes arguments and options correctly in command templates", async () => {
    const cmd = new CustomCommandWrapper(
      parseTemplateCollection({
        value: {
          apiVersion: GardenApiVersion.v0,
          kind: "Command",
          name: "test",
          internal: {
            basePath: "/tmp",
          },
          description: {
            short: "Test",
          },
          args: [
            { type: "string", name: "a", description: "Arg A", required: true },
            { type: "integer", name: "b", description: "Arg B" },
          ],
          opts: [
            { type: "string", name: "a", description: "Opt A", required: true },
            { type: "boolean", name: "b", description: "Opt B" },
          ],
          variables: {
            foo: "test",
          },
          exec: {
            command: [
              "sh",
              "-c",
              "echo ALL: ${args.$all}\necho ARG A: ${args.a}\necho ARG B: ${args.b}\necho OPT A: ${opts.a}\necho OPT B: ${opts.b}",
            ],
          },
        },
        source: { path: [] },
      }) as CommandResource
    )

    const { result } = await cmd.action({
      cli,
      garden,
      log,
      args: { a: "test-a", b: 123 },
      opts: withDefaultGlobalOpts({ a: "opt-a", b: true }),
    })

    expect(result?.exec?.command).to.eql([
      "sh",
      "-c",
      "echo ALL: \necho ARG A: test-a\necho ARG B: 123\necho OPT A: opt-a\necho OPT B: true",
    ])
  })

  it("defaults to global options passed in for Garden commands but allows overriding in the command spec", async () => {
    const cmd = new CustomCommandWrapper({
      apiVersion: GardenApiVersion.v0,
      kind: "Command",
      name: "test",
      internal: {
        basePath: "/tmp",
      },
      description: {
        short: "Test",
      },
      args: [],
      opts: [],
      variables: {},
      gardenCommand: ["echo", "foo", "bar", "-l=5"],
    })

    const { result } = await cmd.action({
      cli,
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({ "log-level": "error" }),
    })

    expect(result?.gardenCommand?.command).to.eql(["echo", "foo", "bar", "-l=5"])
  })

  it("can run nested custom commands", async () => {
    const cmd = new CustomCommandWrapper({
      apiVersion: GardenApiVersion.v0,
      kind: "Command",
      name: "test",
      internal: {
        basePath: "/tmp",
      },
      description: {
        short: "Test",
      },
      args: [],
      opts: [],
      variables: {},
      gardenCommand: ["echo", "foo", "bar"],
    })

    const { result } = await cmd.action({
      cli,
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({}),
    })

    expect(result?.gardenCommand?.command).to.eql(["echo", "foo", "bar"])
    expect((result?.gardenCommand?.result as Record<string, any>).exec.command).to.eql(["sh", "-c", "echo foo bar"])
  })

  it("throws on invalid argument type", () => {
    void expectError(
      () =>
        new CustomCommandWrapper({
          apiVersion: GardenApiVersion.v0,
          kind: "Command",
          name: "test",
          internal: {
            basePath: "/tmp",
          },
          description: {
            short: "Test",
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          args: [<any>{ type: "blorg" }],
          opts: [],
          variables: {},
          exec: {
            command: ["sleep", "1"],
          },
        }),
      { contains: "Unexpected parameter type 'blorg'" }
    )
  })

  it("throws on invalid option type", () => {
    void expectError(
      () =>
        new CustomCommandWrapper({
          apiVersion: GardenApiVersion.v0,
          kind: "Command",
          name: "test",
          internal: {
            basePath: "/tmp",
          },
          description: {
            short: "Test",
          },
          args: [],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          opts: [<any>{ type: "blorg" }],
          variables: {},
          exec: {
            command: ["sleep", "1"],
          },
        }),
      { contains: "Unexpected parameter type 'blorg'" }
    )
  })

  it("throws if variables is not a map", async () => {
    const cmd = new CustomCommandWrapper({
      apiVersion: GardenApiVersion.v0,
      kind: "Command",
      name: "test",
      internal: {
        basePath: "/tmp",
      },
      description: {
        short: "Test",
      },
      args: [],
      opts: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      variables: <any>"not-a-map",
      exec: {
        command: ["echo", "hi"],
      },
    })

    await expectError(
      () =>
        cmd.action({
          cli,
          garden,
          log,
          args: {},
          opts: withDefaultGlobalOpts({}),
        }),
      { contains: "must be a map of key/value pairs" }
    )
  })

  describe("steps", () => {
    it("runs a sequence of exec steps", async () => {
      const cmd = new CustomCommandWrapper(
        parseTemplateCollection({
          value: {
            apiVersion: GardenApiVersion.v0,
            kind: "Command",
            name: "test-steps",
            internal: {
              basePath: "/tmp",
            },
            description: {
              short: "Test steps",
            },
            args: [],
            opts: [],
            variables: {},
            steps: [
              {
                name: "step-one",
                exec: { command: ["echo", "hello"] },
              },
              {
                name: "step-two",
                exec: { command: ["echo", "world"] },
              },
            ],
          },
          source: { path: [] },
        })
      )

      const { result, errors } = await cmd.action({
        cli,
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({}),
      })

      expect(errors).to.eql([])
      expect(result?.steps).to.exist
      expect(result?.steps?.["step-one"]).to.exist
      expect(result?.steps?.["step-one"].number).to.equal(1)
      expect(result?.steps?.["step-two"]).to.exist
      expect(result?.steps?.["step-two"].number).to.equal(2)
    })

    it("runs a script step", async () => {
      const cmd = new CustomCommandWrapper(
        parseTemplateCollection({
          value: {
            apiVersion: GardenApiVersion.v0,
            kind: "Command",
            name: "test-script-step",
            internal: {
              basePath: "/tmp",
            },
            description: {
              short: "Test script step",
            },
            args: [],
            opts: [],
            variables: {},
            steps: [
              {
                name: "my-script",
                script: "echo hello-from-script",
              },
            ],
          },
          source: { path: [] },
        })
      )

      const { result, errors } = await cmd.action({
        cli,
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({}),
      })

      expect(errors).to.eql([])
      expect(result?.steps?.["my-script"]).to.exist
      expect(result?.steps?.["my-script"].outputs.stdout).to.include("hello-from-script")
    })

    it("runs a gardenCommand step", async () => {
      const cmd = new CustomCommandWrapper(
        parseTemplateCollection({
          value: {
            apiVersion: GardenApiVersion.v0,
            kind: "Command",
            name: "test-garden-step",
            internal: {
              basePath: "/tmp",
            },
            description: {
              short: "Test garden command step",
            },
            args: [],
            opts: [],
            variables: {},
            steps: [
              {
                name: "validate-step",
                gardenCommand: ["validate"],
              },
            ],
          },
          source: { path: [] },
        })
      )

      const { result, errors } = await cmd.action({
        cli,
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({}),
      })

      expect(errors).to.eql([])
      expect(result?.steps?.["validate-step"]).to.exist
      expect(result?.steps?.["validate-step"].number).to.equal(1)
    })

    it("auto-names steps when no name is specified", async () => {
      const cmd = new CustomCommandWrapper(
        parseTemplateCollection({
          value: {
            apiVersion: GardenApiVersion.v0,
            kind: "Command",
            name: "test-auto-name",
            internal: {
              basePath: "/tmp",
            },
            description: {
              short: "Test auto naming",
            },
            args: [],
            opts: [],
            variables: {},
            steps: [{ exec: { command: ["echo", "one"] } }, { exec: { command: ["echo", "two"] } }],
          },
          source: { path: [] },
        })
      )

      const { result } = await cmd.action({
        cli,
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({}),
      })

      expect(result?.steps?.["step-1"]).to.exist
      expect(result?.steps?.["step-2"]).to.exist
    })

    it("resolves template variables in step commands", async () => {
      const cmd = new CustomCommandWrapper(
        parseTemplateCollection({
          value: {
            apiVersion: GardenApiVersion.v0,
            kind: "Command",
            name: "test-templates",
            internal: {
              basePath: "/tmp",
            },
            description: {
              short: "Test templates in steps",
            },
            args: [],
            opts: [],
            variables: {
              greeting: "hello",
            },
            steps: [
              {
                name: "greet",
                script: "echo ${var.greeting}",
              },
            ],
          },
          source: { path: [] },
        })
      )

      const { result, errors } = await cmd.action({
        cli,
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({}),
      })

      expect(errors).to.eql([])
      expect(result?.steps?.["greet"]?.outputs?.stdout).to.include("hello")
    })

    it("references outputs from a prior script step", async () => {
      const cmd = new CustomCommandWrapper(
        parseTemplateCollection({
          value: {
            apiVersion: GardenApiVersion.v0,
            kind: "Command",
            name: "test-step-ref",
            internal: {
              basePath: "/tmp",
            },
            description: {
              short: "Test step output references",
            },
            args: [],
            opts: [],
            variables: {},
            steps: [
              {
                name: "producer",
                script: "echo step-one-output",
              },
              {
                name: "consumer",
                script: "echo received: ${steps.producer.outputs.stdout}",
              },
            ],
          },
          source: { path: [] },
        })
      )

      const { result, errors } = await cmd.action({
        cli,
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({}),
      })

      expect(errors).to.eql([])
      expect(result?.steps?.["producer"]?.outputs?.stdout).to.include("step-one-output")
      expect(result?.steps?.["consumer"]?.outputs?.stdout).to.include("received: step-one-output")
    })

    it("references the log output from a prior step", async () => {
      const cmd = new CustomCommandWrapper(
        parseTemplateCollection({
          value: {
            apiVersion: GardenApiVersion.v0,
            kind: "Command",
            name: "test-step-log-ref",
            internal: {
              basePath: "/tmp",
            },
            description: {
              short: "Test step log reference",
            },
            args: [],
            opts: [],
            variables: {},
            steps: [
              {
                name: "first",
                script: "echo hello-from-first",
              },
              {
                name: "second",
                script: "echo log-was: ${steps.first.log}",
              },
            ],
          },
          source: { path: [] },
        })
      )

      const { result, errors } = await cmd.action({
        cli,
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({}),
      })

      expect(errors).to.eql([])
      expect(result?.steps?.["second"]?.outputs?.stdout).to.include("log-was:")
    })

    it("references outputs from a prior gardenCommand step", async () => {
      const cmd = new CustomCommandWrapper(
        parseTemplateCollection({
          value: {
            apiVersion: GardenApiVersion.v0,
            kind: "Command",
            name: "test-garden-step-ref",
            internal: {
              basePath: "/tmp",
            },
            description: {
              short: "Test garden command step output reference",
            },
            args: [],
            opts: [],
            variables: {},
            steps: [
              {
                name: "validate-it",
                gardenCommand: ["validate"],
              },
              {
                name: "use-output",
                script: "echo validated",
              },
            ],
          },
          source: { path: [] },
        })
      )

      const { result, errors } = await cmd.action({
        cli,
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({}),
      })

      expect(errors).to.eql([])
      expect(result?.steps?.["validate-it"]).to.exist
      expect(result?.steps?.["validate-it"].number).to.equal(1)
      expect(result?.steps?.["use-output"]).to.exist
      expect(result?.steps?.["use-output"].number).to.equal(2)
      expect(result?.steps?.["use-output"]?.outputs?.stdout).to.include("validated")
    })

    it("chains outputs across multiple steps", async () => {
      const cmd = new CustomCommandWrapper(
        parseTemplateCollection({
          value: {
            apiVersion: GardenApiVersion.v0,
            kind: "Command",
            name: "test-chain",
            internal: {
              basePath: "/tmp",
            },
            description: {
              short: "Test chaining outputs across steps",
            },
            args: [],
            opts: [],
            variables: {},
            steps: [
              {
                name: "step-a",
                script: "echo alpha",
              },
              {
                name: "step-b",
                script: "echo ${steps.step-a.outputs.stdout}-beta",
              },
              {
                name: "step-c",
                script: "echo ${steps.step-b.outputs.stdout}-gamma",
              },
            ],
          },
          source: { path: [] },
        })
      )

      const { result, errors } = await cmd.action({
        cli,
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({}),
      })

      expect(errors).to.eql([])
      expect(result?.steps?.["step-a"]?.outputs?.stdout).to.include("alpha")
      expect(result?.steps?.["step-b"]?.outputs?.stdout).to.include("alpha")
      expect(result?.steps?.["step-b"]?.outputs?.stdout).to.include("beta")
      expect(result?.steps?.["step-c"]?.outputs?.stdout).to.include("beta")
      expect(result?.steps?.["step-c"]?.outputs?.stdout).to.include("gamma")
    })

    it("skips a step when skip is true", async () => {
      const cmd = new CustomCommandWrapper(
        parseTemplateCollection({
          value: {
            apiVersion: GardenApiVersion.v0,
            kind: "Command",
            name: "test-skip",
            internal: {
              basePath: "/tmp",
            },
            description: {
              short: "Test skip",
            },
            args: [],
            opts: [],
            variables: {},
            steps: [
              {
                name: "skipped",
                skip: true,
                exec: { command: ["echo", "should-not-run"] },
              },
              {
                name: "runs",
                exec: { command: ["echo", "runs"] },
              },
            ],
          },
          source: { path: [] },
        })
      )

      const { result } = await cmd.action({
        cli,
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({}),
      })

      expect(result?.steps?.["skipped"]).to.exist
      expect(result?.steps?.["skipped"].log).to.equal("")
      expect(result?.steps?.["runs"]).to.exist
    })
  })
})

describe("shouldBeDropped", () => {
  const makeStep = (overrides: Partial<StepSpec> = {}): StepSpec => ({
    script: "echo test",
    ...overrides,
  })

  it("returns false for `when: always` steps regardless of errors", () => {
    const steps = [makeStep(), makeStep({ when: "always" })]
    expect(shouldBeDropped(1, steps, { 0: [new Error("fail")] })).to.be.false
  })

  it("returns true for `when: never` steps", () => {
    const steps = [makeStep(), makeStep({ when: "never" })]
    expect(shouldBeDropped(1, steps, {})).to.be.true
  })

  it("returns true for `when: onError` steps when no prior error", () => {
    const steps = [makeStep(), makeStep({ when: "onError" })]
    expect(shouldBeDropped(1, steps, {})).to.be.true
  })

  it("returns false for `when: onError` steps when prior step errored", () => {
    const steps = [makeStep(), makeStep({ when: "onError" })]
    expect(shouldBeDropped(1, steps, { 0: [new Error("fail")] })).to.be.false
  })

  it("returns true for normal steps after an error", () => {
    const steps = [makeStep(), makeStep()]
    expect(shouldBeDropped(1, steps, { 0: [new Error("fail")] })).to.be.true
  })

  it("returns false for normal steps when no errors", () => {
    const steps = [makeStep(), makeStep()]
    expect(shouldBeDropped(1, steps, {})).to.be.false
  })
})

describe("getCustomCommands", () => {
  let log: Log
  let tmpDir: Awaited<ReturnType<typeof makeTempDir>>

  before(async () => {
    const garden = await makeTestGardenA()
    log = garden.log
  })

  beforeEach(async () => {
    tmpDir = await makeTempDir()
    await dumpYaml(join(tmpDir.path, "project.garden.yml"), {
      apiVersion: "garden.io/v0",
      kind: "Project",
      name: "test-custom-commands",
      environments: [{ name: "default" }],
    })
  })

  afterEach(async () => {
    await tmpDir.cleanup()
  })

  it("loads commands with template strings in variables without error", async () => {
    await dumpYaml(join(tmpDir.path, "commands.garden.yml"), {
      kind: "Command",
      name: "templated-vars",
      description: { short: "Test" },
      variables: {
        "service-name": "${var.envType == 'production' ? 'frontend' : 'standalone'}",
        "service-port": "${var.envType == 'production' ? '4567' : '4566'}",
      },
      steps: [
        {
          script: "echo ${var.service-name}:${var.service-port}",
        },
      ],
    })

    const commands = await getCustomCommands(log, tmpDir.path)

    expect(commands).to.have.length(1)
    expect(commands[0].name).to.equal("templated-vars")
  })

  it("rejects a command with an invalid name during loading", async () => {
    await dumpYaml(join(tmpDir.path, "commands.garden.yml"), {
      kind: "Command",
      name: "INVALID NAME WITH SPACES",
      description: { short: "Bad name" },
      exec: { command: ["echo", "hi"] },
    })

    await expectError(() => getCustomCommands(log, tmpDir.path), { contains: "INVALID NAME WITH SPACES" })
  })
})
