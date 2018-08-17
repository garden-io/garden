/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import { generateCommandReferenceDocs } from "./commands"
import { generateConfigReferenceDocs } from "./config"
import { argv } from "process"
import { generateTemplateStringReferenceDocs } from "./template-strings"

export function generateDocs(targetDir: string) {
  const docsRoot = resolve(process.cwd(), targetDir)
  generateCommandReferenceDocs(docsRoot)
  generateConfigReferenceDocs(docsRoot)
  generateTemplateStringReferenceDocs(docsRoot)
}

if (require.main === module) {
  generateDocs(argv[2])
}
