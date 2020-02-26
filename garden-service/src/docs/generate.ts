/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import { writeCommandReferenceDocs } from "./commands"
import { renderBaseConfigReference } from "./config"
import { writeTemplateStringReferenceDocs } from "./template-strings"
import { writeTableOfContents } from "./table-of-contents"
import { Garden } from "../garden"
import { defaultDotIgnoreFiles } from "../util/fs"
import { keyBy } from "lodash"
import { writeFileSync } from "fs-extra"
import { renderModuleTypeReference, moduleTypes } from "./module-type"
import { renderProviderReference } from "./provider"

export async function generateDocs(targetDir: string) {
  // tslint:disable: no-console
  const docsRoot = resolve(process.cwd(), targetDir)

  console.log("Updating command references...")
  writeCommandReferenceDocs(docsRoot)
  console.log("Updating config references...")
  await writeConfigReferenceDocs(docsRoot)
  console.log("Updating template string reference...")
  writeTemplateStringReferenceDocs(docsRoot)
  console.log("Generating table of contents...")
  await writeTableOfContents(docsRoot, "README.md")
}

export async function writeConfigReferenceDocs(docsRoot: string) {
  // tslint:disable: no-console
  const referenceDir = resolve(docsRoot, "reference")
  const configPath = resolve(referenceDir, "config.md")

  const garden = await Garden.factory(__dirname, {
    config: {
      path: __dirname,
      apiVersion: "garden.io/v0",
      kind: "Project",
      name: "generate-docs",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      variables: {},
      environments: [
        {
          name: "default",
          variables: {},
        },
      ],
      providers: [
        { name: "conftest" },
        { name: "conftest-container" },
        { name: "conftest-kubernetes" },
        { name: "hadolint" },
        { name: "kubernetes" },
        { name: "local-kubernetes" },
        { name: "maven-container" },
        { name: "openfaas" },
        { name: "terraform" },
      ],
    },
  })

  const providerDir = resolve(docsRoot, "reference", "providers")
  const plugins = await garden.getPlugins()
  const pluginsByName = keyBy(plugins, "name")
  const providersReadme = ["---", "order: 1", "title: Providers", "---", "", "# Providers", ""]

  for (const plugin of plugins) {
    const name = plugin.name

    // Currently nothing to document for these
    if (name === "container" || name === "exec") {
      continue
    }

    const path = resolve(providerDir, `${name}.md`)
    console.log("->", path)
    writeFileSync(path, renderProviderReference(name, plugin, pluginsByName))

    providersReadme.push(`* [\`${name}\`](./${name}.md)`)
  }
  writeFileSync(resolve(providerDir, `README.md`), providersReadme.join("\n"))

  // Render module types
  const moduleTypeDir = resolve(docsRoot, "reference", "module-types")
  const readme = ["---", "order: 2", "title: Module Types", "---", "", "# Module Types", ""]
  const moduleTypeDefinitions = await garden.getModuleTypes()

  for (const { name } of moduleTypes) {
    const path = resolve(moduleTypeDir, `${name}.md`)

    console.log("->", path)
    writeFileSync(path, renderModuleTypeReference(name, moduleTypeDefinitions))

    readme.push(`* [\`${name}\`](./${name}.md)`)
  }

  writeFileSync(resolve(moduleTypeDir, `README.md`), readme.join("\n"))

  // Render base config docs
  console.log("->", configPath)
  writeFileSync(configPath, renderBaseConfigReference())
}
