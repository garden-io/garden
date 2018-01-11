import { padEnd } from "lodash"

import "colors"

export function log(context: string, message: string) {
  const contextStr = `[${padEnd(context, 20)}] `
  console.log(contextStr + message.gray)
}

export function logException(error: Error) {
  console.error((error.stack && error.stack.red) || (error.toString().red))
}
