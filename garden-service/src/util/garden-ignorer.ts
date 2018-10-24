/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")
import { fromPairs, last, sortBy } from "lodash"
const ignore = require("ignore") // NOTE: Impoting from ignore/ignore doesn't work on Windows
import { dirname, join, resolve, sep, normalize } from "path"
import { readFile, pathExists } from "fs-extra"
import { GARDEN_DIR_NAME } from "../constants"

type NestedIgnorerList = { ignorefileDir: string, ignorer: any }[]

/**
 * We scan for .gitignore and .gardenignore files (referred to as ignorefiles) in all subdirectories of the project's
 * root directory.
 *
 * Files nested within a subdirectory (of project root) that contains one or more ignorefiles will only be matched
 * against the rules found in those ignorefiles.
 *
 * This is done recursively - a file is only matched against the most deeply nested set of ignorefiles located in its
 * parent directories (including the one it's enclosed in, if relevant).
 */

export class GardenIgnorer {

  public readonly projectRoot: string
  private ignorers: NestedIgnorerList

  public static async factory(projectRoot: string, ignorefileDirs: string[]) {

    const ignorers = await Bluebird.props(fromPairs(
      ignorefileDirs.map(d => {
        /**
         * We add/ensure a trailing slash at the end of the path used for finding
         * matching ignorers below
         */
        const matchPath = projectRoot !== d ? normalize(join(d, sep)) : ""
        return [matchPath, makeIgnorer(d)]
      })))

    /**
     * Regardless of whether there are any project-level ignorefiles, we ensure
     * that a project-level ignorer is always instantiated.
     */
    ignorers[""] = await makeIgnorer(projectRoot)

    return new GardenIgnorer(projectRoot,
      Object.entries(ignorers)
        .map(([ignorefileDir, ignorer]) => ({ ignorefileDir, ignorer })))
  }

  constructor(projectRoot: string, ignorers: NestedIgnorerList) {
    this.projectRoot = projectRoot
    this.ignorers = ignorers
  }

  ignores(relPath: string): boolean {
    const absPath = resolve(this.projectRoot, relPath)
    const absDirPath = normalize(join(dirname(absPath), sep))

    const matchingIgnorers = this.ignorers
      .filter(({ ignorefileDir }) => absDirPath.startsWith(ignorefileDir))

    if (!matchingIgnorers.length) {
      /**
       * No ignorer was found, indicating that no ignorefile was found at projectRoot,
       * or in any of relPath's parent directories up to projectRoot.
       */
      return false
    }

    /**
     * We use the innermost matching ignorer whose ignorefileDir is a parent of absPath, which is simply the one with
     * the longest (deepest) path.
     */
    return last(sortBy(matchingIgnorers, i => i.ignorefileDir))! // we know there's at least one
      .ignorer.ignores(relPath)
  }

}

async function makeIgnorer(ignorefileDirPath: string) {
  const gitignorePath = join(ignorefileDirPath, ".gitignore")
  const gardenignorePath = join(ignorefileDirPath, ".gardenignore")
  const ig = ignore()

  if (await pathExists(gitignorePath)) {
    ig.add((await readFile(gitignorePath)).toString())
  }

  if (await pathExists(gardenignorePath)) {
    ig.add((await readFile(gardenignorePath)).toString())
  }

  // should we be adding this (or more) by default?
  ig.add([
    "node_modules",
    ".git",
    GARDEN_DIR_NAME,
  ])

  return ig
}
