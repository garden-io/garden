/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { RetriableProcess } from "../../../../src/util/retriable-process"
import { Logger, getLogger } from "../../../../src/logger/logger"
import { sleep } from "../../../../src/util/util"
import { execSync } from "child_process"

// todo: beautify and reduce code duplication?

describe("RetriableProcess", () => {
  Logger.initialize({ level: 4, type: "basic" })
  const log = getLogger().placeholder()

  const doNothingForeverOsCommand = { command: "tail -f /dev/null" }
  const badOsCommand = { command: "bad_os_command_which_does_not_exists_and_must_fail_the_process" }

  function sigKill(pid: number) {
    execSync(`kill -9 ${pid}`)
  }

  function stableProcess(maxRetries: number, minTimeoutMs: number): RetriableProcess {
    return new RetriableProcess({ osCommand: doNothingForeverOsCommand, maxRetries, minTimeoutMs, log })
  }

  function failingProcess(maxRetries: number, minTimeoutMs: number): RetriableProcess {
    return new RetriableProcess({ osCommand: badOsCommand, maxRetries, minTimeoutMs, log })
  }

  function stableProcessTree(maxRetries: number, minTimeoutMs: number): RetriableProcess[] {
    const root = stableProcess(maxRetries, minTimeoutMs)
    const left = stableProcess(maxRetries, minTimeoutMs)
    const right = stableProcess(maxRetries, minTimeoutMs)
    const rightChild1 = stableProcess(maxRetries, minTimeoutMs)
    const rightChild2 = stableProcess(maxRetries, minTimeoutMs)

    root.addDescendantProcesses(left, right)
    right.addDescendantProcesses(rightChild1, rightChild2)

    return [root, left, right, rightChild1, rightChild2]
  }

  async function yieldToRetry(maxRetries: number, minTimeoutMs: number): Promise<void> {
    // wait for while background retrying is finished
    let retryTimeoutMs = (maxRetries + 1) * minTimeoutMs
    log.info(`Sleep for ${retryTimeoutMs}ms while background retry is in progress`)
    await sleep(retryTimeoutMs)
  }

  it("errorless single process starts and stops", () => {
    const p = stableProcess(0, 0)
    p.startAll()
    expect(!!p.getCurrentPid()).to.be.true
    expect(p.getCurrentState()).to.eql("running")

    p.stopAll()
    expect(p.getCurrentState()).to.eql("stopped")
  })

  it("fails to start already running process", () => {
    const p = stableProcess(0, 0)
    p.startAll()

    expect(p.getCurrentState()).to.eql("running")
    expect(!!p.getCurrentPid()).to.be.true
    expect(() => p.startAll()).to.throw("Process is already running")

    p.stopAll()
    expect(p.getCurrentState()).to.eql("stopped")
  })

  it("errorless process tree starts and stops on call from the root node", () => {
    const [root, left, right, rightChild1, rightChild2] = stableProcessTree(0, 0)

    root.startAll()
    expect(root.getCurrentState()).to.eql("running")
    expect(left.getCurrentState()).to.eql("running")
    expect(right.getCurrentState()).to.eql("running")
    expect(rightChild1.getCurrentState()).to.eql("running")
    expect(rightChild2.getCurrentState()).to.eql("running")

    expect(!!root.getCurrentPid()).to.be.true
    expect(!!left.getCurrentPid()).to.be.true
    expect(!!right.getCurrentPid()).to.be.true
    expect(!!right.getCurrentPid()).to.be.true
    expect(!!rightChild1.getCurrentPid()).to.be.true
    expect(!!rightChild2.getCurrentPid()).to.be.true

    root.stopAll()
    expect(root.getCurrentState()).to.eql("stopped")
    expect(left.getCurrentState()).to.eql("stopped")
    expect(right.getCurrentState()).to.eql("stopped")
    expect(rightChild1.getCurrentState()).to.eql("stopped")
    expect(rightChild2.getCurrentState()).to.eql("stopped")
  })

  it("errorless process tree starts and stops on call from a child node", () => {
    const [root, left, right, rightChild1, rightChild2] = stableProcessTree(0, 0)

    rightChild1.startAll()
    expect(root.getCurrentState()).to.eql("running")
    expect(left.getCurrentState()).to.eql("running")
    expect(right.getCurrentState()).to.eql("running")
    expect(rightChild1.getCurrentState()).to.eql("running")
    expect(rightChild2.getCurrentState()).to.eql("running")

    expect(!!root.getCurrentPid()).to.be.true
    expect(!!left.getCurrentPid()).to.be.true
    expect(!!right.getCurrentPid()).to.be.true
    expect(!!right.getCurrentPid()).to.be.true
    expect(!!rightChild1.getCurrentPid()).to.be.true
    expect(!!rightChild2.getCurrentPid()).to.be.true

    left.stopAll()
    expect(root.getCurrentState()).to.eql("stopped")
    expect(left.getCurrentState()).to.eql("stopped")
    expect(right.getCurrentState()).to.eql("stopped")
    expect(rightChild1.getCurrentState()).to.eql("stopped")
    expect(rightChild2.getCurrentState()).to.eql("stopped")
  })

  it("process subtree restarts on its root failure", async () => {
    const maxRetries = 5
    const minTimeoutMs = 200
    const [root, left, right, rightChild1, rightChild2] = stableProcessTree(maxRetries, minTimeoutMs)

    rightChild1.startAll()
    expect(root.getCurrentState()).to.eql("running")
    expect(left.getCurrentState()).to.eql("running")
    expect(right.getCurrentState()).to.eql("running")
    expect(rightChild1.getCurrentState()).to.eql("running")
    expect(rightChild2.getCurrentState()).to.eql("running")

    expect(!!root.getCurrentPid()).to.be.true
    expect(!!left.getCurrentPid()).to.be.true
    expect(!!right.getCurrentPid()).to.be.true
    expect(!!right.getCurrentPid()).to.be.true
    expect(!!rightChild1.getCurrentPid()).to.be.true
    expect(!!rightChild2.getCurrentPid()).to.be.true

    const rootPid = root.getCurrentPid()!
    const leftPid = left.getCurrentPid()!
    const rightPid = right.getCurrentPid()!
    const rightChild1Pid = rightChild1.getCurrentPid()!
    const rightChild2Pid = rightChild2.getCurrentPid()!

    // kill right subtree's root process with external command
    sigKill(rightPid)

    await yieldToRetry(maxRetries, minTimeoutMs)

    // all processes should be running again
    expect(root.getCurrentState()).to.eql("running")
    expect(left.getCurrentState()).to.eql("running")
    expect(right.getCurrentState()).to.eql("running")
    expect(rightChild1.getCurrentState()).to.eql("running")
    expect(rightChild2.getCurrentState()).to.eql("running")

    // restarted processes should have different PIDs
    expect(root.getCurrentPid()).to.eql(rootPid)
    expect(left.getCurrentPid()).to.eql(leftPid)
    expect(right.getCurrentPid()).to.not.eql(rightPid)
    expect(rightChild1.getCurrentPid()).to.not.eql(rightChild1Pid)
    expect(rightChild2.getCurrentPid()).to.not.eql(rightChild2Pid)

    root.stopAll()
    expect(root.getCurrentState()).to.eql("stopped")
    expect(left.getCurrentState()).to.eql("stopped")
    expect(right.getCurrentState()).to.eql("stopped")
    expect(rightChild1.getCurrentState()).to.eql("stopped")
    expect(rightChild2.getCurrentState()).to.eql("stopped")
  })

  it("entire process tree restarts on root process failure", async () => {
    const maxRetries = 5
    const minTimeoutMs = 200
    const [root, left, right, rightChild1, rightChild2] = stableProcessTree(maxRetries, minTimeoutMs)

    rightChild1.startAll()
    expect(root.getCurrentState()).to.eql("running")
    expect(left.getCurrentState()).to.eql("running")
    expect(right.getCurrentState()).to.eql("running")
    expect(rightChild1.getCurrentState()).to.eql("running")
    expect(rightChild2.getCurrentState()).to.eql("running")

    expect(!!root.getCurrentPid()).to.be.true
    expect(!!left.getCurrentPid()).to.be.true
    expect(!!right.getCurrentPid()).to.be.true
    expect(!!right.getCurrentPid()).to.be.true
    expect(!!rightChild1.getCurrentPid()).to.be.true
    expect(!!rightChild2.getCurrentPid()).to.be.true

    const rootPid = root.getCurrentPid()!
    const leftPid = left.getCurrentPid()!
    const rightPid = right.getCurrentPid()!
    const rightChild1Pid = rightChild1.getCurrentPid()!
    const rightChild2Pid = rightChild2.getCurrentPid()!

    // kill tree's root process with external command
    sigKill(rootPid)

    await yieldToRetry(maxRetries, minTimeoutMs)

    // all processes should be running again
    expect(root.getCurrentState()).to.eql("running")
    expect(left.getCurrentState()).to.eql("running")
    expect(right.getCurrentState()).to.eql("running")
    expect(rightChild1.getCurrentState()).to.eql("running")
    expect(rightChild2.getCurrentState()).to.eql("running")

    // restarted processes should have different PIDs
    expect(root.getCurrentPid()).to.not.eql(rootPid)
    expect(left.getCurrentPid()).to.not.eql(leftPid)
    expect(right.getCurrentPid()).to.not.eql(rightPid)
    expect(rightChild1.getCurrentPid()).to.not.eql(rightChild1Pid)
    expect(rightChild2.getCurrentPid()).to.not.eql(rightChild2Pid)

    root.stopAll()
    expect(root.getCurrentState()).to.eql("stopped")
    expect(left.getCurrentState()).to.eql("stopped")
    expect(right.getCurrentState()).to.eql("stopped")
    expect(rightChild1.getCurrentState()).to.eql("stopped")
    expect(rightChild2.getCurrentState()).to.eql("stopped")
  })

  it("entire process tree restarts when all processes are killed (root-to-leaf)", async () => {
    const maxRetries = 5
    const minTimeoutMs = 200
    const [root, left, right, rightChild1, rightChild2] = stableProcessTree(maxRetries, minTimeoutMs)

    rightChild1.startAll()
    expect(root.getCurrentState()).to.eql("running")
    expect(left.getCurrentState()).to.eql("running")
    expect(right.getCurrentState()).to.eql("running")
    expect(rightChild1.getCurrentState()).to.eql("running")
    expect(rightChild2.getCurrentState()).to.eql("running")

    expect(!!root.getCurrentPid()).to.be.true
    expect(!!left.getCurrentPid()).to.be.true
    expect(!!right.getCurrentPid()).to.be.true
    expect(!!right.getCurrentPid()).to.be.true
    expect(!!rightChild1.getCurrentPid()).to.be.true
    expect(!!rightChild2.getCurrentPid()).to.be.true

    const rootPid = root.getCurrentPid()!
    const leftPid = left.getCurrentPid()!
    const rightPid = right.getCurrentPid()!
    const rightChild1Pid = rightChild1.getCurrentPid()!
    const rightChild2Pid = rightChild2.getCurrentPid()!

    // kill all processes in the tree starting from the root
    sigKill(rootPid)
    sigKill(leftPid)
    sigKill(rightPid)
    sigKill(rightChild1Pid)
    sigKill(rightChild2Pid)

    await yieldToRetry(maxRetries, minTimeoutMs)

    // all processes should be running again
    expect(root.getCurrentState()).to.eql("running")
    expect(left.getCurrentState()).to.eql("running")
    expect(right.getCurrentState()).to.eql("running")
    expect(rightChild1.getCurrentState()).to.eql("running")
    expect(rightChild2.getCurrentState()).to.eql("running")

    // restarted processes should have different PIDs
    expect(root.getCurrentPid()).to.not.eql(rootPid)
    expect(left.getCurrentPid()).to.not.eql(leftPid)
    expect(right.getCurrentPid()).to.not.eql(rightPid)
    expect(rightChild1.getCurrentPid()).to.not.eql(rightChild1Pid)
    expect(rightChild2.getCurrentPid()).to.not.eql(rightChild2Pid)

    root.stopAll()
    expect(root.getCurrentState()).to.eql("stopped")
    expect(left.getCurrentState()).to.eql("stopped")
    expect(right.getCurrentState()).to.eql("stopped")
    expect(rightChild1.getCurrentState()).to.eql("stopped")
    expect(rightChild2.getCurrentState()).to.eql("stopped")
  })

  it("entire process tree restarts when all processes are killed (leaf-to-root)", async () => {
    const maxRetries = 5
    const minTimeoutMs = 200
    const [root, left, right, rightChild1, rightChild2] = stableProcessTree(maxRetries, minTimeoutMs)

    rightChild1.startAll()
    expect(root.getCurrentState()).to.eql("running")
    expect(left.getCurrentState()).to.eql("running")
    expect(right.getCurrentState()).to.eql("running")
    expect(rightChild1.getCurrentState()).to.eql("running")
    expect(rightChild2.getCurrentState()).to.eql("running")

    expect(!!root.getCurrentPid()).to.be.true
    expect(!!left.getCurrentPid()).to.be.true
    expect(!!right.getCurrentPid()).to.be.true
    expect(!!right.getCurrentPid()).to.be.true
    expect(!!rightChild1.getCurrentPid()).to.be.true
    expect(!!rightChild2.getCurrentPid()).to.be.true

    const rootPid = root.getCurrentPid()!
    const leftPid = left.getCurrentPid()!
    const rightPid = right.getCurrentPid()!
    const rightChild1Pid = rightChild1.getCurrentPid()!
    const rightChild2Pid = rightChild2.getCurrentPid()!

    // kill all processes in the tree starting from the root
    sigKill(rightChild2Pid)
    sigKill(rightChild1Pid)
    sigKill(rightPid)
    sigKill(leftPid)
    sigKill(rootPid)

    await yieldToRetry(maxRetries, minTimeoutMs)

    // all processes should be running again
    expect(root.getCurrentState()).to.eql("running")
    expect(left.getCurrentState()).to.eql("running")
    expect(right.getCurrentState()).to.eql("running")
    expect(rightChild1.getCurrentState()).to.eql("running")
    expect(rightChild2.getCurrentState()).to.eql("running")

    // restarted processes should have different PIDs
    expect(root.getCurrentPid()).to.not.eql(rootPid)
    expect(left.getCurrentPid()).to.not.eql(leftPid)
    expect(right.getCurrentPid()).to.not.eql(rightPid)
    expect(rightChild1.getCurrentPid()).to.not.eql(rightChild1Pid)
    expect(rightChild2.getCurrentPid()).to.not.eql(rightChild2Pid)

    root.stopAll()
    expect(root.getCurrentState()).to.eql("stopped")
    expect(left.getCurrentState()).to.eql("stopped")
    expect(right.getCurrentState()).to.eql("stopped")
    expect(rightChild1.getCurrentState()).to.eql("stopped")
    expect(rightChild2.getCurrentState()).to.eql("stopped")
  })

  it("entire tree should fail on the root process failure", async () => {
    const maxRetries = 5
    const minTimeoutMs = 1000
    const root = failingProcess(maxRetries, minTimeoutMs)
    const left = stableProcess(maxRetries, minTimeoutMs)
    const right = stableProcess(maxRetries, minTimeoutMs)
    root.addDescendantProcesses(left, right)

    root.startAll()

    await yieldToRetry(maxRetries, minTimeoutMs)

    expect(root.getCurrentState()).to.eql("failed")
    expect(left.getCurrentState()).to.eql("stopped")
    expect(right.getCurrentState()).to.eql("stopped")
  })
})
