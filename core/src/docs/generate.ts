/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import handlebars from "handlebars"
import { dirname, resolve } from "node:path"
import { writeCommandReferenceDocs } from "./commands.js"
import { renderConfigReference, renderProjectConfigReference, TEMPLATES_DIR } from "./config.js"
import { writeTemplateStringReferenceDocs } from "./template-strings.js"
import { writeTableOfContents } from "./table-of-contents.js"
import { Garden } from "../garden.js"
import { defaultDotIgnoreFile } from "../util/fs.js"
import { keyBy } from "lodash-es"
import fsExtra from "fs-extra"
import { moduleTypes, renderModuleTypeReference } from "./module-type.js"
import { renderProviderReference } from "./provider.js"
import { defaultEnvironment, defaultNamespace } from "../config/project.js"
import type { GardenPluginReference, GardenPluginSpec } from "../plugin/plugin.js"
import { workflowConfigSchema } from "../config/workflow.js"
import { configTemplateSchema } from "../config/config-template.js"
import { renderActionTypeReference } from "./action-type.js"
import type { ActionKind } from "../plugin/action-types.js"
import { renderTemplateConfigSchema } from "../config/render-template.js"
import { pMemoizeClearAll } from "../lib/p-memoize.js"
import { makeDocsLinkOpts } from "./common.js"
import { defaultGardenApiVersion } from "../constants.js"
import { actionKinds } from "../actions/types.js"
import { fileURLToPath } from "node:url"
import dedent from "dedent"
import type { ApiV1Deprecations, ApiV2Deprecations } from "../util/deprecations.js"
import { getApiV1Deprecations, getApiV2Deprecations } from "../util/deprecations.js"

const { writeFileSync, readFile, writeFile, mkdirp } = fsExtra

const moduleDirName = dirname(fileURLToPath(import.meta.url))

/* eslint-disable no-console */

export async function generateDocs(targetDir: string, getPlugins: () => (GardenPluginSpec | GardenPluginReference)[]) {
  const docsRoot = resolve(process.cwd(), targetDir)

  console.log("Updating command references...")
  writeCommandReferenceDocs(docsRoot)
  console.log("Updating config references...")
  await writeConfigReferenceDocs(docsRoot, getPlugins)
  console.log("Updating template string reference...")
  writeTemplateStringReferenceDocs(docsRoot)
  console.log("Generating table of contents...")
  await writeTableOfContents(docsRoot, "README.md")
  console.log("Updating the deprecation guide...")
  await updateDeprecationGuide(docsRoot, "guides/deprecations.md")
}

