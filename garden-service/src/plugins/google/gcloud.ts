/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { spawn, SpawnOpts } from "../../util/util"

export interface GCloudParams {
  data?: Buffer
  ignoreError?: boolean
  silent?: boolean
  timeout?: number
  cwd?: string
}

export interface GCloudOutput {
  code: number
  output: string
  stdout?: string
  stderr?: string
}

const DEFAULT_TIMEOUT = 600

// TODO: re-use code across this and Kubectl
export class GCloud {
  public account?: string
  public project?: string

  constructor({ account, project }: { account?: string; project?: string }) {
    this.account = account
    this.project = project
  }

  async call(args: string[], opts: SpawnOpts = {}): Promise<GCloudOutput> {
    const { data, ignoreError = false, timeout = DEFAULT_TIMEOUT } = opts
    const preparedArgs = this.prepareArgs(args)
    return spawn("gcloud", preparedArgs, { ignoreError, data, timeout })
  }

  async json(args: string[], opts: GCloudParams = {}): Promise<any> {
    if (!args.includes("--format=json")) {
      args.push("--format=json")
    }

    const result = await this.call(args, opts)

    return JSON.parse(result.output)
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
