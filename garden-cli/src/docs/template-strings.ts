import { resolve } from "path"
import { renderSchemaDescription } from "./config"
import { ProjectConfigContext, ModuleConfigContext } from "../config/config-context"
import { readFileSync, writeFileSync } from "fs"
import * as handlebars from "handlebars"

export function generateTemplateStringReferenceDocs(docsRoot: string) {
  const referenceDir = resolve(docsRoot, "reference")
  const outputPath = resolve(referenceDir, "template-strings.md")

  const projectContext = renderSchemaDescription(ProjectConfigContext.getSchema().describe(), { required: false })
  const moduleContext = renderSchemaDescription(ModuleConfigContext.getSchema().describe(), { required: false })

  const templatePath = resolve(__dirname, "templates", "template-strings.hbs")
  const template = handlebars.compile(readFileSync(templatePath).toString())
  const markdown = template({ projectContext, moduleContext })

  writeFileSync(outputPath, markdown)
}

if (require.main === module) {
  generateTemplateStringReferenceDocs(resolve(__dirname, "..", "..", "..", "docs"))
}
