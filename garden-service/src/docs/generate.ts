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
import { writeTemplateStringReferenceDocs } from "./template-strings"

export async function generateDocs(targetDir: string) {
  const docsRoot = resolve(process.cwd(), targetDir)

  console.log("Updating command references...")
  writeCommandReferenceDocs(docsRoot)
  console.log("Updating config references...")
  await writeConfigReferenceDocs(docsRoot)
  console.log("Updating template string reference...")
  writeTemplateStringReferenceDocs(docsRoot)
}
