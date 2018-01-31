import { spawn } from "child_process"
import { extend } from "joi"

interface KubectlParams {
  configPath?: string,
  context?: string,
  data?: Buffer,
  ignoreError?: boolean,
  namespace?: string,
  silent?: boolean,
  timeout?: number,
  tty?: boolean,
}

export const DEFAULT_CONTEXT= "docker-for-desktop"
export const KUBECTL_DEFAULT_TIMEOUT = 600

export async function kubectl(
  args: string[],
  {
    configPath, context = DEFAULT_CONTEXT, data, ignoreError = false, namespace,
    silent = true, timeout = KUBECTL_DEFAULT_TIMEOUT,
  }: KubectlParams = {},
): Promise<any> {

  const ops: string[] = []

  if (namespace) {
    ops.push(`--namespace=${namespace}`)
  }

  ops.push(`--context=${context}`)

  if (configPath) {
    ops.push(`--kubeconfig=${configPath}`)
  }

  const out: any = {
    code: 0,
    output: "",
    stdout: "",
    stderr: "",
  }

  const proc = spawn("kubectl", ops.concat(args))

  proc.stdout.on("data", (s) => {
    if (!silent) {
      process.stdout.write(s)
    }
    out.output += s
    out.stdout += s
  })

  proc.stderr.on("data", (s) => {
    if (!silent) {
      process.stderr.write(s)
    }
    out.output += s
    out.stderr += s
  })

  if (data) {
    proc.stdin.end(data)
  }

  return new Promise((resolve, reject) => {
    let _timeout

    const _reject = (msg: string) => {
      const err = new Error(msg)
      extend(err, out)
      reject(err)
    }

    if (timeout > 0) {
      _timeout = setTimeout(() => {
        proc.kill("SIGKILL")
        _reject(`kubectl timed out after ${timeout} seconds.`)
      }, timeout * 1000)
    }

    proc.on("close", (code) => {
      _timeout && clearTimeout(_timeout)

      if (code === 0) {
        resolve(out)
      } else {
        _reject("Process exited with code " + code)
      }
    })
  })
}

export async function kubectlJson(
  args: string[], opts: KubectlParams = {},
) {
  if (!args.includes("--output=json")) {
    args.push("--output=json")
  }

  const result = await kubectl(args, opts)

  return JSON.parse(result.output)
}
