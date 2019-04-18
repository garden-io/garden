/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as _spawn from "cross-spawn"
import { encodeYamlMulti } from "../../util/util"
import { BinaryCmd, ExecParams } from "../../util/ext-tools"
import { LogEntry } from "../../logger/log-entry"

export interface ApplyParams {
  log: LogEntry,
  context: string,
  manifests: object[],
  dryRun?: boolean,
  force?: boolean,
  pruneSelector?: string,
  namespace?: string,
}

export const KUBECTL_DEFAULT_TIMEOUT = 300

export async function apply(
  { log, context, manifests: objects, dryRun = false, force = false, namespace, pruneSelector }: ApplyParams,
) {
  const input = Buffer.from(encodeYamlMulti(objects))

  let args = ["apply"]
  dryRun && args.push("--dry-run")
  force && args.push("--force")
  pruneSelector && args.push("--prune", "--selector", pruneSelector)
  args.push("--output=json", "-f", "-")

  const result = await kubectl.stdout({ log, context, namespace, args, input })

  try {
    return JSON.parse(result)
  } catch (_) {
    return result
  }
}

export interface DeleteObjectsParams {
  log: LogEntry,
  context: string,
  namespace: string,
  labelKey: string,
  labelValue: string,
  objectTypes: string[],
  includeUninitialized?: boolean,
}

export async function deleteObjectsByLabel(
  {
    log,
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

  const result = await kubectl.stdout({ context, namespace, args, log })

  try {
    return JSON.parse(result)
  } catch (_) {
    return result
  }
}

interface KubectlParams extends ExecParams {
  log: LogEntry
  context: string
  namespace?: string
  configPath?: string
  args: string[]
}

interface KubectlSpawnParams extends KubectlParams {
  tty?: boolean
  wait?: boolean
}

class Kubectl extends BinaryCmd {
  async exec(params: KubectlParams) {
    this.prepareArgs(params)
    return super.exec(params)
  }

  async stdout(params: KubectlParams) {
    this.prepareArgs(params)
    return super.stdout(params)
  }

  async spawn(params: KubectlParams) {
    this.prepareArgs(params)
    return super.spawn(params)
  }

  async spawnAndWait(params: KubectlSpawnParams) {
    this.prepareArgs(params)
    return super.spawnAndWait(params)
  }

  async json(params: KubectlParams): Promise<any> {
    if (!params.args.includes("--output=json")) {
      params.args.push("--output=json")
    }

    const result = await this.stdout(params)

    return JSON.parse(result)
  }

  private prepareArgs(params: KubectlParams) {
    const { context, namespace, configPath, args } = params

    const opts: string[] = [`--context=${context}`]

    if (namespace) {
      opts.push(`--namespace=${namespace}`)
    }

    if (configPath) {
      opts.push(`--kubeconfig=${configPath}`)
    }

    params.args = opts.concat(args)
  }
}

export const kubectl = new Kubectl({
  name: "kubectl",
  defaultTimeout: KUBECTL_DEFAULT_TIMEOUT,
  specs: {
    darwin: {
      url: "https://storage.googleapis.com/kubernetes-release/release/v1.14.0/bin/darwin/amd64/kubectl",
      sha256: "26bb69f6ac819700d12be3339c19887a2e496ef3e487e896af2375bf1455cb9f",
    },
    linux: {
      url: "https://storage.googleapis.com/kubernetes-release/release/v1.14.0/bin/linux/amd64/kubectl",
      sha256: "99ade995156c1f2fcb01c587fd91be7aae9009c4a986f43438e007265ca112e8",
    },
    win32: {
      url: "https://storage.googleapis.com/kubernetes-release/release/v1.14.0/bin/windows/amd64/kubectl.exe",
      sha256: "427fd942e356ce44d6c396674bba486ace99f99e45f9121c513c7dd98ff999f0",
    },
  },
})
