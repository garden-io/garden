/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import tmp from "tmp-promise"
import { expect } from "chai"
import { join, resolve } from "path"
import moment from "moment"
import { Garden } from "../../../../../src/garden"
import { gardenPlugin } from "../../../../../src/plugins/exec/exec"
import { LogEntry } from "../../../../../src/logger/log-entry"
import { dataDir, makeTestGarden } from "../../../../helpers"
import { appendFile, ensureFile, remove, writeFile } from "fs-extra"
import { randomString } from "../../../../../src/util/string"
import { ExecLogsFollower } from "../../../../../src/plugins/exec/logs"
import Stream from "ts-stream"
import { ServiceLogEntry } from "../../../../../src/types/plugin/service/getServiceLogs"
import { sleep } from "../../../../../src/util/util"

const range = (length: number) => [...Array(length).keys()]
const defaultSleep = 1000

function getStream(): [Stream<ServiceLogEntry>, any[]] {
  const logBuffer: any[] = []
  const stream = new Stream<ServiceLogEntry>()

  void stream.forEach((entry) => {
    logBuffer.push(entry)
  })

  return [stream, logBuffer]
}

async function writeLogFile(path: string, entries: ServiceLogEntry[], append: boolean = false) {
  const data = entries.map((e) => JSON.stringify(e)).join("\n") + "\n" // File ends on a new line
  if (append) {
    return appendFile(path, data)
  } else {
    return writeFile(path, data)
  }
}

