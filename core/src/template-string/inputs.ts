/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContextResolveOpts } from "../config/template-contexts/base.js"
import { InternalError } from "../exceptions.js"

export type ResolveReferences = {
  // key is the resolve result key path, e.g. "spec.files[0].path"
  [resultKeyPath: string]: ResolveResult
}

export type ResolveResult<T = unknown> = {
  expr: string | undefined
  value: T
  inputs: {
    // key is the input variable name, e.g. secrets.someSecret, local.env.SOME_VARIABLE, etc
    [contextKeyPath: string]: ResolveResult
  }
}

export class ReferenceRecorder {
  private references?: ResolveReferences = {}

  record(contextOpts: ContextResolveOpts, result: ResolveResult) {
    if (!this.references) {
      throw new InternalError({ message: "Already collected references" })
    }

    if (!contextOpts.resultPath) {
      throw new InternalError({ message: "Missing resultPath" })
    }

    const key = contextOpts.resultPath.join(".")
    if (!this.references.hasOwnProperty(key)) {
      this.references[key] = result
    }
  }

  getReferences(): ResolveReferences {
    if (!this.references) {
      throw new InternalError({ message: "Already collected references" })
    }
    const refs = this.references
    delete this.references
    return refs
  }
}
