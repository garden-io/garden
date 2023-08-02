import { z, infer as inferZodType } from "zod"
import { ContextAwareObject } from "./context-aware-object"
import { renderYamlContext } from "./yaml-context"
import { dedent } from "../../util/string"

const gardenConfigFile = z.object({
  kind: z.string(),
  name: z.string(),
  description: z.string().optional(),
})

const gardenProjectConfig = gardenConfigFile.extend({
  kind: z.literal("Project"),
  environments: z.array(
    z.object({
      name: z.string(),
      defaultNamespace: z.string().optional(),
      production: z.boolean().optional().default(false),
    })
  ),
})

type ProjectConfig = inferZodType<typeof gardenProjectConfig>
const objectIsProject = (obj): obj is ProjectConfig => obj.kind === "Project"

const gardenActionConfig = gardenConfigFile.extend({
  kind: z.union([z.literal("Build"), z.literal("Deploy"), z.literal("Run"), z.literal("Test")]),
})

const gardenBuildActionConfig = gardenActionConfig.extend({
  kind: z.literal("Build"),
  type: z.string(),
})

const gardenDeployActionConfig = gardenActionConfig.extend({
  kind: z.literal("Deploy"),
})

const gardenRunActionConfig = gardenActionConfig.extend({
  kind: z.literal("Run"),
})

const gardenTestActionConfig = gardenActionConfig.extend({
  kind: z.literal("Test"),
})

const gardenConfigs = z.discriminatedUnion("kind", [
  gardenProjectConfig,
  gardenBuildActionConfig,
  gardenDeployActionConfig,
  gardenRunActionConfig,
  gardenTestActionConfig,
])

const INVALID_YAML = dedent`
kind: Project
name: garden-enterprise
environments:
  - name: local
    defaultNamespace: true # Comment is not highlighted
    production: |
      nope
      not correct
    somethingelse: true
---

kind: Build
type: 0
`

const VALID_YAML = dedent`
kind: Project
name: garden-enterprise
environments:
  - name: local
    defaultNamespace: dev
    production: false

---

kind: Build
type: docker
name: docker-build
broken"stuff: test
`

const contextObjects = ContextAwareObject.fromYamlFile({
  content: INVALID_YAML,
  filePath: "/some/fake/file.yaml",
})

const validatedObjects = contextObjects.map((obj) => obj.validated(gardenConfigs))

for (const object of validatedObjects) {
  if (object.valid) {
    const value = object.value
    const isProject = value.narrowType(objectIsProject)
    if (isProject) {
      const envs = value.get("environments")
      console.log(envs)
    }
  } else {
    const error = object.error
    for (const issue of error.error.issues) {
      const context = error.issueToContextMap.get(issue)
      console.log(issue.message)
      if (context) {
        console.log(renderYamlContext(context))
      }
    }
  }
}
