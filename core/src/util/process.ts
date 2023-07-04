import { ChildProcess } from "child_process"
import split2 from "split2"
import { RuntimeError } from "../exceptions"
import { PluginContext } from "../plugin-context"

export function streamLogs({ proc, name, ctx }: { proc: ChildProcess; name: string; ctx: PluginContext }): void {
  const logStream = split2()

  let stdout: string = ""
  let stderr: string = ""

  if (proc.stderr) {
    proc.stderr.pipe(logStream)
    proc.stderr.on("data", (data) => {
      stderr += data
    })
  }

  if (proc.stdout) {
    proc.stdout.pipe(logStream)
    proc.stdout.on("data", (data) => {
      stdout += data
    })
  }

  const logEventContext = {
    origin: name,
    level: "verbose" as const,
  }

  const logger = ctx.log.createLog({
    name
  })

  logStream.on("data", (line: Buffer) => {
    const logLine = line.toString()
    ctx.events.emit("log", { timestamp: new Date().toISOString(), msg: logLine, ...logEventContext })
    logger.silly(logLine)
  })
}

export function waitForProcess({ proc, errorPrefix }: { proc: ChildProcess; errorPrefix: string }): Promise<void> {
  const logStream = split2()

  let stdout: string = ""
  let stderr: string = ""

  if (proc.stderr) {
    proc.stderr.pipe(logStream)
    proc.stderr.on("data", (data) => {
      stderr += data
    })
  }

  if (proc.stdout) {
    proc.stdout.pipe(logStream)
    proc.stdout.on("data", (data) => {
      stdout += data
    })
  }

  return new Promise<void>((resolve, reject) => {
    proc.on("error", reject)
    proc.on("close", (code) => {
      if (code === 0) {
        resolve()
      } else {
        // Some commands (e.g. the pulumi CLI) don't log anything to stderr when an error occurs. To handle that,
        // we use `stdout` for the error output instead (in case information relevant to the user is included there).
        const errOutput = stderr.length > 0 ? stderr : stdout
        reject(
          new RuntimeError({
            message: `${errorPrefix}:\n${errOutput}`,
            detail: {
              stdout,
              stderr,
              code,
            },
          })
        )
      }
    })
  })
}

export function waitForLogLine({
  successLog,
  errorLog,
  process,
}: {
  successLog: string
  errorLog: string
  process: ChildProcess
}): Promise<void> {
  let stdOutString = ""
  let stdErrString = ""

  return new Promise((resolve, reject) => {
    function hasError(string: string): boolean {
      return stdOutString.includes(errorLog) || stdErrString.includes(errorLog)
    }

    function hasSuccess(string: string): boolean {
      return stdOutString.includes(successLog) || stdErrString.includes(successLog)
    }

    process.stdout?.on("data", (chunk) => {
      stdOutString = stdOutString + chunk
      if (hasSuccess(stdOutString)) {
        resolve()
      } else if (hasError(stdOutString)) {
        reject()
      }
    })

    process.stderr?.on("data", (chunk) => {
      stdErrString = stdErrString + chunk
      if (hasSuccess(stdOutString)) {
        resolve()
      } else if (hasError(stdOutString)) {
        reject()
      }
    })
  })
}
