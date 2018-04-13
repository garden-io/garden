/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export const NEW_MODULE_VERSION = "0000000000"

export interface TreeVersion {
  versionString: string
  latestCommit: string
  dirtyTimestamp: number | null
}

export abstract class VcsHandler {
  constructor(protected projectRoot: string) { }

  abstract async getTreeVersion(directories: string[]): Promise<TreeVersion>
  abstract async sortVersions(versions: TreeVersion[]): Promise<TreeVersion[]>
}
