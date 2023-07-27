import chalk from "chalk"
import sliceAnsi from "slice-ansi"
import { highlightYaml } from "../../util/serialization"
import { dedent } from "../../util/string"
import stripAnsi from "strip-ansi"

export type YamlContext = {
  filePath: string
  content: string
  location?: {
    start: { line: number; col: number }
    end: { line: number; col: number }
    length: number
  }
}

export function extractContextLines(input: string, location: NonNullable<YamlContext["location"]>, context: number): string {
  const lines = input.split("\n")
  const { start, end } = location
  const startLine = Math.max(1, start.line - context)
  const endLine = Math.min(lines.length, end.line + context)

  const contextLines = lines.slice(startLine - 1, endLine)
  return contextLines.join("\n")
}

export function errorHighlightLines(input: string, location: NonNullable<YamlContext["location"]>): string {
  const lines = input.split("\n")
  const { start, end } = location

  const startLine = start.line - 1
  const endLine = end.line - 1

  const startCol = start.col - 1
  const endCol = end.col - 1

  for (let lineIndex = startLine; lineIndex <= endLine; lineIndex++) {
    const line = lines[lineIndex]

    const highlightEndCol = lineIndex === endLine ? endCol : line.length

    // In some multi line strings, it may happen that the end line has an end col index of 0
    // In that case we just ignore it
    if (highlightEndCol === 0) {
      continue
    }

    let highlightStartCol = lineIndex === startLine ? startCol : 0
    // Ansi code might start at the beginning of the line so we ignore it for finding the whitespace
    const leadingWhitespaceInLineMatch = stripAnsi(line).match(/^(\s*)/)
    const leadingWhitespaceInLine = leadingWhitespaceInLineMatch ? leadingWhitespaceInLineMatch[0] : ""

    if (leadingWhitespaceInLine.length > highlightStartCol) {
      highlightStartCol = leadingWhitespaceInLine.length
    }

    let before = sliceAnsi(line, 0, highlightStartCol)
    let highlight = sliceAnsi(line, highlightStartCol, highlightEndCol)
    let after = sliceAnsi(line, highlightEndCol)

    lines[lineIndex] = `${before}${chalk.bgRed(highlight)}${after}`
  }
  return lines.join("\n")
}

export function renderYamlContext(context: YamlContext): string {
  let location = context.location
    ? dedent`
    ${
      context.location.start.line === context.location.end.line
        ? `:${context.location.start.line + 1}`
        : `:${context.location.start.line + 1}-${context.location.end.line + 1}`
    }
  `
    : ""

  let string = dedent`
    ${context.filePath}${location}
  `

  if (context.location) {
    const highlighted = highlightYaml(context.content)
    const underlined = errorHighlightLines(highlighted, context.location)

    const contextSize = 2
    const fileContext = extractContextLines(underlined, context.location, contextSize)

    const logLines = fileContext.split("\n")
    const logLinesWithLineNumbers = logLines.map(
      (line, index) => `${chalk.dim.italic(context.location!.start.line - contextSize + index + 1)} ${line}`
    )
    string += `\n${logLinesWithLineNumbers.join("\n")}\n`
  }
  return string
}
