/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Entity, Column } from "typeorm-with-better-sqlite3"
import { GardenEntity } from "../base-entity"
import { partition, find, isMatch } from "lodash"

/**
 * Each GardenProcess entry maps to a running Garden process. We use this to keep track of active processes,
 * and to allow one process to find another, e.g. a running dashboard process for a project/env.
 */
@Entity()
export class GardenProcess extends GardenEntity {
  @Column("integer")
  pid: number

  @Column("datetime")
  startedAt: Date

  @Column("varchar")
  arguments: string

  @Column("varchar", { default: null, nullable: true })
  sessionId: string | null

  @Column("varchar", { default: null, nullable: true })
  projectRoot: string | null

  @Column("varchar", { default: null, nullable: true })
  projectName: string | null

  @Column("varchar", { default: null, nullable: true })
  environmentName: string | null

  @Column("varchar", { default: null, nullable: true })
  namespace: string | null

  @Column("boolean", { default: false })
  persistent: boolean

  @Column("varchar", { default: null, nullable: true })
  serverHost: string | null

  @Column("varchar", { default: null, nullable: true })
  serverAuthKey: string | null

  @Column("varchar", { default: null, nullable: true })
  command: string | null

  private update(values: Partial<GardenProcess>) {
    Object.assign(this, values)
  }

  /**
   * After a Command has been selected and prepared, update this record with information about the running command.
   */
  async setCommand(values: {
    persistent: boolean
    serverHost: string | null
    serverAuthKey: string | null
    command: string
    sessionId: string | null
    projectRoot: string | null
    projectName: string | null
    environmentName: string | null
    namespace: string | null
  }) {
    this.update(values)
    await this.save()
  }

  /**
   * Registers the current Garden process. Once arguments have been parsed and a Command started, this should be
   * updated with the `setCommand()` method.
   *
   * @param args The arguments the CLI was started with
   */
  static async register(args: string[]) {
    const record = GardenProcess.create({ arguments: args.join(" "), pid: process.pid, startedAt: new Date() })
    await this.save(record)
    return record
  }

  /**
   * Finds a running dashboard process for the given project, environment and namespace, returns undefined otherwise.
   *
   * @param runningProcesses - List of running processes, as returned by `getActiveProcesses()`
   * @param scope - Project information to match on
   */
  static getDashboardProcess(
    runningProcesses: GardenProcess[],
    scope: {
      projectRoot: string
      projectName: string
      environmentName: string
      namespace: string
    }
  ): GardenProcess | undefined {
    return find(
      runningProcesses,
      (p) => !!p.serverHost && !!p.serverAuthKey && isMatch(p, { ...scope, command: "dashboard", persistent: true })
    )
  }

  /**
   * Retrieves all active processes, cleaning up any stale records of inactive processes.
   */
  static async getActiveProcesses() {
    const processes = await this.find({ take: 1000 })
    const [running, dead] = partition(processes, (p) => isRunning(p.pid))

    // Clean up dead PIDs
    await this.remove(dead)

    return running
  }
}

function isRunning(pid: number) {
  // Taken from https://stackoverflow.com/a/21296291. Doesn't actually kill the process.
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
