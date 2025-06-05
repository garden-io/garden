/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { BooleanParameter, IntegerParameter, StringParameter } from "../../../../src/cli/params.js"
import { CustomCommandWrapper } from "../../../../src/commands/custom.js"
import type { Log } from "../../../../src/logger/log-entry.js"
import type { TestGarden } from "../../../../src/util/testing.js"
import { expectError } from "../../../../src/util/testing.js"
import { makeTestGardenA, withDefaultGlobalOpts } from "../../../helpers.js"
import { GardenApiVersion } from "../../../../src/constants.js"
import { TestGardenCli } from "../../../helpers/cli.js"
import { parseTemplateCollection } from "../../../../src/template/templated-collections.js"
import type { CommandResource } from "../../../../src/config/command.js"

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
    expect(result?.gardenCommand?.result.exec.command).to.eql(["sh", "-c", "echo foo bar"])
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
})
