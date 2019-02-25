/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { TaskResults } from "../task-graph"
import { ModuleVersion } from "../vcs/vcs"
import { v1 as uuidv1 } from "uuid"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"

export type TaskType = "build" | "deploy" | "publish" | "hot-reload" | "resolve-provider" | "task" | "test"

export class TaskDefinitionError extends Error { }

export function makeBaseKey(type: TaskType, name: string) {
  return `${type}.${name}`
}

export interface TaskParams {
  garden: Garden
  log: LogEntry
  force?: boolean
  version: ModuleVersion
}

export abstract class BaseTask {
  abstract type: TaskType
  garden: Garden
  log: LogEntry
  uid: string
  force: boolean
  version: ModuleVersion

  dependencies: BaseTask[]

  constructor(initArgs: TaskParams) {
    this.garden = initArgs.garden
    this.dependencies = []
    this.uid = uuidv1() // uuidv1 is timestamp-based
    this.force = !!initArgs.force
    this.version = initArgs.version
    this.log = initArgs.log
  }

  async getDependencies(): Promise<BaseTask[]> {
    return this.dependencies
  }

  abstract getName(): string

  getKey(): string {
    return makeBaseKey(this.type, this.getName())
  }

  getId(): string {
    return `${this.getKey()}.${this.uid}`
  }

  abstract getDescription(): string

  abstract async process(dependencyResults: TaskResults): Promise<any>
}
