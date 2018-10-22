/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ChildProcess } from "child_process"
import * as _spawn from "cross-spawn"
import { encodeYamlMulti, spawn, SpawnOpts } from "../../util/util"

export interface ApplyOptions {
  dryRun?: boolean,
  force?: boolean,
  pruneSelector?: string,
  namespace?: string,
}

export const KUBECTL_DEFAULT_TIMEOUT = 300

export class Kubectl {
  public context?: string
  public namespace?: string
  public configPath?: string

  // TODO: namespace should always be required
  constructor({ context, namespace, configPath }: { context: string, namespace?: string, configPath?: string }) {
    this.context = context
    this.namespace = namespace
    this.configPath = configPath
  }

  async call(args: string[], opts: SpawnOpts = {}) {
    const { data, ignoreError = false, timeout = KUBECTL_DEFAULT_TIMEOUT } = opts
    const preparedArgs = this.prepareArgs(args, opts)
    return spawn("kubectl", preparedArgs, { ignoreError, data, timeout })
  }

  async json(args: string[], opts: SpawnOpts = {}): Promise<any> {
    if (!args.includes("--output=json")) {
      args.push("--output=json")
    }

    const result = await this.call(args, opts)

    return JSON.parse(result.output)
  }

  spawn(args: string[]): ChildProcess {
    return _spawn("kubectl", this.prepareArgs(args, {}))
  }

  private prepareArgs(args: string[], { tty }: SpawnOpts) {
    const ops: string[] = []

    if (this.namespace) {
      ops.push(`--namespace=${this.namespace}`)
    }

    if (this.context) {
      ops.push(`--context=${this.context}`)
    }

    if (this.configPath) {
      ops.push(`--kubeconfig=${this.configPath}`)
    }

    if (tty) {
      ops.push("--tty")
    }

    return ops.concat(args)
  }
}

export function kubectl(context: string, namespace?: string) {
  return new Kubectl({ context, namespace })
}

export async function apply(context: string, obj: object, params: ApplyOptions) {
  return applyMany(context, [obj], params)
}

export async function applyMany(
  context: string, objects: object[],
  { dryRun = false, force = false, namespace, pruneSelector }: ApplyOptions = {},
) {
  const data = Buffer.from(encodeYamlMulti(objects))

  let args = ["apply"]
  dryRun && args.push("--dry-run")
  force && args.push("--force")
  pruneSelector && args.push("--prune", "--selector", pruneSelector)
  args.push("--output=json", "-f", "-")

  const result = await kubectl(context, namespace).call(args, { data })

  try {
    return JSON.parse(result.output)
  } catch (_) {
    return result.output
  }
}

export interface DeleteObjectsParams {
  context: string,
  namespace: string,
  labelKey: string,
  labelValue: string,
  objectTypes: string[],
  includeUninitialized?: boolean,
}

export async function deleteObjectsByLabel(
  {
    context,
    namespace,
    labelKey,
    labelValue,
    objectTypes,
    includeUninitialized = false,
  }: DeleteObjectsParams) {

  let args = [
    "delete",
    objectTypes.join(","),
    "-l",
    `${labelKey}=${labelValue}`,
  ]

  includeUninitialized && args.push("--include-uninitialized")

  const result = await kubectl(context, namespace).call(args)

  try {
    return JSON.parse(result.output)
  } catch (_) {
    return result.output
  }
}