describe("ExecLogsFollower", () => {
  let tmpDir: tmp.DirectoryResult
  const projectRoot = resolve(dataDir, "test-project-exec")

  let garden: Garden
  let log: LogEntry

  before(async () => {
    garden = await makeTestGarden(projectRoot, { plugins: [gardenPlugin()] })
    log = garden.log
    tmpDir = await tmp.dir({ unsafeCleanup: true })
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  describe("streamLogs", () => {
    it("should stream logs from file", async () => {
      const logFilePath = join(tmpDir.path, `log-${randomString(8)}.jsonl`)
      const [stream, logs] = getStream()

      const execLogsFollower = new ExecLogsFollower({
        stream,
        serviceName: "foo",
        log,
        logFilePath,
      })

      const entries: ServiceLogEntry[] = range(100).map((el) => ({
        msg: String(el),
        timestamp: new Date(),
        serviceName: "foo",
      }))

      await writeLogFile(logFilePath, entries)

      await execLogsFollower.streamLogs({ follow: false })

      expect(logs).to.eql(entries)
    })

    it("should optionally stream last N entries", async () => {
      const logFilePath = join(tmpDir.path, `log-${randomString(8)}.jsonl`)
      const [stream, logs] = getStream()

      const execLogsFollower = new ExecLogsFollower({
        stream,
        serviceName: "foo",
        log,
        logFilePath,
      })

      const entries: ServiceLogEntry[] = range(100).map((el) => ({
        msg: String(el),
        timestamp: new Date(),
        serviceName: "foo",
      }))

      await writeLogFile(logFilePath, entries)

      await execLogsFollower.streamLogs({ tail: 50, follow: false })

      expect(logs).to.eql(entries.slice(50))
    })
    it("should optionally stream entries from a given duration", async () => {
      const logFilePath = join(tmpDir.path, `log-${randomString(8)}.jsonl`)
      const [stream, logs] = getStream()

      const execLogsFollower = new ExecLogsFollower({
        stream,
        serviceName: "foo",
        log,
        logFilePath,
      })

      const entries: ServiceLogEntry[] = [
        {
          msg: "Hello 1",
          timestamp: moment().subtract(2, "h").toDate(),
          serviceName: "foo",
        },
        {
          msg: "Hello 2",
          timestamp: moment().subtract(2, "h").toDate(),
          serviceName: "foo",
        },
        {
          msg: "Hello 3",
          timestamp: moment().subtract(1, "h").toDate(),
          serviceName: "foo",
        },
        {
          msg: "Hello 4",
          timestamp: moment().subtract(1, "h").toDate(),
          serviceName: "foo",
        },
      ]

      await writeLogFile(logFilePath, entries)

      // We use a parse library to parse the durations so there's no real need
      // To test different values.
      await execLogsFollower.streamLogs({ since: "65m", follow: false })

      expect(logs).to.eql(entries.slice(2))
    })
    it("should skip invalid entries", async () => {
      const logFilePath = join(tmpDir.path, `log-${randomString(8)}.jsonl`)
      const [stream, logs] = getStream()

      const execLogsFollower = new ExecLogsFollower({
        stream,
        serviceName: "foo",
        log,
        logFilePath,
      })

      const entries: any[] = [
        {
          msg: "Invalid - Missing service name",
          timestamp: moment().subtract(2, "h").toDate(),
        },
        {
          msg: "Invalid - missing timestamp",
          serviceName: "foo",
        },
        {
          msg: "Valid 1",
          timestamp: moment().subtract(1, "h").toDate(),
          serviceName: "foo",
        },
        {
          msg: "Valid 2",
          timestamp: moment().subtract(1, "h").toDate(),
          serviceName: "foo",
        },
      ]

      await writeLogFile(logFilePath, entries)

      await execLogsFollower.streamLogs({ follow: false })

      expect(logs).to.eql(entries.slice(2))
    })
    it("should abort without error if log file doesn't exist", async () => {
      const logFilePath = join(tmpDir.path, `log-${randomString(8)}.jsonl`)
      const [stream, logs] = getStream()

      const execLogsFollower = new ExecLogsFollower({
        stream,
        serviceName: "foo",
        log,
        logFilePath,
      })

      // Skip writing log file

      await execLogsFollower.streamLogs({ follow: false })

      expect(logs).to.eql([])
    })
    // This will require some nasty async stuff
    context("follow logs", () => {
      let execLogsFollower: ExecLogsFollower

      afterEach(async () => {
        execLogsFollower && execLogsFollower.stop()
      })

      it("should stream initial batch", async () => {
        const logFilePath = join(tmpDir.path, `log-${randomString(8)}.jsonl`)
        const [stream, logs] = getStream()

        execLogsFollower = new ExecLogsFollower({
          stream,
          serviceName: "foo",
          log,
          logFilePath,
          retryIntervalMs: 250,
        })
        execLogsFollower.streamLogs({ follow: true }).catch((_err) => {})

        const entries: ServiceLogEntry[] = range(100).map((el) => ({
          msg: String(el),
          timestamp: new Date(),
          serviceName: "foo",
        }))

        await writeLogFile(logFilePath, entries)

        await sleep(defaultSleep)

        expect(logs).to.eql(entries)
      })
      it("should follow logs and stream new entries", async () => {
        const logFilePath = join(tmpDir.path, `log-${randomString(8)}.jsonl`)
        const [stream, logs] = getStream()

        execLogsFollower = new ExecLogsFollower({
          stream,
          serviceName: "foo",
          log,
          logFilePath,
          retryIntervalMs: 250,
        })

        execLogsFollower.streamLogs({ follow: true }).catch((_err) => {})

        const firstBatch: ServiceLogEntry[] = range(100).map((el) => ({
          msg: `first-batch-${String(el)}`,
          timestamp: new Date(),
          serviceName: "foo",
        }))

        await writeLogFile(logFilePath, firstBatch)

        await sleep(defaultSleep)

        expect(logs).to.eql(firstBatch)

        const secondBatch: ServiceLogEntry[] = range(100).map((el) => ({
          msg: `second-batch-${String(el)}`,
          timestamp: new Date(),
          serviceName: "foo",
        }))

        await writeLogFile(logFilePath, secondBatch, true)

        await sleep(defaultSleep)

        expect(logs).to.eql([...firstBatch, ...secondBatch])
      })
      it("should handle log file rotation", async () => {
        const logFilePath = join(tmpDir.path, `log-${randomString(8)}.jsonl`)
        const [stream, logs] = getStream()

        execLogsFollower = new ExecLogsFollower({
          stream,
          serviceName: "foo",
          log,
          logFilePath,
          retryIntervalMs: 250,
        })

        execLogsFollower.streamLogs({ follow: true }).catch((_err) => {})

        const firstBatch: ServiceLogEntry[] = range(100).map((el) => ({
          msg: `first-batch-${String(el)}`,
          timestamp: new Date(),
          serviceName: "foo",
        }))

        await writeLogFile(logFilePath, firstBatch)

        await sleep(defaultSleep)

        expect(logs).to.eql(firstBatch)

        // Rotate the log file. Note that this deletes the entire file so that subsequent incoming
        // entries are written to the beginning of the new file.
        await remove(logFilePath)
        await ensureFile(logFilePath)

        const secondBatch: ServiceLogEntry[] = range(100).map((el) => ({
          msg: `second-batch-${String(el)}`,
          timestamp: new Date(),
          serviceName: "foo",
        }))

        await writeLogFile(logFilePath, secondBatch)

        await sleep(defaultSleep)

        expect(logs).to.eql([...firstBatch, ...secondBatch])
      })
      it("should abide its time and not crash if no log file is found", async () => {
        const logFilePath = join(tmpDir.path, `log-${randomString(8)}.jsonl`)
        const [stream, logs] = getStream()

        execLogsFollower = new ExecLogsFollower({
          stream,
          serviceName: "foo",
          log,
          logFilePath,
          retryIntervalMs: 250,
        })

        execLogsFollower.streamLogs({ follow: true }).catch((_err) => {})

        await sleep(defaultSleep)
        expect(logs).to.eql([])
      })
    })
  })
})
