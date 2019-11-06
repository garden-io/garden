/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { difference } from "lodash"
import { join, basename } from "path"
import { remove, pathExists } from "fs-extra"

import { getChildDirNames } from "../../util/fs"
import { ExternalSourceType, getRemoteSourcesDirname, getRemoteSourceRelPath } from "../../util/ext-source-util"
import { SourceConfig } from "../../config/project"

export async function pruneRemoteSources({
  gardenDirPath,
  sources,
  type,
}: {
  gardenDirPath: string
  sources: SourceConfig[]
  type: ExternalSourceType
}) {
  const remoteSourcesPath = join(gardenDirPath, getRemoteSourcesDirname(type))

  if (!(await pathExists(remoteSourcesPath))) {
    return
  }

  const sourceNames = sources
    .map(({ name, repositoryUrl: url }) => getRemoteSourceRelPath({ name, url, sourceType: type }))
    .map((srcPath) => basename(srcPath))

  const currentRemoteSources = await getChildDirNames(remoteSourcesPath)
  const staleRemoteSources = difference(currentRemoteSources, sourceNames)

  for (const dirName of staleRemoteSources) {
    await remove(join(remoteSourcesPath, dirName))
  }
}
