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
    name,
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

export class LogLineTimeoutError extends Error {
  private stdout: string
  private stderr: string

  private successLog: string
  private errorLog?: string

  constructor({
    stdout,
    stderr,
    successLog,
    errorLog,
  }: {
    stdout: string
    stderr: string
    successLog: string
    errorLog?: string
  }) {
    super(`Timed out after waiting for success log line "${successLog}" or error log line "${errorLog}"`)
    this.stdout = stdout
    this.stderr = stderr
    this.successLog = successLog
    this.errorLog = errorLog
  }
}

export class ErrorLogLineSeenError extends Error {
  private stdout: string
  private stderr: string

  private successLog: string
  private errorLog: string

  constructor({
    stdout,
    stderr,
    successLog,
    errorLog,
  }: {
    stdout: string
    stderr: string
    successLog: string
    errorLog: string
  }) {
    super(`Error log line "${errorLog}" detected in output`)
    this.stdout = stdout
    this.stderr = stderr
    this.successLog = successLog
    this.errorLog = errorLog
  }
}

export function waitForLogLine({
  successLog,
  errorLog,
  process,
  timeout,
}: {
  successLog: string
  errorLog?: string
  process: ChildProcess
  timeout?: number
}): Promise<void> {
  let stdOutString = ""
  let stdErrString = ""

  const stringWasSeen = new Promise<void>((resolve, reject) => {
    function hasError(string: string): boolean {
      return errorLog !== undefined && (stdOutString.includes(errorLog) || stdErrString.includes(errorLog))
    }

    function hasSuccess(string: string): boolean {
      return stdOutString.includes(successLog) || stdErrString.includes(successLog)
    }

    process.stdout?.on("data", (chunk) => {
      stdOutString = stdOutString + chunk
      if (hasSuccess(stdOutString)) {
        resolve()
      } else if (hasError(stdOutString)) {
        reject(
          new ErrorLogLineSeenError({
            stdout: stdOutString,
            stderr: stdErrString,
            successLog,
            errorLog: errorLog!,
          })
        )
      }
    })

    process.stderr?.on("data", (chunk) => {
      stdErrString = stdErrString + chunk
      if (hasSuccess(stdOutString)) {
        resolve()
      } else if (hasError(stdOutString)) {
        reject(
          new ErrorLogLineSeenError({
            stdout: stdOutString,
            stderr: stdErrString,
            successLog,
            errorLog: errorLog!,
          })
        )
      }
    })
  })

  if (timeout !== undefined) {
    const rejectWhenTimedOut = new Promise<void>((_resolve, reject) => {
      const error = new LogLineTimeoutError({
        stdout: stdOutString,
        stderr: stdErrString,
        successLog,
        errorLog,
      })

      setTimeout(() => {
        reject(error)
      }, timeout)
    })

    return Promise.race([stringWasSeen, rejectWhenTimedOut])
  }

  return stringWasSeen
}
