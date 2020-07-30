/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { TestGarden, makeTestGardenA, withDefaultGlobalOpts } from "../../../helpers"
import { deployOpts, deployArgs, DeployCommand } from "../../../../src/commands/deploy"
import { parseCliArgs, StringsParameter } from "../../../../src/commands/base"
import { LogEntry } from "../../../../src/logger/log-entry"
import { DeleteServiceCommand, deleteServiceArgs } from "../../../../src/commands/delete"
import { GetOutputsCommand } from "../../../../src/commands/get/get-outputs"
import { TestCommand, testArgs, testOpts } from "../../../../src/commands/test"
import { RunTaskCommand, runTaskArgs, runTaskOpts } from "../../../../src/commands/run/task"
import { RunTestCommand, runTestArgs, runTestOpts } from "../../../../src/commands/run/test"
import { publishArgs, publishOpts, PublishCommand } from "../../../../src/commands/publish"

describe("parseCliArgs", () => {
  let garden: TestGarden
  let log: LogEntry
  let defaultActionParams: any

  before(async () => {
    garden = await makeTestGardenA()
    log = garden.log
    defaultActionParams = {
      garden,
      log,
      headerLog: log,
      footerLog: log,
    }
  })

  it("correctly falls back to a blank string value for non-boolean options with blank values", () => {
    const { args, opts } = parseCliArgs(
      ["service-a,service-b", "--hot-reload", "--force-build=true"],
      deployArgs,
      deployOpts
    )
    expect(args).to.eql({ services: ["service-a", "service-b"] })
    expect(opts).to.eql({ "force-build": true, "hot-reload": undefined })
  })

  it("correctly handles blank arguments", () => {
    const { args, opts } = parseCliArgs([], deployArgs, deployOpts)
    expect(args).to.eql({ services: undefined })
    expect(opts).to.eql({})
  })

  it("correctly handles option aliases", () => {
    const { args, opts } = parseCliArgs(["-w", "--force-build=false"], deployArgs, deployOpts)
    expect(args).to.eql({ services: undefined })
    expect(opts).to.eql({ "watch": true, "force-build": false })
  })

  // Note: If an option alias appears before the option (e.g. -w before --watch),
  // the option's value takes precedence over the alias' value (e.g. --watch=false
  // takes precedence over -w).
  it("uses value of first option when option is erroneously repeated", () => {
    const { args, opts } = parseCliArgs(["--force-build=false", "--force-build=true"], deployArgs, deployOpts)
    expect(args).to.eql({ services: undefined })
    expect(opts).to.eql({ "force-build": false })
  })

  it("parses args and opts for a DeployCommand", async () => {
    const cmd = new DeployCommand()

    const { args, opts } = parseCliArgs(["service-a,service-b", "--force-build=true"], deployArgs, deployOpts)

    await cmd.action({
      ...defaultActionParams,
      args,
      opts: withDefaultGlobalOpts(opts),
    })

    const { args: args2, opts: opts2 } = parseCliArgs(["service-a", "--hot=service-a"], deployArgs, deployOpts)

    await cmd.action({
      ...defaultActionParams,
      args: args2,
      opts: withDefaultGlobalOpts(opts2),
    })
  })

  it("parses args and opts for a DeleteServiceCommand", async () => {
    const cmd = new DeleteServiceCommand()
    const { args, opts } = parseCliArgs(["service-a"], deleteServiceArgs, {})
    await cmd.action({
      ...defaultActionParams,
      args,
      opts: withDefaultGlobalOpts(opts),
    })
  })

  it("parses args and opts for a GetOutputsCommand", async () => {
    const cmd = new GetOutputsCommand()
    const { args, opts } = parseCliArgs([], {}, {})
    await cmd.action({
      ...defaultActionParams,
      args,
      opts: withDefaultGlobalOpts(opts),
    })
  })

  it("parses args and opts for a TestCommand", async () => {
    const cmd = new TestCommand()
    const { args, opts } = parseCliArgs(["module-a,module-b", "-n unit"], testArgs, testOpts)
    await cmd.action({
      ...defaultActionParams,
      args,
      opts: withDefaultGlobalOpts(opts),
    })
  })

  it("parses args and opts for a RunTaskCommand", async () => {
    const cmd = new RunTaskCommand()
    const { args, opts } = parseCliArgs(["task-b"], runTaskArgs, runTaskOpts)
    await cmd.action({
      ...defaultActionParams,
      args,
      opts: withDefaultGlobalOpts(opts),
    })
  })

  it("parses args and opts for a RunTestCommand", async () => {
    const cmd = new RunTestCommand()
    const { args, opts } = parseCliArgs(["module-b", "unit", "--interactive"], runTestArgs, runTestOpts)
    await cmd.action({
      ...defaultActionParams,
      args,
      opts: withDefaultGlobalOpts(opts),
    })
  })

  it("parses args and opts for a PublishCommand", async () => {
    const cmd = new PublishCommand()
    const { args, opts } = parseCliArgs(["module-a,module-b", "--allow-dirty"], publishArgs, publishOpts)
    await cmd.action({
      ...defaultActionParams,
      args,
      opts: withDefaultGlobalOpts(opts),
    })
  })
})

describe("StringsParameter", () => {
  it("should by default split on a comma", () => {
    const param = new StringsParameter({ help: "" })
    expect(param.parseString("service-a,service-b")).to.eql(["service-a", "service-b"])
  })

  it("should not split on commas within double-quoted strings", () => {
    const param = new StringsParameter({ help: "" })
    expect(param.parseString('key-a="comma,in,value",key-b=foo,key-c=bar')).to.eql([
      'key-a="comma,in,value"',
      "key-b=foo",
      "key-c=bar",
    ])
  })
})
