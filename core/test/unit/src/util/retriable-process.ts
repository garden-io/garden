/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import env from "env-var"
import { expect } from "chai"
import { RetriableProcess } from "../../../../src/util/retriable-process"
import { getLogger } from "../../../../src/logger/logger"
import { sleep } from "../../../../src/util/util"
import { initTestLogger } from "../../../helpers"

describe("RetriableProcess", async () => {
  initTestLogger()
  const log = getLogger().placeholder()

  const doNothingForeverOsCommand = { command: "tail -f /dev/null" }
  const badOsCommand = { command: "bad_os_command_which_does_not_exists_and_must_fail_the_process" }

  const longTimeMs = 10000000
  const longSleepOsCommand = { command: `sleep ${longTimeMs}` }

  /**
   * FIXME: some tests are skipped because child-processes are not getting killed in CircleCI pipeline for some reason.
   * This function is used to skip some tests and modify some expectations in CircleCI pipeline.
   */
  function isCiEnv() {
    const ciEnv = env.get("CI").required(false).asBool()
    const circleCiEnv = env.get("CIRCLECI").required(false).asBool()
    return ciEnv || circleCiEnv
  }

  function killNode(node: RetriableProcess) {
    const untypedNode: any = <any>node
    untypedNode.proc?.kill()
  }

  function infiniteProcess(maxRetries: number, minTimeoutMs: number): RetriableProcess {
    return new RetriableProcess({
      osCommand: doNothingForeverOsCommand,
      retryConfig: {
        maxRetries,
        minTimeoutMs,
      },
      log,
    })
  }

  function failingProcess(maxRetries: number, minTimeoutMs: number): RetriableProcess {
    return new RetriableProcess({
      osCommand: badOsCommand,
      retryConfig: {
        maxRetries,
        minTimeoutMs,
      },
      log,
    })
  }

  function longSleepingProcess(maxRetries: number, minTimeoutMs: number): RetriableProcess {
    return new RetriableProcess({
      osCommand: longSleepOsCommand,
      retryConfig: {
        maxRetries,
        minTimeoutMs,
      },
      log,
    })
  }

  function infiniteProcessTree(maxRetries: number, minTimeoutMs: number): RetriableProcess[] {
    const root = infiniteProcess(maxRetries, minTimeoutMs)
    const left = infiniteProcess(maxRetries, minTimeoutMs)
    const right = infiniteProcess(maxRetries, minTimeoutMs)
    const rightChild1 = infiniteProcess(maxRetries, minTimeoutMs)
    const rightChild2 = infiniteProcess(maxRetries, minTimeoutMs)

    root.addDescendantProcesses(left, right)
    right.addDescendantProcesses(rightChild1, rightChild2)

    return [root, left, right, rightChild1, rightChild2]
  }

  function longSleepingProcessTree(maxRetries: number, minTimeoutMs: number): RetriableProcess[] {
    const root = longSleepingProcess(maxRetries, minTimeoutMs)
    const left = longSleepingProcess(maxRetries, minTimeoutMs)
    const right = longSleepingProcess(maxRetries, minTimeoutMs)
    const rightChild1 = longSleepingProcess(maxRetries, minTimeoutMs)
    const rightChild2 = longSleepingProcess(maxRetries, minTimeoutMs)

    root.addDescendantProcesses(left, right)
    right.addDescendantProcesses(rightChild1, rightChild2)

    return [root, left, right, rightChild1, rightChild2]
  }

  async function yieldToRetry(maxRetries: number, minTimeoutMs: number): Promise<void> {
    // wait for while background retrying is finished
    let retryTimeoutMs = maxRetries * minTimeoutMs
    log.info(`Sleep for ${retryTimeoutMs}ms while background retry is in progress`)
    await sleep(retryTimeoutMs)
  }

  function expectRunnable(node: RetriableProcess) {
    expect(node.getCurrentState()).to.eql("runnable")
    expect(node.getCurrentPid()).to.be.undefined
    expect(node.getLastKnownPid()).to.be.undefined
  }

  function expectRunning(node: RetriableProcess) {
    expect(node.getCurrentState()).to.eql("running")
    expect(node.getCurrentPid()).to.be.not.undefined
    expect(node.getLastKnownPid()).to.be.not.undefined
    expect(node.getCurrentPid()).to.be.eql(node.getLastKnownPid())
  }

  function expectStopped(node: RetriableProcess) {
    expect(node.getCurrentState()).to.eql("stopped")
    if (!isCiEnv()) {
      expect(node.getCurrentPid()).to.be.undefined
    }
    expect(node.getLastKnownPid()).to.be.not.undefined
  }

  function expectFailed(node: RetriableProcess) {
    expect(node.getCurrentState()).to.eql("failed")
    expect(node.getCurrentPid()).to.be.undefined
    expect(node.getLastKnownPid()).to.be.not.undefined
    expect(node.hasFailures()).to.be.true
  }

  it("new instance has state 'runnable'", () => {
    const p = new RetriableProcess({
      osCommand: { command: "pwd" },
      retryConfig: { maxRetries: 1, minTimeoutMs: 1000 },
      log,
    })
    expectRunnable(p)
  })

  it("fails to start already running process", () => {
    const p = infiniteProcess(0, 0)
    p.startAll()

    expectRunning(p)
    expect(() => p.startAll()).to.throw("Process is already running.")

    p.stopAll()
    expectStopped(p)
  })

  it("errorless process tree starts and stops on call from the root node", () => {
    const [root, left, right, rightChild1, rightChild2] = infiniteProcessTree(0, 0)

    root.startAll()
    expectRunning(root)
    expectRunning(left)
    expectRunning(right)
    expectRunning(rightChild1)
    expectRunning(rightChild2)

    root.stopAll()
    expectStopped(root)
    expectStopped(left)
    expectStopped(right)
    expectStopped(rightChild1)
    expectStopped(rightChild2)
  })

  it("errorless process tree starts and stops on call from a leaf node", () => {
    const [root, left, right, rightChild1, rightChild2] = infiniteProcessTree(0, 0)

    rightChild1.startAll()
    expectRunning(root)
    expectRunning(left)
    expectRunning(right)
    expectRunning(rightChild1)
    expectRunning(rightChild2)

    left.stopAll()
    expectStopped(root)
    expectStopped(left)
    expectStopped(right)
    expectStopped(rightChild1)
    expectStopped(rightChild2)
  })

  it("process subtree restarts on its root failure", async () => {
    if (isCiEnv()) {
      return
    }

    const maxRetries = 5
    const minTimeoutMs = 500
    const [root, left, right, rightChild1, rightChild2] = longSleepingProcessTree(maxRetries, minTimeoutMs)

    root.startAll()
    expectRunning(root)
    expectRunning(left)
    expectRunning(right)
    expectRunning(rightChild1)
    expectRunning(rightChild2)

    const rootPid = root.getCurrentPid()!
    const leftPid = left.getCurrentPid()!
    const rightPid = right.getCurrentPid()!
    const rightChild1Pid = rightChild1.getCurrentPid()!
    const rightChild2Pid = rightChild2.getCurrentPid()!

    // kill right subtree's root process with external command
    killNode(right)

    await yieldToRetry(maxRetries, minTimeoutMs * 2)

    // all processes should be running again
    expectRunning(root)
    expectRunning(left)
    expectRunning(right)
    expectRunning(rightChild1)
    expectRunning(rightChild2)

    // restarted processes should have different PIDs
    expect(root.getCurrentPid()).to.eql(rootPid)
    expect(left.getCurrentPid()).to.eql(leftPid)
    expect(right.getCurrentPid()).to.not.eql(rightPid)
    expect(rightChild1.getCurrentPid()).to.not.eql(rightChild1Pid)
    expect(rightChild2.getCurrentPid()).to.not.eql(rightChild2Pid)

    root.stopAll()
    expectStopped(root)
    expectStopped(left)
    expectStopped(right)
    expectStopped(rightChild1)
    expectStopped(rightChild2)
  })

  it("entire process tree restarts on root process failure", async () => {
    if (isCiEnv()) {
      return
    }

    const maxRetries = 5
    const minTimeoutMs = 500

    const root = longSleepingProcess(maxRetries, minTimeoutMs)
    const left = infiniteProcess(maxRetries, minTimeoutMs)
    const right = infiniteProcess(maxRetries, minTimeoutMs)
    const rightChild1 = infiniteProcess(maxRetries, minTimeoutMs)
    const rightChild2 = infiniteProcess(maxRetries, minTimeoutMs)
    root.addDescendantProcesses(left, right)
    right.addDescendantProcesses(rightChild1, rightChild2)

    root.startAll()
    expectRunning(root)
    expectRunning(left)
    expectRunning(right)
    expectRunning(rightChild1)
    expectRunning(rightChild2)

    const rootPid = root.getCurrentPid()!
    const leftPid = left.getCurrentPid()!
    const rightPid = right.getCurrentPid()!
    const rightChild1Pid = rightChild1.getCurrentPid()!
    const rightChild2Pid = rightChild2.getCurrentPid()!

    // kill tree's root process with external command
    killNode(root)

    await yieldToRetry(maxRetries, minTimeoutMs * 2)

    // all processes should be running again
    expectRunning(root)
    expectRunning(left)
    expectRunning(right)
    expectRunning(rightChild1)
    expectRunning(rightChild2)

    // restarted processes should have different PIDs
    expect(root.getCurrentPid()).to.not.eql(rootPid)
    expect(left.getCurrentPid()).to.not.eql(leftPid)
    expect(right.getCurrentPid()).to.not.eql(rightPid)
    expect(rightChild1.getCurrentPid()).to.not.eql(rightChild1Pid)
    expect(rightChild2.getCurrentPid()).to.not.eql(rightChild2Pid)

    root.stopAll()
    expectStopped(root)
    expectStopped(left)
    expectStopped(right)
    expectStopped(rightChild1)
    expectStopped(rightChild2)
  })

  it("entire process tree restarts when all processes are killed (root-to-leaf)", async () => {
    if (isCiEnv()) {
      return
    }

    const maxRetries = 5
    const minTimeoutMs = 500
    const [root, left, right, rightChild1, rightChild2] = longSleepingProcessTree(maxRetries, minTimeoutMs)

    root.startAll()
    expectRunning(root)
    expectRunning(left)
    expectRunning(right)
    expectRunning(rightChild1)
    expectRunning(rightChild2)

    const rootPid = root.getCurrentPid()!
    const leftPid = left.getCurrentPid()!
    const rightPid = right.getCurrentPid()!
    const rightChild1Pid = rightChild1.getCurrentPid()!
    const rightChild2Pid = rightChild2.getCurrentPid()!

    // kill all processes in the tree starting from the root
    killNode(root)
    killNode(left)
    killNode(right)
    killNode(rightChild1)
    killNode(rightChild2)

    await yieldToRetry(maxRetries, minTimeoutMs * 2)

    // all processes should be running again
    expectRunning(root)
    expectRunning(left)
    expectRunning(right)
    expectRunning(rightChild1)
    expectRunning(rightChild2)

    // restarted processes should have different PIDs
    expect(root.getCurrentPid()).to.not.eql(rootPid)
    expect(left.getCurrentPid()).to.not.eql(leftPid)
    expect(right.getCurrentPid()).to.not.eql(rightPid)
    expect(rightChild1.getCurrentPid()).to.not.eql(rightChild1Pid)
    expect(rightChild2.getCurrentPid()).to.not.eql(rightChild2Pid)

    root.stopAll()
    expectStopped(root)
    expectStopped(left)
    expectStopped(right)
    expectStopped(rightChild1)
    expectStopped(rightChild2)
  })

  it("entire process tree restarts when all processes are killed (leaf-to-root)", async () => {
    if (isCiEnv()) {
      return
    }

    const maxRetries = 5
    const minTimeoutMs = 500
    const [root, left, right, rightChild1, rightChild2] = longSleepingProcessTree(maxRetries, minTimeoutMs)

    root.startAll()
    expectRunning(root)
    expectRunning(left)
    expectRunning(right)
    expectRunning(rightChild1)
    expectRunning(rightChild2)

    const rootPid = root.getCurrentPid()!
    const leftPid = left.getCurrentPid()!
    const rightPid = right.getCurrentPid()!
    const rightChild1Pid = rightChild1.getCurrentPid()!
    const rightChild2Pid = rightChild2.getCurrentPid()!

    // kill all processes in the tree starting from the root
    killNode(rightChild2)
    killNode(rightChild1)
    killNode(right)
    killNode(left)
    killNode(root)

    await yieldToRetry(maxRetries, minTimeoutMs * 2)

    // all processes should be running again
    expectRunning(root)
    expectRunning(left)
    expectRunning(right)
    expectRunning(rightChild1)
    expectRunning(rightChild2)

    // restarted processes should have different PIDs
    expect(root.getCurrentPid()).to.not.eql(rootPid)
    expect(left.getCurrentPid()).to.not.eql(leftPid)
    expect(right.getCurrentPid()).to.not.eql(rightPid)
    expect(rightChild1.getCurrentPid()).to.not.eql(rightChild1Pid)
    expect(rightChild2.getCurrentPid()).to.not.eql(rightChild2Pid)

    root.stopAll()
    expectStopped(root)
    expectStopped(left)
    expectStopped(right)
    expectStopped(rightChild1)
    expectStopped(rightChild2)
  })

  it("entire tree should fail on the root process failure", async () => {
    const maxRetries = 3
    const minTimeoutMs = 500
    const root = failingProcess(maxRetries, minTimeoutMs)
    const left = longSleepingProcess(maxRetries, minTimeoutMs)
    const right = longSleepingProcess(maxRetries, minTimeoutMs)
    root.addDescendantProcesses(left, right)

    root.startAll()

    await yieldToRetry(maxRetries, minTimeoutMs * 2)

    expectFailed(root)
    expectStopped(left)
    expectStopped(right)

    expect(() => root.startAll()).to.throw("Cannot start failed process with no retries left.")
  })

  it("entire tree should fail on a node process failure", async () => {
    const maxRetries = 3
    const minTimeoutMs = 500
    const root = longSleepingProcess(maxRetries, minTimeoutMs)
    const left = longSleepingProcess(maxRetries, minTimeoutMs)
    const right = failingProcess(maxRetries, minTimeoutMs)
    const rightChild = longSleepingProcess(maxRetries, minTimeoutMs)
    root.addDescendantProcesses(left, right)
    right.addDescendantProcess(rightChild)

    root.startAll()

    await yieldToRetry(maxRetries, minTimeoutMs * 2)

    expectStopped(root)
    expectStopped(left)
    expectFailed(right)
    expectStopped(rightChild)

    expect(() => root.startAll()).to.throw("Cannot start failed process with no retries left.")
  })

  it("entire tree should fail on a leaf process failure", async () => {
    const maxRetries = 3
    const minTimeoutMs = 500
    const root = longSleepingProcess(maxRetries, minTimeoutMs)
    const left = longSleepingProcess(maxRetries, minTimeoutMs)
    const right = longSleepingProcess(maxRetries, minTimeoutMs)
    const rightChild = failingProcess(maxRetries, minTimeoutMs)
    root.addDescendantProcesses(left, right)
    right.addDescendantProcess(rightChild)

    root.startAll()

    await yieldToRetry(maxRetries, minTimeoutMs * 2)

    expectStopped(root)
    expectStopped(left)
    expectStopped(right)
    expectFailed(rightChild)

    expect(() => root.startAll()).to.throw("Cannot start failed process with no retries left.")
  })
})
