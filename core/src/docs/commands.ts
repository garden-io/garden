/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { readFileSync, writeFileSync } from "fs"
import handlebars from "handlebars"
import { resolve } from "path"
import { globalOptions } from "../cli/params"
import { getCoreCommands } from "../commands/commands"
import { describeParameters, CommandGroup } from "../commands/base"
import { TEMPLATES_DIR, renderConfigReference } from "./config"

export function writeCommandReferenceDocs(docsRoot: string) {
  const referenceDir = resolve(docsRoot, "reference")
  const outputPath = resolve(referenceDir, "commands.md")

  const commands = getCoreCommands()
    .flatMap((cmd) => {
      if (cmd instanceof CommandGroup && cmd.subCommands?.length) {
        return cmd
          .getSubCommands()
          .filter((c) => !c.hidden)
          .map((c) => c.describe())
      } else {
        return cmd.hidden ? [] : [cmd.describe()]
      }
    })
    .map((desc) => ({
      ...desc,
      outputsYaml: desc.outputsSchema
        ? renderConfigReference(desc.outputsSchema(), {
            normalizeOpts: { renderPatternKeys: true },
            yamlOpts: { renderRequired: false, renderFullDescription: true, renderValue: "none" },
          }).yaml
        : null,
    }))

  const templatePath = resolve(TEMPLATES_DIR, "commands.hbs")
  handlebars.registerPartial("argType", "{{#if choices}}{{#each choices}}`{{.}}` {{/each}}{{else}}{{type}}{{/if}}")
  const template = handlebars.compile(readFileSync(templatePath).toString())
  const markdown = template({ commands, globalOptions: describeParameters(globalOptions) })

  writeFileSync(outputPath, markdown)
}
