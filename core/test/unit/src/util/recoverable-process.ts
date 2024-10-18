/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { RecoverableProcessState } from "../../../../src/util/recoverable-process.js"
import { RecoverableProcess, validateRetryConfig } from "../../../../src/util/recoverable-process.js"
import { getRootLogger } from "../../../../src/logger/logger.js"
import { sleep } from "../../../../src/util/util.js"
import type { TestGarden } from "../../../helpers.js"
import { initTestLogger, makeTempGarden } from "../../../helpers.js"
import { PluginEventBroker } from "../../../../src/plugin-context.js"
import { isCiEnv } from "../../../../src/util/testing.js"

describe("validateRetryConfig", () => {
  it("must fail on negative minTimeoutMs", () => {
    expect(() =>
      validateRetryConfig({
        minTimeoutMs: -1,
        maxRetries: 10,
      })
    ).to.throw("Value minTimeoutMs cannot be negative: -1")
  })

  it("must pass on zero minTimeoutMs", () => {
    expect(() =>
      validateRetryConfig({
        minTimeoutMs: 0,
        maxRetries: 10,
      })
    ).to.not.throw
  })

  it("must pass on positive minTimeoutMs", () => {
    expect(() =>
      validateRetryConfig({
        minTimeoutMs: 0,
        maxRetries: 10,
      })
    ).to.not.throw
  })

  it("must fail on negative maxRetries", () => {
    expect(() =>
      validateRetryConfig({
        minTimeoutMs: 1000,
        maxRetries: -1,
      })
    ).to.throw("Value maxRetries cannot be negative: -1")
  })

  it("must pass on zero maxRetries", () => {
    expect(() =>
      validateRetryConfig({
        minTimeoutMs: 1000,
        maxRetries: 0,
      })
    ).to.not.throw
  })

  it("must pass on positive maxRetries", () => {
    expect(() =>
      validateRetryConfig({
        minTimeoutMs: 1000,
        maxRetries: 10,
      })
    ).to.not.throw
  })
})

