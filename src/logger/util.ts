import { flatten } from "lodash"

import { LogOpts } from "./types"

interface Node {
  children: any[]
}

type LogOptsResolvers = {[K in keyof LogOpts]?: Function}

// TODO Tail call optimization?
export function getNodeListFromTree<T extends Node>(node: T): T[] {
  let arr: T[] = []
  arr.push(node)
  if (node.children.length === 0) {
    return arr
  }
  return arr.concat(flatten(node.children.map(child => getNodeListFromTree(child))))
}

export function traverseTree<T extends Node>(root: T, visitNode: Function): void {
  let stack: any[] = []
  stack.push(root)

  while (stack.length !== 0) {
    const node = stack.pop()
    visitNode(node)
    if (node.children.length !== 0) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i])
      }
    }
  }
}

function mergeWithResolvers(objA: any, objB: any, resolvers: any = {}) {
  const returnObj = { ...objA, ...objB }
  return Object.keys(resolvers).reduce((acc, key) => {
    acc[key] = resolvers[key](objA, objB)
    return acc
  }, returnObj)
}

export function mergeLogOpts(prevOpts: LogOpts, nextOpts: LogOpts, resolvers: LogOptsResolvers) {
  return mergeWithResolvers(prevOpts, nextOpts, resolvers)
}

export function duration(startTime: number): string {
  return ((Date.now() - startTime) / 1000).toFixed(2)
}

interface StreamWriteExtraParam {
  skipIntercept?: boolean
}

// Override the write method so that it accepts and extra param.
// Used by FancyLogger so that writes from other sources can be intercepted
// and pushed to the log stack. Writes from the logger itself are then applied as usual.
// TODO Causes TS errors.
export function interceptStream(stream: NodeJS.WritableStream, callback: Function) {
  const prevWrite = stream.write

  // @ts-ignore
  stream.write = (write =>
    (
      string: string,
      encoding?: string,
      cb?: Function,
      extraParam?: StreamWriteExtraParam,
    ): boolean => {
      if (extraParam && extraParam.skipIntercept) {
        const args = [string, encoding, cb]
        return write.apply(stream, args)
      }
      callback(string)
      return true
    })(stream.write)

  // Restore write method
  return function release() {
    stream.write = prevWrite
  }
}
