/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { ChildProcess, spawn } from "child_process"
import { extend } from "lodash"
import { spawnPty } from "../../util/util"
import { RuntimeError } from "../../exceptions"
import { getLogger } from "../../logger/logger"
import hasAnsi = require("has-ansi")

export interface KubectlParams {
  data?: Buffer,
  ignoreError?: boolean,
  silent?: boolean,
  timeout?: number,
  tty?: boolean,
}

export interface KubectlOutput {
  code: number,
  output: string,
  stdout?: string,
  stderr?: string,
}

export const KUBECTL_DEFAULT_TIMEOUT = 600

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

  async call(
    args: string[],
    { data, ignoreError = false, silent = true, timeout = KUBECTL_DEFAULT_TIMEOUT }: KubectlParams = {},
  ): Promise<KubectlOutput> {
    // TODO: use the spawn helper from index.ts
    const logger = getLogger()
    const out: KubectlOutput = {
      code: 0,
      output: "",
      stdout: "",
      stderr: "",
    }

    const preparedArgs = this.prepareArgs(args)
    const proc = spawn("kubectl", preparedArgs)

    proc.stdout.on("data", (s) => {
      if (!silent) {
        const str = s.toString()
        logger.info(hasAnsi(str) ? str : chalk.white(str))
      }
      out.output += s
      out.stdout! += s
    })

    proc.stderr.on("data", (s) => {
      if (!silent) {
        const str = s.toString()
        logger.info(hasAnsi(str) ? str : chalk.white(str))
      }
      out.output += s
      out.stderr! += s
    })

    if (data) {
      proc.stdin.end(data)
    }

    return new Promise<KubectlOutput>((resolve, reject) => {
      let _timeout

      const _reject = (msg: string) => {
        const dataStr = data ? data.toString() : null
        const details = extend({ args, preparedArgs, msg, data: dataStr }, <any>out)
        const err = new RuntimeError(`Failed running 'kubectl ${args.join(" ")}'`, details)
        reject(err)
      }

      if (timeout > 0) {
        _timeout = setTimeout(() => {
          proc.kill("SIGKILL")
          _reject(`kubectl timed out after ${timeout} seconds.`)
        }, timeout * 1000)
      }

      proc.on("close", (code) => {
        _timeout && clearTimeout(_timeout)
        out.code = code

        if (code === 0 || ignoreError) {
          resolve(out)
        } else {
          _reject("Process exited with code " + code)
        }
      })
    })
  }

  async json(args: string[], opts: KubectlParams = {}): Promise<KubectlOutput> {
    if (!args.includes("--output=json")) {
      args.push("--output=json")
    }

    const result = await this.call(args, opts)

    return JSON.parse(result.output)
  }

  async tty(args: string[], opts: KubectlParams = {}): Promise<KubectlOutput> {
    return spawnPty("kubectl", this.prepareArgs(args), opts)
  }

  spawn(args: string[]): ChildProcess {
    return spawn("kubectl", this.prepareArgs(args))
  }

  private prepareArgs(args: string[]) {
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

    return ops.concat(args)
  }
}

export function kubectl(context: string, namespace?: string) {
  return new Kubectl({ context, namespace })
}

export async function apply(
  context: string, obj: any,
  { dryRun = false, force = false, namespace }: { dryRun?: boolean, force?: boolean, namespace?: string } = {},
) {
  const data = Buffer.from(JSON.stringify(obj))

  let args = ["apply"]
  dryRun && args.push("--dry-run")
  force && args.push("--force")
  args.push("--output=json")
  args.push("-f")
  args.push("-")

  const result = await kubectl(context, namespace).call(args, { data })

  try {
    return JSON.parse(result.output)
  } catch (_) {
    return result.output
  }
}
