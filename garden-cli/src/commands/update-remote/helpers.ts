/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { difference } from "lodash"
import { join } from "path"
import { remove, pathExists } from "fs-extra"

import { getChildDirNames } from "../../util/util"
import { ExternalSourceType, getRemoteSourcesDirName } from "../../util/ext-source-util"

export async function pruneRemoteSources({ projectRoot, names, type }: {
  projectRoot: string,
  names: string[],
  type: ExternalSourceType,
}) {
  const remoteSourcesPath = join(projectRoot, getRemoteSourcesDirName(type))

  if (!(await pathExists(remoteSourcesPath))) {
    return
  }

  const currentRemoteSourceNames = await getChildDirNames(remoteSourcesPath)
  const staleRemoteSourceNames = difference(currentRemoteSourceNames, names)
  for (const dirName of staleRemoteSourceNames) {
    await remove(join(remoteSourcesPath, dirName))
  }
}
