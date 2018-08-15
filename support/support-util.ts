/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  spawn as _spawn,
  ChildProcess,
} from "child_process"
import Axios from "axios"
import { createHash } from "crypto"

const children: ChildProcess[] = []

export function spawn(cmd, args, cb) {
  const child = _spawn(cmd, args, { stdio: "pipe", shell: true, env: process.env })
  children.push(child)

  const output: string[] = []
  child.stdout.on("data", (data) => output.push(data.toString()))
  child.stderr.on("data", (data) => output.push(data.toString()))

  child.on("exit", (code) => {
    if (code !== 0) {
      console.log(output.join(""))
      die()
    }
    cb()
  })

  return child
}

function die() {
  for (const child of children) {
    !child.killed && child.kill()
  }
  process.exit(1)
}

process.on("SIGINT", die)
process.on("SIGTERM", die)

export async function getUrlChecksum(url: string, algorithm = "sha256") {
  const response = await Axios({
    method: "GET",
    url,
    responseType: "stream",
  })

  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm)

    response.data.on("data", (chunk) => {
      hash.update(chunk)
    })

    response.data.on("end", () => {
      resolve(hash.digest("hex"))
    })

    response.data.on("error", reject)
  })
}
