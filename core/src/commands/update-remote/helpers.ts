/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { difference } from "lodash"
import { join, basename } from "path"
import { remove, pathExists } from "fs-extra"

import { getChildDirNames } from "../../util/fs"
import { ExternalSourceType, getRemoteSourceLocalPath, getRemoteSourcesPath } from "../../util/ext-source-util"
import { SourceConfig } from "../../config/project"
import { BooleanParameter } from "../../cli/params"

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
