/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import handlebars = require("handlebars")
import { resolve } from "path"
import { writeCommandReferenceDocs } from "./commands"
import { TEMPLATES_DIR, renderProjectConfigReference, renderConfigReference } from "./config"
import { writeTemplateStringReferenceDocs } from "./template-strings"
import { writeTableOfContents } from "./table-of-contents"
import { Garden } from "../garden"
import { defaultDotIgnoreFile } from "../util/fs"
import { keyBy } from "lodash"
import { writeFileSync, readFile, writeFile, mkdirp } from "fs-extra"
import { renderModuleTypeReference, moduleTypes } from "./module-type"
import { renderProviderReference } from "./provider"
import { defaultEnvironment, defaultNamespace } from "../config/project"
import { GardenPlugin, GardenPluginReference } from "../plugin/plugin"
import { workflowConfigSchema } from "../config/workflow"
import { moduleTemplateSchema } from "../config/module-template"
import { renderActionTypeReference } from "./action-type"
import { ActionKind } from "../plugin/action-types"
import { DEFAULT_API_VERSION } from "../constants"

/* eslint-disable no-console */

export async function generateDocs(targetDir: string, plugins: GardenPluginReference[]) {
  const docsRoot = resolve(process.cwd(), targetDir)

  console.log("Updating command references...")
  writeCommandReferenceDocs(docsRoot)
  console.log("Updating config references...")
  await writeConfigReferenceDocs(
    docsRoot,
    plugins.map((p) => p.callback())
  )
  console.log("Updating template string reference...")
  writeTemplateStringReferenceDocs(docsRoot)
  console.log("Generating table of contents...")
  await writeTableOfContents(docsRoot, "README.md")
}

export async function writeConfigReferenceDocs(docsRoot: string, plugins: GardenPlugin[]) {
  const referenceDir = resolve(docsRoot, "reference")

  const providers = [
    { name: "conftest" },
    { name: "conftest-container" },
    { name: "conftest-kubernetes" },
    { name: "container" },
    { name: "exec" },
    { name: "hadolint" },
    { name: "jib" },
    { name: "kubernetes" },
    { name: "local-kubernetes" },
    { name: "octant" },
    { name: "terraform" },
    { name: "pulumi" },
  ]
  const garden = await Garden.factory(__dirname, {
    commandInfo: { name: "generate-docs", args: {}, opts: {} },
    config: {
      path: __dirname,
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "generate-docs",
      defaultEnvironment,
      dotIgnoreFile: defaultDotIgnoreFile,
      variables: {},
      environments: [
        {
          name: "default",
          defaultNamespace,
          variables: {},
        },
      ],
      providers,
    },
    plugins,
  })

  const providerDir = resolve(docsRoot, "reference", "providers")
  const allPlugins = await garden.getAllPlugins()
  const pluginsByName = keyBy(allPlugins, "name")
  const providersReadme = ["---", "order: 1", "title: Providers", "---", "", "# Providers", ""]

  for (const plugin of plugins) {
    const name = plugin.name

    const path = resolve(providerDir, `${name}.md`)
    console.log("->", path)
    writeFileSync(path, renderProviderReference(name, plugin, pluginsByName))
  }

  for (const provider of providers) {
    providersReadme.push(`* [\`${provider.name}\`](./${provider.name}.md)`)
  }

  writeFileSync(resolve(providerDir, `README.md`), providersReadme.join("\n"))

  // Render module types
  const actionTypeDir = resolve(docsRoot, "reference", "action-types")
  await mkdirp(actionTypeDir)
  const actionsReadme = ["---", "order: 2", "title: Action Types", "---", "", "# Action Types", ""]
  const actionTypeDefinitions = await garden.getActionTypes()

  for (const [kind, types] of Object.entries(actionTypeDefinitions)) {
    actionsReadme.push(`* \`kind\``)
    for (const [type, definition] of Object.entries(types)) {
      const dir = resolve(actionTypeDir, kind)
      await mkdirp(dir)
      const path = resolve(dir, `${type}.md`)

      console.log("->", path)
      await writeFile(path, renderActionTypeReference(kind as ActionKind, type, definition))

      actionsReadme.push(`  * [\`${type}\`](./${kind}/${type}.md)`)
    }
  }

  await writeFile(resolve(actionTypeDir, `README.md`), actionsReadme.join("\n"))

  // Render module types
  const moduleTypeDir = resolve(docsRoot, "reference", "module-types")
  const moduleReadme = ["---", "order: 3", "title: Module Types", "---", "", "# Module Types", ""]
  const moduleTypeDefinitions = await garden.getModuleTypes()

  for (const { name } of moduleTypes) {
    const path = resolve(moduleTypeDir, `${name}.md`)

    console.log("->", path)
    writeFileSync(path, renderModuleTypeReference(name, moduleTypeDefinitions))

    moduleReadme.push(`* [\`${name}\`](./${name}.md)`)
  }

  writeFileSync(resolve(moduleTypeDir, `README.md`), moduleReadme.join("\n"))

  // Render other config file references
  async function renderConfigTemplate(configType: string, context: any) {
    const templateData = await readFile(resolve(TEMPLATES_DIR, configType + "-config.hbs"))
    const template = handlebars.compile(templateData.toString())

    const targetPath = resolve(referenceDir, configType + "-config.md")
    console.log("->", targetPath)
    await writeFile(targetPath, template(context))
  }

  await renderConfigTemplate("project", renderProjectConfigReference())
  await renderConfigTemplate("workflow", renderConfigReference(workflowConfigSchema()))
  await renderConfigTemplate("module-template", renderConfigReference(moduleTemplateSchema()))
}
