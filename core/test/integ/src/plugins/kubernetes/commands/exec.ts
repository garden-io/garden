/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { expect } from "chai"
import { ExecCommand } from "../../../../../../src/commands/exec.js"
import type { ConfigGraph } from "../../../../../../src/graph/config-graph.js"
import type { ContainerDeployAction } from "../../../../../../src/plugins/container/config.js"
import { DeployTask } from "../../../../../../src/tasks/deploy.js"
import type { TestGarden } from "../../../../../helpers.js"
import { expectError, withDefaultGlobalOpts } from "../../../../../helpers.js"
import { getContainerTestGarden } from "../container/container.js"
import { CommandError } from "../../../../../../src/exceptions.js"

describe("runExecCommand", () => {
  let garden: TestGarden
  let cleanup: (() => void) | undefined
  let graph: ConfigGraph

  before(async () => {
    ;({ garden, cleanup } = await getContainerTestGarden("local"))
    const action = await resolveDeployAction("simple-service")
    const deployTask = new DeployTask({
      garden,
      graph,
      log: garden.log,
      action,
      force: true,
      forceBuild: false,
    })
    await garden.processTasks({ tasks: [deployTask], throwOnError: true })
  })

  async function resolveDeployAction(name: string) {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false, actionModes: { default: ["deploy." + name] } })
    return garden.resolveAction<ContainerDeployAction>({ action: graph.getDeploy(name), log: garden.log, graph })
  }

  after(async () => {
    if (cleanup) {
      cleanup()
    }
  })

  it("should exec a command in a running service using the -- separator", async () => {
    const execCommand = new ExecCommand()
    const args = { deploy: "simple-service", command: "" }
    args["--"] = ["echo", "ok, lots of text"]

    const { result, errors } = await execCommand.action({
      garden,
      log: garden.log,
      args,
      opts: withDefaultGlobalOpts({
        interactive: false,
        target: "",
      }),
    })

    if (errors) {
      throw errors[0]
    }
    expect(result?.output).to.equal("ok, lots of text")
  })

  it("should exec a command in a running service without the -- separator", async () => {
    const execCommand = new ExecCommand()
    const args = { deploy: "simple-service", command: "echo hello" }

    const { result, errors } = await execCommand.action({
      garden,
      log: garden.log,
      args,
      opts: withDefaultGlobalOpts({
        interactive: false,
        target: "",
      }),
    })

    if (errors) {
      throw errors[0]
    }
    expect(result?.output).to.equal("hello")
  })

  it("should throw if no command was specified", async () => {
    const execCommand = new ExecCommand()
    const args = { deploy: "simple-service", command: "" }
    await expectError(
      () =>
        execCommand.action({
          garden,
          log: garden.log,
          args,
          opts: withDefaultGlobalOpts({
            interactive: false,
            target: "",
          }),
        }),
      (err) =>
        expect(err).to.be.instanceOf(CommandError).with.property("message", "No command specified. Nothing to execute.")
    )
  })
})
