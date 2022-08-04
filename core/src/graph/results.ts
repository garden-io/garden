/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BaseTask, Task, ValidResultType } from "../tasks/base"
import { InternalError } from "../exceptions"
import { fromPairs } from "lodash"

export interface TaskEventBase {
  type: string
  description: string
  key: string
  name: string
  version: string
}

export interface GraphResult<R extends ValidResultType = ValidResultType> extends TaskEventBase {
  result: R | null
  dependencyResults: GraphResults | null
  startedAt: Date | null
  completedAt: Date | null
  error: Error | null
  outputs: R["outputs"]
  task: BaseTask
}

export type GraphResultFromTask<T extends Task> = GraphResult<T["_resultType"]>

export interface GraphResultMap<T extends Task = Task> {
  [key: string]: GraphResultFromTask<T> | null
}

export class GraphResults<B extends Task = Task> {
  private results: Map<string, GraphResultFromTask<B> | null>
  private tasks: Map<string, B>

  constructor(tasks: B[]) {
    this.results = new Map(tasks.map((t) => [t.getKey(), null]))
    this.tasks = new Map(tasks.map((t) => [t.getKey(), t]))
  }

  setResult<T extends BaseTask>(task: T, result: GraphResultFromTask<T>) {
    const key = task.getKey()
    this.checkKey(key)
    this.results.set(key, result)
  }

  getResult<T extends BaseTask>(task: T): GraphResultFromTask<T> | null {
    const key = task.getKey()
    this.checkKey(key)
    return this.results.get(key) || null
  }

  getTasks(): Task[] {
    return Array.from(this.tasks.values())
  }

  getMap(): GraphResultMap {
    return fromPairs(Array.from(this.results.entries()))
  }

  private checkKey(key: string) {
    if (!this.tasks.has(key)) {
      throw new InternalError(`GraphResults object does not have task ${key}.`, { key, taskKeys: this.tasks.keys() })
    }
  }
}
