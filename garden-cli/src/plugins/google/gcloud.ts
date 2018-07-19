/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { spawn } from "child_process"
import { extend } from "lodash"
import { spawnPty } from "../../util/util"

export interface GCloudParams {
  data?: Buffer,
  ignoreError?: boolean,
  silent?: boolean,
  timeout?: number,
  cwd?: string,
}

export interface GCloudOutput {
  code: number,
  output: string,
  stdout?: string,
  stderr?: string,
}

const DEFAULT_TIMEOUT = 600

// TODO: re-use code across this and Kubectl
export class GCloud {
  public account?: string
  public project?: string

  constructor({ account, project }: { account?: string, project?: string }) {
    this.account = account
    this.project = project
  }

  async call(
    args: string[],
    { data, ignoreError = false, silent = true, timeout = DEFAULT_TIMEOUT, cwd }: GCloudParams = {},
  ): Promise<GCloudOutput> {

    const out: GCloudOutput = {
      code: 0,
      output: "",
      stdout: "",
      stderr: "",
    }

    const proc = spawn("gcloud", this.prepareArgs(args), { cwd })

    proc.stdout.on("data", (s) => {
      if (!silent) {
        process.stdout.write(s)
      }
      out.output += s
      out.stdout! += s
    })

    proc.stderr.on("data", (s) => {
      if (!silent) {
        process.stderr.write(s)
      }
      out.output += s
      out.stderr! += s
    })

    if (data) {
      proc.stdin.end(data)
    }

    return new Promise<GCloudOutput>((resolve, reject) => {
      let _timeout

      const _reject = (msg: string) => {
        const err = new Error(msg)
        extend(err, <any>out)
        reject(err)
      }

      if (timeout > 0) {
        _timeout = setTimeout(() => {
          proc.kill("SIGKILL")
          _reject(`gcloud timed out after ${timeout} seconds.`)
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

  async json(args: string[], opts: GCloudParams = {}): Promise<any> {
    if (!args.includes("--format=json")) {
      args.push("--format=json")
    }

    const result = await this.call(args, opts)

    return JSON.parse(result.output)
  }

  async tty(args: string[], { silent = true, cwd }: { silent?: boolean, cwd?: string } = {}): Promise<GCloudOutput> {
    return spawnPty("gcloud", this.prepareArgs(args), { silent, cwd, tty: true })
  }

  private prepareArgs(args: string[]) {
    const ops: string[] = []

    if (this.account) {
      ops.push(`--account=${this.account}`)
    }

    if (this.project) {
      ops.push(`--project=${this.project}`)
    }

    return ops.concat(args)
  }
}
