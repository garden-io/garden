/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import { writeCommandReferenceDocs } from "./commands"
import { writeConfigReferenceDocs } from "./config"
import { argv } from "process"
import { writeTemplateStringReferenceDocs } from "./template-strings"

export function generateDocs(targetDir: string) {
  const write = false
  const docsRoot = resolve(process.cwd(), targetDir)
  if (write) {
    writeCommandReferenceDocs(docsRoot)
    writeConfigReferenceDocs(docsRoot)
    writeTemplateStringReferenceDocs(docsRoot)
  } else {
    writeConfigReferenceDocs(docsRoot)
  }
}

if (require.main === module) {
  generateDocs(argv[2])
}
