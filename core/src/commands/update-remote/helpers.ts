/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { difference } from "lodash-es"
import { join, basename } from "path"
import fsExtra from "fs-extra"
const { remove, pathExists } = fsExtra

import { getChildDirNames } from "../../util/fs.js"
import type { ExternalSourceType } from "../../util/ext-source-util.js"
import { getRemoteSourceLocalPath, getRemoteSourcesPath } from "../../util/ext-source-util.js"
import type { SourceConfig } from "../../config/project.js"
import { BooleanParameter } from "../../cli/params.js"

export const updateRemoteSharedOptions = {
  parallel: new BooleanParameter({
    help: "Allow git updates to happen in parallel. This will automatically reject any Git prompt, such as username / password.",
    defaultValue: false,
  }),
}

export async function pruneRemoteSources({
  gardenDirPath,
  sources,
  type,
}: {
  gardenDirPath: string
  sources: SourceConfig[]
  type: ExternalSourceType
}) {
  const remoteSourcesPath = getRemoteSourcesPath({ gardenDirPath, type })

  if (!(await pathExists(remoteSourcesPath))) {
    return
  }

  const sourceNames = sources
    .map(({ name, repositoryUrl: url }) => getRemoteSourceLocalPath({ name, url, type, gardenDirPath }))
    .map((srcPath) => basename(srcPath))

  const currentRemoteSources = await getChildDirNames(remoteSourcesPath)
  const staleRemoteSources = difference(currentRemoteSources, sourceNames)

  for (const dirName of staleRemoteSources) {
    await remove(join(remoteSourcesPath, dirName))
  }
}
