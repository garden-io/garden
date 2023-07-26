import { isPlainObject } from "lodash"
import { LineCounter, Parser, Composer, Document, ParsedNode, Scalar } from "yaml"
import { z, infer as inferZodType, SafeParseReturnType, ZodIssue, ZodError } from "zod"

const gardenConfigFile = z.object({
  kind: z.string(),
  name: z.string(),
  description: z.string().optional()
})

const gardenProjectConfig = gardenConfigFile.extend({
  kind: z.literal("Project"),
  environments: z.array(z.object({
    name: z.string(),
    defaultNamespace: z.string().optional(),
    production: z.boolean().optional().default(false)
  }))
})

const gardenActionConfig = gardenConfigFile.extend({
  kind: z.union([z.literal("Build"), z.literal("Deploy"), z.literal("Run"), z.literal("Test")])
})


const gardenBuildActionConfig = gardenActionConfig.extend({
  kind: z.literal("Build"),
  type: z.string(),
})

const gardenDeployActionConfig = gardenActionConfig.extend({
  kind: z.literal("Deploy"),
})

const gardenRunActionConfig = gardenActionConfig.extend({
  kind: z.literal("Run")
})

const gardenTestActionConfig = gardenActionConfig.extend({
  kind: z.literal("Test")
})

const gardenConfigs = z.discriminatedUnion("kind", [
  gardenProjectConfig,
  gardenBuildActionConfig,
  gardenDeployActionConfig,
  gardenRunActionConfig,
  gardenTestActionConfig
])

const INVALID_YAML = `
kind: Project
name: garden-enterprise
environments:
  - name: local
    defaultNamespace: true
    production: "nope"

---

kind: Build
type: 0
`

const VALID_YAML = `
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

type YamlContext = {
  filePath: string
  content: string
  location?: {
    start: { line: number; col: number }
    end: { line: number; col: number }
    length: number
  }
}

declare module "zod" {
  interface ZodError {
    yamlContextMap?: Map<ZodIssue, YamlContext>
    addYamlContext: (issue: ZodIssue, context: YamlContext) => void
    getYamlContext: (issue: ZodIssue) => YamlContext | undefined
  }
}

ZodError.prototype.addYamlContext = function (issue: ZodIssue, context: YamlContext) {
  if (!this.yamlContextMap) {
    this.yamlContextMap = new Map<ZodIssue, YamlContext>()
  }
  this.yamlContextMap.set(issue, context)
}

ZodError.prototype.getYamlContext = function (issue: ZodIssue) {
  return this.yamlContextMap?.get(issue)
}

function getKey(path: (string | number)[]): string {
  const [first, ...rest] = path

  let key = `"${first}"`

  for (const s of rest) {
    key = `${key}."${s}"`
  }

  return key
}

class ContextAwareObject<T> {
  public readonly object: T
  private contextMap: Map<string, YamlContext>

  constructor(object: T, contextMap: Map<string, YamlContext>) {
    this.object = object
    this.contextMap = contextMap
  }

  public validated<Schema extends z.ZodTypeAny, ParsedType = inferZodType<Schema>>(
    schema: Schema
  ): ContextAwareObject<ParsedType> | ZodError<Schema> {
    const parseResult = schema.safeParse(this.object)

    if (!parseResult.success) {
      const { error } = parseResult
      for (const issue of error.issues) {
        const path = getKey(issue.path)
        const context = this.contextMap.get(path)

        if (context) {
          error.addYamlContext(issue, context)
        }
      }
      return error
    } else {
      return new ContextAwareObject(parseResult.data, this.contextMap)
    }
  }

  static fromYamlFile({
    content,
    filePath,
  }: {
    content: string
    filePath: string
  }): (ContextAwareObject<any>)[] {
    const lineCounter = new LineCounter()
    const parser = new Parser(lineCounter.addNewLine)

    const tokens = parser.parse(content)
    const docsGenerator = new Composer().compose(tokens)

    const docs = Array.from(docsGenerator) as Document.Parsed<ParsedNode>[]

    const docWithError = docs.find((doc) => doc.errors.length > 0)

    // If there is an error, throw it
    if (docWithError) {
      throw docWithError.errors[0]
    }

    return docs.map((doc) => {
      const object = doc.toJS()
      const contextMap = new Map<string, YamlContext>()

      const baseContext: YamlContext = {
        filePath,
        content,
      }

      const resolveContext = (path: (string | number)[], object: any): void => {
        if (Array.isArray(object)) {
          for (const [index, o] of object.entries()) {
            resolveContext([...path, index], o)
          }
        }
        if (isPlainObject(object)) {
          for (const [key, o] of Object.entries(object)) {
            resolveContext([...path, key], o)
          }
        }

        const node = doc.getIn(path, true) as Scalar
        const context = { ...baseContext }

        if (node && node.range) {
          const [rangeStart, rangeEnd] = node.range
          const length = rangeEnd - rangeStart
          const startPos = lineCounter.linePos(rangeStart)
          const endPos = lineCounter.linePos(rangeEnd)

          context.location = {
            start: startPos,
            end: endPos,
            length,
          }
        }

        contextMap.set(getKey(path), context)
      }

      resolveContext([], object)

      console.log(contextMap)
      return new ContextAwareObject(object, contextMap)
    })
  }
}

class YamlConfigParser<Schema extends z.ZodTypeAny, ParsedType = inferZodType<Schema>> {
  private schema: Schema

  constructor(schema: Schema) {
    this.schema = schema
  }

  public safeParse(content: string, filePath: string): SafeParseReturnType<any, ParsedType>[] {
    const lineCounter = new LineCounter()
    const parser = new Parser(lineCounter.addNewLine)

    const tokens = parser.parse(content)
    const docsGenerator = new Composer().compose(tokens)

    const docs = Array.from(docsGenerator) as Document.Parsed<ParsedNode>[]

    const docWithError = docs.find((doc) => doc.errors.length > 0)

    // If there is an error, throw it
    if (docWithError) {
      throw docWithError.errors[0]
    }

    return docs.map((doc) => {
      const result = this.schema.safeParse(doc.toJS())

      if (!result.success) {
        const { error } = result
        for (const issue of error.issues) {
          const context: YamlContext = {
            filePath,
            content
          }

          const path = issue.path
          const node = doc.getIn(path, true) as Scalar

          if (node && node.range) {
            const [rangeStart, rangeEnd] = node.range
            const length = rangeEnd - rangeStart
            const startPos = lineCounter.linePos(rangeStart)
            const endPos = lineCounter.linePos(rangeEnd)

            context.location = {
              start: startPos,
              end: endPos,
              length,
            }
          }

          error.addYamlContext(issue, context)
        }
      }

      return result
    })
  }
}

// const parser = new YamlConfigParser(gardenConfigs)

// const parsed = parser.safeParse(YAML, "/some/fake/file.yaml")

// for (const result of parsed) {
//   if (!result.success) {
//     const error = result.error
//     for (const issue of error.issues) {
//       console.log(issue)
//       console.log(error.getYamlContext(issue))
//     }
//   }
// }

const contextObjects = ContextAwareObject.fromYamlFile({
  content: VALID_YAML,
  filePath: "/some/fake/file.yaml",
})

console.log(contextObjects[1].validated(gardenConfigs))