// FIXME: some tests are skipped because child-processes are not getting killed in CircleCI pipeline for some reason.
describe("RecoverableProcess", async () => {
  initTestLogger()
  const log = getRootLogger().createLog()

  const doNothingForeverOsCommand = { command: "tail -f /dev/null" }
  const badOsCommand = { command: "bad_os_command_which_does_not_exists_and_must_fail_the_process" }

  const longTimeMs = 10000000
  const longSleepOsCommand = { command: `sleep ${longTimeMs}` }

  let garden: TestGarden
  let events: PluginEventBroker

  before(async () => {
    garden = (await makeTempGarden()).garden
    events = new PluginEventBroker(garden)
  })

  function killNode(node: RecoverableProcess) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const untypedNode: any = <any>node
    untypedNode.proc?.kill()
  }

  function infiniteProcess(maxRetries: number, minTimeoutMs: number): RecoverableProcess {
    return new RecoverableProcess({
      events,
      osCommand: doNothingForeverOsCommand,
      retryConfig: {
        maxRetries,
        minTimeoutMs,
      },
      log,
    })
  }

  function failingProcess(maxRetries: number, minTimeoutMs: number): RecoverableProcess {
    return new RecoverableProcess({
      events,
      osCommand: badOsCommand,
      retryConfig: {
        maxRetries,
        minTimeoutMs,
      },
      log,
    })
  }

  function longSleepingProcess(maxRetries: number, minTimeoutMs: number): RecoverableProcess {
    return new RecoverableProcess({
      events,
      osCommand: longSleepOsCommand,
      retryConfig: {
        maxRetries,
        minTimeoutMs,
      },
      log,
    })
  }

  function infiniteProcessTree(maxRetries: number, minTimeoutMs: number): RecoverableProcess[] {
    const root = infiniteProcess(maxRetries, minTimeoutMs)
    const left = infiniteProcess(maxRetries, minTimeoutMs)
    const right = infiniteProcess(maxRetries, minTimeoutMs)
    const rightChild1 = infiniteProcess(maxRetries, minTimeoutMs)
    const rightChild2 = infiniteProcess(maxRetries, minTimeoutMs)

    root.addDescendants(left, right)
    right.addDescendants(rightChild1, rightChild2)

    return [root, left, right, rightChild1, rightChild2]
  }

  function longSleepingProcessTree(maxRetries: number, minTimeoutMs: number): RecoverableProcess[] {
    const root = longSleepingProcess(maxRetries, minTimeoutMs)
    const left = longSleepingProcess(maxRetries, minTimeoutMs)
    const right = longSleepingProcess(maxRetries, minTimeoutMs)
    const rightChild1 = longSleepingProcess(maxRetries, minTimeoutMs)
    const rightChild2 = longSleepingProcess(maxRetries, minTimeoutMs)

    root.addDescendants(left, right)
    right.addDescendants(rightChild1, rightChild2)

    return [root, left, right, rightChild1, rightChild2]
  }

  async function yieldToRetry(maxRetries: number, minTimeoutMs: number): Promise<void> {
    // wait for while background retrying is finished
    const retryTimeoutMs = maxRetries * minTimeoutMs
    log.info(`Sleep for ${retryTimeoutMs}ms while background retry is in progress`)
    await sleep(retryTimeoutMs)
  }

  function expectRunnable(node: RecoverableProcess) {
    expect(node.getCurrentState()).to.eql("runnable")
    expect(node.getCurrentPid()).to.be.undefined
    expect(node.getLastKnownPid()).to.be.undefined
  }

  function expectRunning(node: RecoverableProcess) {
    expect(node.getCurrentState()).to.eql("running")
    expect(node.getCurrentPid()).to.be.not.undefined
    expect(node.getLastKnownPid()).to.be.not.undefined
    expect(node.getCurrentPid()).to.be.eql(node.getLastKnownPid())
  }

  function expectStopped(node: RecoverableProcess) {
    expect(node.getCurrentState()).to.eql("stopped")
    if (!isCiEnv()) {
      expect(node.getCurrentPid()).to.be.undefined
    }
    expect(node.getLastKnownPid()).to.be.not.undefined
  }

  function expectFailed(node: RecoverableProcess) {
    expect(node.getCurrentState()).to.eql("failed")
    expect(node.getCurrentPid()).to.be.undefined
    expect(node.getLastKnownPid()).to.be.not.undefined
    expect(node.hasFailures()).to.be.true
  }

  it("new instance has state 'runnable'", () => {
    const p = new RecoverableProcess({
      events,
      osCommand: { command: "pwd" },
      retryConfig: { maxRetries: 1, minTimeoutMs: 1000 },
      log,
    })
    expectRunnable(p)
  })

  context("addDescendantProcesses", async () => {
    const maxRetries = 0
    const minTimeoutMs = 0

    let parent: RecoverableProcess
    let child: RecoverableProcess

    beforeEach(() => {
      parent = longSleepingProcess(maxRetries, minTimeoutMs)
      child = longSleepingProcess(maxRetries, minTimeoutMs)
    })

    function expectDescendantRejection(parentProc: RecoverableProcess, childProc: RecoverableProcess) {
      expect(() => parentProc.addDescendants(childProc)).to.throw(
        "Cannot attach a descendant to already running, stopped or failed process."
      )
      expectRunnable(childProc)
    }

    function setState(process: RecoverableProcess, state: RecoverableProcessState) {
      process["state"] = state
    }

    it('child processes can be added to a "runnable" parent', () => {
      expect(() => parent.addDescendants(child)).to.not.throw()

      expectRunnable(parent)
      expectRunnable(child)
    })

    it('child processes can not be added to a "running" parent', async () => {
      setState(parent, "running")
      expectDescendantRejection(parent, child)
    })

    it('child processes can not be added to a "retrying" parent', async () => {
      setState(parent, "retrying")
      expectDescendantRejection(parent, child)
    })

    it('child processes can not be added to a "stopped" parent', async () => {
      setState(parent, "stopped")
      expectDescendantRejection(parent, child)
    })

    it('child processes can not be added to a "failed" parent', async () => {
      setState(parent, "failed")
      expectDescendantRejection(parent, child)
    })
  })

  it("startAll call is idempotent on success", () => {
    const p = infiniteProcess(0, 0)

    const running = p.startAll()
    expectRunning(p)

    const runningAgain = p.startAll()
    expectRunning(p)
    expect(running).to.equal(runningAgain!)

    p.stopAll()
    expectStopped(p)
  })

  it("stopAll call is idempotent", () => {
    const p = infiniteProcess(0, 0)

    p.startAll()
    expectRunning(p)

    p.stopAll()
    expectStopped(p)

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

  it("process subtree restarts on its root failure", async function () {
    if (isCiEnv()) {
      // eslint-disable-next-line no-invalid-this
      this.skip()
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

  it("entire process tree restarts on root process failure", async function () {
    if (isCiEnv()) {
      // eslint-disable-next-line no-invalid-this
      this.skip()
    }

    const maxRetries = 5
    const minTimeoutMs = 500

    const root = longSleepingProcess(maxRetries, minTimeoutMs)
    const left = infiniteProcess(maxRetries, minTimeoutMs)
    const right = infiniteProcess(maxRetries, minTimeoutMs)
    const rightChild1 = infiniteProcess(maxRetries, minTimeoutMs)
    const rightChild2 = infiniteProcess(maxRetries, minTimeoutMs)
    root.addDescendants(left, right)
    right.addDescendants(rightChild1, rightChild2)

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

  it("entire process tree restarts when all processes are killed (root-to-leaf)", async function () {
    if (isCiEnv()) {
      // eslint-disable-next-line no-invalid-this
      this.skip()
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

  it("entire process tree restarts when all processes are killed (leaf-to-root)", async function () {
    if (isCiEnv()) {
      // eslint-disable-next-line no-invalid-this
      this.skip()
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
    root.addDescendants(left, right)

    root.startAll()

    await yieldToRetry(maxRetries, minTimeoutMs * 2)

    expectFailed(root)
    expectStopped(left)
    expectStopped(right)

    expect(() => root.startAll()).to.throw("Cannot start the process tree. Some processes failed with no retries left.")
  })

  it("entire tree should fail on a node process failure", async () => {
    const maxRetries = 3
    const minTimeoutMs = 500
    const root = longSleepingProcess(maxRetries, minTimeoutMs)
    const left = longSleepingProcess(maxRetries, minTimeoutMs)
    const right = failingProcess(maxRetries, minTimeoutMs)
    const rightChild = longSleepingProcess(maxRetries, minTimeoutMs)
    root.addDescendants(left, right)
    right.addDescendants(rightChild)

    root.startAll()

    await yieldToRetry(maxRetries, minTimeoutMs * 2)

    expectStopped(root)
    expectStopped(left)
    expectFailed(right)
    expectStopped(rightChild)

    expect(() => root.startAll()).to.throw("Cannot start the process tree. Some processes failed with no retries left.")
  })

  it("entire tree should fail on a leaf process failure", async () => {
    const maxRetries = 3
    const minTimeoutMs = 500
    const root = longSleepingProcess(maxRetries, minTimeoutMs)
    const left = longSleepingProcess(maxRetries, minTimeoutMs)
    const right = longSleepingProcess(maxRetries, minTimeoutMs)
    const rightChild = failingProcess(maxRetries, minTimeoutMs)
    root.addDescendants(left, right)
    right.addDescendants(rightChild)

    root.startAll()

    await yieldToRetry(maxRetries, minTimeoutMs * 2)

    expectStopped(root)
    expectStopped(left)
    expectStopped(right)
    expectFailed(rightChild)

    expect(() => root.startAll()).to.throw("Cannot start the process tree. Some processes failed with no retries left.")
  })

  it("stopped process cannot be started", async () => {
    const maxRetries = 0
    const minTimeoutMs = 500
    const root = infiniteProcess(maxRetries, minTimeoutMs)

    root.startAll()
    root.stopAll()

    expect(() => root.startAll()).to.throw("Cannot start already stopped process.")
  })

  it("failed process cannot be started", async () => {
    const maxRetries = 0
    const minTimeoutMs = 500
    const root = infiniteProcess(maxRetries, minTimeoutMs)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsafeRoot = <any>root
    unsafeRoot.fail()

    expect(() => unsafeRoot.startNode()).to.throw("Cannot start failed process with no retries left.")
  })
})
