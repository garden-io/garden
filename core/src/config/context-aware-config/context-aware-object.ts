import { isPlainObject } from "lodash"
import { LineCounter, Parser, Composer, Document, ParsedNode, Scalar } from "yaml"
import { z, infer as inferZodType, ZodIssue, ZodError } from "zod"
import { YamlContext } from "./yaml-context"


export type TypeNarrowingFunction<Input, Output extends Input> = (input: Input) => input is Output

export type SchemaValidationError<Schema extends z.ZodTypeAny> = {
  issueToContextMap: Map<ZodIssue, YamlContext>
  error: ZodError<Schema>
}

export type ValidationResult<T, Schema extends z.ZodTypeAny> =
  | {
      valid: true
      value: T
    }
  | {
      valid: false
      error: SchemaValidationError<Schema>
    }

export class ContextAwareObject<T> {
  public readonly object: T
  private contextMap: Map<string, YamlContext>

  constructor(object: T, contextMap: Map<string, YamlContext>) {
    this.object = object
    this.contextMap = contextMap
  }

  /**
   * Gets the object under the specified key and returns a new `ContextAwareObject` for it.
   * This can be useful if you need to pass just a subset of data to some components
   * but still would like to keep the contextual information available in case the component does some validation too.
   * @param key The key from where to pick the sub object
   * @returns The sub object wraped in a `ContextAwareObject`
   */
  public get<Key extends keyof T>(key: Key): ContextAwareObject<T[Key]> {
    const subObject = this.object[key]
    const subContextMap = new Map<string, YamlContext>()
    for (const [contextKey, context] of this.contextMap.entries()) {
      const keyArray = ContextAwareObject.parseKey(contextKey)
      const [mainKey, ...subKeys] = keyArray
      if (mainKey === key) {
        subContextMap.set(ContextAwareObject.getKey(subKeys), context)
      }
    }

    return new ContextAwareObject(subObject, subContextMap)
  }

  /**
   * Validates the object against a given Zod schema and returns a new `ContextAwareObject` of the validated type.
   * In case of an error, the error is returned together with a map to get the `YamlContext` based on the `ZodIssue`
   * @param schema Zod schema to validate against
   * @returns `ValidationResult` containing either errors or the validated and parsed object
   */
  public validated<Schema extends z.ZodTypeAny, ParsedType = inferZodType<Schema>>(
    schema: Schema
  ): ValidationResult<ContextAwareObject<ParsedType>, Schema> {
    const parseResult = schema.safeParse(this.object)

    if (!parseResult.success) {
      const { error } = parseResult
      const issueToContextMap = new Map<ZodIssue, YamlContext>()

      for (const issue of error.issues) {
        const path = ContextAwareObject.getKey(issue.path)
        const context = this.contextMap.get(path)

        if (context) {
          issueToContextMap.set(issue, context)
        } else {
          // If there is no context there should be a parent context unless we are at the root
          // Mostly the case of a missing context would be if for example a required parameter was missing
          // Since the absence of something has no actual place in the code, the natural thing to highlight would be the encompassing object
          const parentPath = issue.path.slice(0, -1)
          const parentContext = this.contextMap.get(ContextAwareObject.getKey(parentPath))
          if (parentContext) {
            issueToContextMap.set(issue, parentContext)
          }
        }
      }

      return {
        valid: false,
        error: {
          issueToContextMap,
          error,
        },
      }
    } else {
      return {
        valid: true,
        value: new ContextAwareObject(parseResult.data, this.contextMap),
      }
    }
  }

  /**
   * The validation schema may be a Union or Discriminated Union type
   * This utility method allows to pass a type narrowing callback for the underlying object
   * to then narrow the type of the ContextAwareObject
   *
   * Usage:
   * ```
   * const isProject = maybeProject.narrowType((o): o is ProjectConfig => o.kind === "Project")
   * if (isProject) {
   *   // Types now correctly inferred
   *   const environments = maybeProject.object.environments
   * }
   * ```
   *
   * @param fn Type narrowing function.
   * It is necessary to type the return type of the function as a type predicate since it cannot be inferred from a pure `boolean` return type
   * Example:
   * ```
   * (obj): o is ProjectConfig => o.kind === "Project"
   * ```
   * @returns Boolean stating whether the object is of the given type
   */
  public narrowType<OutputType extends T>(
    fn: TypeNarrowingFunction<T, OutputType>
  ): this is ContextAwareObject<OutputType> {
    const isSubtype = fn(this.object)
    if (isSubtype) {
      return true
    } else {
      return false
    }
  }

  static fromYamlFile({ content, filePath }: { content: string; filePath: string }): ContextAwareObject<any>[] {
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

      const resolveContext = (path: (string | number | symbol)[], object: any): void => {
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

        contextMap.set(ContextAwareObject.getKey(path), context)
      }

      resolveContext([], object)

      return new ContextAwareObject(object, contextMap)
    })
  }

  static getKey(path: (string | number | symbol)[]): string {
    // This is most certainly not the fastest way,
    // but it easily solves the issue of keys containing characters
    // that might mess up the path mapping and cause duplicates
    //
    // We only need this method when we parse an object initially
    // or when an error happens so it's not really on the hot path of anything
    return JSON.stringify(path)
  }

  static parseKey(key: string): (string | number)[] {
    return JSON.parse(key)
  }
}
