/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { readFileSync, writeFileSync } from "fs"
import handlebars from "handlebars"
import { resolve } from "path"
import { GLOBAL_OPTIONS } from "../cli/cli"
import { coreCommands } from "../commands/commands"
import { flatten } from "lodash"
import { describeParameters } from "../commands/base"
import { TEMPLATES_DIR } from "./config"

export function writeCommandReferenceDocs(docsRoot: string) {
  const referenceDir = resolve(docsRoot, "reference")
  const outputPath = resolve(referenceDir, "commands.md")

  const commands = flatten(
    coreCommands.map((cmd) => {
      if (cmd.subCommands && cmd.subCommands.length) {
        return cmd.subCommands.map((subCommandCls) => new subCommandCls(cmd).describe())
      } else {
        return [cmd.describe()]
      }
    })
  )

  const globalOptions = describeParameters(GLOBAL_OPTIONS)

  const templatePath = resolve(TEMPLATES_DIR, "commands.hbs")
  handlebars.registerPartial("argType", "{{#if choices}}{{#each choices}}`{{.}}` {{/each}}{{else}}{{type}}{{/if}}")
  const template = handlebars.compile(readFileSync(templatePath).toString())
  const markdown = template({ commands, globalOptions })

  writeFileSync(outputPath, markdown)
}
