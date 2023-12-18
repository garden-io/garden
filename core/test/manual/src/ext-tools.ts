/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mutagenCliSpec } from "../../../src/mutagen.js"
import { parse } from "url"
import got from "got"
import { createHash } from "node:crypto"
import { basename, join } from "path"
import { pipeline } from "node:stream/promises"
import { createReadStream, createWriteStream } from "fs"
import tmp from "tmp-promise"
import { realpath } from "fs/promises"
import type { PluginToolSpec, ToolBuildSpec } from "../../../src/plugin/tools.js"
import { expect } from "chai"
import { kubectlSpec } from "../../../src/plugins/kubernetes/kubectl.js"
import { kustomizeSpec } from "../../../src/plugins/kubernetes/kubernetes-type/kustomize.js"
import { helm3Spec } from "../../../src/plugins/kubernetes/helm/helm-cli.js"

export async function downloadAndVerifyHash(
  { architecture, platform, sha256, url }: ToolBuildSpec,
  downloadDir: string
) {
  // eslint-disable-next-line no-console
  console.log(`Downloading ${platform}-${architecture} from ${url}`)
  const parsed = parse(url)
  const protocol = parsed.protocol

  const response =
    protocol === "file:"
      ? createReadStream(parsed.path!)
      : got.stream({
          method: "GET",
          url,
        })
  const downloadedHash = response.pipe(createHash("sha256"))

  const artifactName = basename(url)
  const targetExecutable = join(downloadDir, artifactName)
  const writeStream = createWriteStream(targetExecutable)
  await pipeline(response, writeStream)
  // eslint-disable-next-line no-console
  console.log(`Download completed`)

  // eslint-disable-next-line no-console
  console.log(`Verifying hash for ${artifactName}`)
  const downloadedSha256 = downloadedHash.digest("hex")

  // eslint-disable-next-line no-console
  console.log(`Downloaded hash: ${downloadedSha256}`)
  // eslint-disable-next-line no-console
  console.log(`Spec hash: ${sha256}`)

  expect(downloadedSha256).to.eql(sha256)
}

const downloadBinariesAndVerifyHashes = (toolSpecs: PluginToolSpec[]) => {
  let tmpDir: tmp.DirectoryResult

  beforeEach(async () => {
    const dir = await tmp.dir({ unsafeCleanup: true })
    // Fully resolve path so that we don't get path mismatches in tests
    dir.path = await realpath(dir.path)
    tmpDir = dir
  })

  afterEach(async () => {
    await tmpDir.cleanup()
  })

  for (const toolSpec of toolSpecs) {
    for (const build of toolSpec.builds) {
      it(`${toolSpec.name} ${toolSpec.version} ${build.platform}-${build.architecture}`, async () => {
        await downloadAndVerifyHash(build, tmpDir.path)
      })
    }
  }
}

describe("Mutagen binaries", () => {
  downloadBinariesAndVerifyHashes([mutagenCliSpec])
})

describe("Kubectl binaries", () => {
  downloadBinariesAndVerifyHashes([kubectlSpec])
})

describe("Kustomize binaries", () => {
  downloadBinariesAndVerifyHashes([kustomizeSpec])
})

describe("Helm binaries", () => {
  downloadBinariesAndVerifyHashes([helm3Spec])
})
