import { LineCounter, Parser, Composer, Document, ParsedNode, Scalar } from "yaml"
import { isPlainObject, get, cloneDeep } from "lodash"

export type YamlFileContext = {
  start: number
  end: number
  length: number
  absolutePath: string
}

export type YamlConfigOptions = {
  document: Document.Parsed<ParsedNode>
  filePath: string
  lineCounter: LineCounter
}

export class YamlConfig<T extends object = any> {
  private document: YamlConfigOptions["document"]
  private filePath: string
  private lineCounter: LineCounter

  // This object is mutable and can and will be changed over time
  // The reason is that many configs get enriched and updated
  // and otherwise one would have to continually wrap the object in a config object again.
  // When it gets read we wrap it in another proxy though to keep the context around
  private jsObject: T

  constructor({ lineCounter, document, filePath }: YamlConfigOptions) {
    this.document = document
    this.lineCounter = lineCounter
    this.filePath = filePath

    this.jsObject = document.toJS()

    return new Proxy(this, {
      get: (target, name) => {
        const objectKeys = new Set(Object.keys(this.jsObject))

        if (objectKeys.has(name.toString())) {
          return this.object[name]
        }

        return this[name]
      },
      ownKeys: (_target) => {
        const objectKeys = new Set(Object.keys(this.jsObject))
        return [...objectKeys]
      },
      getOwnPropertyDescriptor: (target, name) => {
        const objectKeys = new Set(Object.keys(this.jsObject))
        const yamlConfig = this
        return {
          get value() {
            if (objectKeys.has(name.toString())) {
              return yamlConfig.object[name]
            }

            return this[name]
          },
          configurable: true,
          enumerable: objectKeys.has(name.toString()) ? true : false,
        }
      },
      has: (_target, name) => {
        const objectKeys = new Set(Object.keys(this.jsObject))
        return objectKeys.has(name.toString())
      }
    })
  }

  public get object() {
    return this.makeYamlProxyObject([])
  }

  public set object(obj) {
    this.jsObject = obj
  }

  public getContextForPath(fullPath: (string | symbol | number)[]) {
    const node = this.document.getIn(fullPath, true) as Scalar
    const [rangeStart, rangeEnd] = node.range!
    const length = rangeEnd - rangeStart
    const startPos = this.lineCounter.linePos(rangeStart)
    const endPos = this.lineCounter.linePos(rangeEnd)

    return {
      start: startPos,
      end: endPos,
      length,
      absolutePath: this.filePath,
    }
  }

  public clone(): YamlConfig<T> {
    const newObject = new YamlConfig({
      lineCounter: this.lineCounter,
      document: this.document,
      filePath: this.filePath,
    })
    newObject.object = cloneDeep(this.jsObject)
    return newObject
  }

  private makeYamlProxyObject(currentPath: (string | number | symbol)[] = []) {
    const proxy = new Proxy(this.jsObject, {
      get: (_target, key) => {
        const keyString = key.toString()

        if (keyString === "__isYamlContextProxy") {
          return true
        }

        if (keyString === "__getContextForPath") {
          return this.getContextForPath.bind(this)
        }

        if (keyString.endsWith("__context")) {
          const cleanedKey = keyString.replace("__context", "")
          return this.getContextForPath([...currentPath, cleanedKey])
        }

        const value = get(this.jsObject, [...currentPath, key])
        const isDeeperObject = Array.isArray(value) || isPlainObject(value)

        if (isDeeperObject) {
          return this.makeYamlProxyObject([...currentPath, key])
        }

        return value
      },
    })
    return proxy
  }

  static parseYamlWithContext(content: string, filePath: string): YamlConfig[] {
    const lineCounter = new LineCounter()
    const parser = new Parser(lineCounter.addNewLine)

    const tokens = parser.parse(content)
    const docsGenerator = new Composer().compose(tokens)

    const docs = Array.from(docsGenerator) as any[]

    const docWithError = docs.find((doc) => doc.errors.length > 0)

    // If there is an error, throw it
    if (docWithError) {
      throw docWithError.errors[0]
    }

    return docs.map((doc) => {
      return new YamlConfig({
        document: doc,
        lineCounter,
        filePath,
      })
    })
  }

  static getYamlContextAtPath(object: any, path: (string | number | symbol)[]): YamlFileContext | undefined {
    if (object.__isYamlContextProxy) {
      return object.__getContextForPath(path)
    }
    return undefined
  }
}