export async function writeConfigReferenceDocs(
  docsRoot: string,
  getPlugins: () => (GardenPluginSpec | GardenPluginReference)[]
) {
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
  const getFreshGarden = async () => {
    return await Garden.factory(moduleDirName, {
      commandInfo: { name: "generate-docs", args: {}, opts: {} },
      config: {
        path: moduleDirName,
        apiVersion: defaultGardenApiVersion,
        kind: "Project",
        name: "generate-docs",
        internal: {
          basePath: moduleDirName,
        },
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
      plugins: getPlugins(),
    })
  }

  const providerDir = resolve(docsRoot, "reference", "providers")
  makeDocsLinkOpts.GARDEN_RELATIVE_DOCS_PATH = "../../"
  const allPlugins = await (await getFreshGarden()).getAllPlugins()
  const skippedPlugins = ["templated", "openshift"]
  const pluginsByName = keyBy(allPlugins, "name")
  const providersReadme = ["---", "order: 1", "title: Providers", "---", "", "# Providers", ""]

  for (const plugin of allPlugins) {
    const name = plugin.name

    if (skippedPlugins.includes(plugin.name)) {
      continue
    }

    const path = resolve(providerDir, `${name}.md`)
    console.log("->", path)
    writeFileSync(path, renderProviderReference(name, plugin, pluginsByName))
  }

  for (const provider of providers) {
    providersReadme.push(`* [\`${provider.name}\`](./${provider.name}.md)`)
  }

  writeFileSync(resolve(providerDir, `README.md`), providersReadme.join("\n"))
  pMemoizeClearAll()

  // Render action types
  const actionTypeDir = resolve(docsRoot, "reference", "action-types")
  makeDocsLinkOpts.GARDEN_RELATIVE_DOCS_PATH = "../../../"
  await mkdirp(actionTypeDir)
  const actionsReadme = ["---", "order: 2", "title: Action Types", "---", "", "# Action Types", ""]
  const actionTypeDefinitions = await (await getFreshGarden()).getActionTypes()

  for (const [kind, types] of Object.entries(actionTypeDefinitions)) {
    actionsReadme.push(`* [${kind}](./${kind}/README.md)`)
    for (const [type, definition] of Object.entries(types)) {
      const dir = resolve(actionTypeDir, kind)
      await mkdirp(dir)
      const path = resolve(dir, `${type}.md`)

      console.log("->", path)
      if (!!definition) {
        await writeFile(path, renderActionTypeReference(kind as ActionKind, type, definition.spec))
      }

      actionsReadme.push(`  * [\`${type}\`](./${kind}/${type}.md)`)
    }
  }

  // Render action-kind readmes
  actionKinds.forEach(async (kind, i) => {
    const dir = resolve(actionTypeDir, kind)
    const actionTypeReadme = ["---", `order: ${i + 1}`, `title: ${kind}`, "---", "", `# ${kind} Actions`, ""]
    for (const [type] of Object.entries(actionTypeDefinitions[kind])) {
      actionTypeReadme.push(`  * [\`${type}\`](./${type}.md)`)
    }
    actionTypeReadme.push("")
    await writeFile(resolve(dir, `README.md`), actionTypeReadme.join("\n"))
  })

  await writeFile(resolve(actionTypeDir, `README.md`), actionsReadme.join("\n"))
  pMemoizeClearAll()

  // Render module types
  const moduleTypeDir = resolve(docsRoot, "reference", "module-types")
  makeDocsLinkOpts.GARDEN_RELATIVE_DOCS_PATH = "../../"
  const moduleReadme = ["---", "order: 101", "title: Module Types", "---", "", "# Module Types (deprecated)", ""]

  const deprecationWarning = `
  {% hint style="warning" %}
  Modules are deprecated and will be removed in version \`0.14\`. Please use [action](../../using-garden/actions.md)-based configuration instead. See the [0.12 to Bonsai migration guide](../../guides/migrating-to-bonsai.md) for details.
  {% endhint %}
  `
  moduleReadme.push(deprecationWarning)
  const moduleTypeDefinitions = await (await getFreshGarden()).getModuleTypes()

  for (const { name } of moduleTypes) {
    const path = resolve(moduleTypeDir, `${name}.md`)

    console.log("->", path)
    writeFileSync(path, renderModuleTypeReference(name, moduleTypeDefinitions))

    moduleReadme.push(`* [\`${name}\`](./${name}.md)`)
  }

  writeFileSync(resolve(moduleTypeDir, `README.md`), moduleReadme.join("\n"))
  pMemoizeClearAll()

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
  await renderConfigTemplate("config-template", renderConfigReference(configTemplateSchema()))
  await renderConfigTemplate("render-template", renderConfigReference(renderTemplateConfigSchema()))
}

const deprecationHeaderStyle = (s: string) => `\`${s}\``

function getBreakingChanges(): string[] {
  // apply style for docs, using backticks instead of ansi codes
  const apiV1Deprecations = getApiV1Deprecations(deprecationHeaderStyle)
  return renderApiDeprecations("Breaking changes", apiV1Deprecations)
}

function getDeprecations(): string[] {
  // apply style for docs, using backticks instead of ansi codes
  const apiV2Deprecations = getApiV2Deprecations(deprecationHeaderStyle)
  return renderApiDeprecations("Deprecations", apiV2Deprecations)
}

function renderApiDeprecations(header: string, apiDeprecations: ApiV1Deprecations | ApiV2Deprecations) {
  const contexts = new Set<string>()
  for (const [_, { contextDesc }] of Object.entries(apiDeprecations)) {
    contexts.add(contextDesc)
  }

  const breakingChanges: string[] = [`# ${header}`]

  for (const context of contexts) {
    breakingChanges.push(`## ${context}`)

    const matchingDeprecations = Object.entries(apiDeprecations).filter(
      ([_, { contextDesc }]) => contextDesc === context
    )
    for (const [id, { hint, featureDesc, hintReferenceLink }] of matchingDeprecations) {
      breakingChanges.push(`<h3 id="${id}">${featureDesc}</h3>`)
      breakingChanges.push(hint)
      if (hintReferenceLink) {
        const linkPrefix = hintReferenceLink.link.startsWith("#") ? "" : "../"
        breakingChanges.push(
          `For more information, please refer to the [${hintReferenceLink.name}](${linkPrefix}${hintReferenceLink.link}).`
        )
      }
    }
  }

  return breakingChanges
}

async function updateDeprecationGuide(docsRoot: string, deprecationGuideFilename: string) {
  const guide = resolve(docsRoot, deprecationGuideFilename)
  const contents = (await readFile(guide)).toString()

  const marker = "<!-- DO NOT CHANGE BELOW - AUTO-GENERATED -->"

  const humanGenerated = contents.split(marker)[0]

  const breakingChanges = getBreakingChanges()
  const deprecations = getDeprecations()

  await writeFile(
    guide,
    dedent`
    ${humanGenerated.trimEnd()}

    ${marker}
    <!-- The sections below are auto-generated by \`npm run generate-docs\`. Any changes above these comments will be preserved. Make changes to deprecations in \`deprecations.ts\`. -->

    ${breakingChanges.join("\n\n")}

    ${deprecations.join("\n\n")}
    `
  )
}
