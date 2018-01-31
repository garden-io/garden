import { spawn } from "child_process"
import { extend } from "joi"
import { spawnPty } from "../../util"

interface KubectlParams {
  data?: Buffer,
  ignoreError?: boolean,
  silent?: boolean,
  timeout?: number,
}

interface KubectlOutput {
  code: number,
  output: string,
  stdout?: string,
  stderr?: string,
}

export const DEFAULT_CONTEXT= "docker-for-desktop"
export const KUBECTL_DEFAULT_TIMEOUT = 600

export class Kubectl {
  public context?: string
  public namespace?: string
  public configPath?: string

  constructor({ context, namespace, configPath }: { context?: string, namespace?: string, configPath?: string }) {
    this.context = context
    this.namespace = namespace
    this.configPath = configPath
  }

  async call(
    args: string[],
    { data, ignoreError = false, silent = true, timeout = KUBECTL_DEFAULT_TIMEOUT }: KubectlParams = {},
  ): Promise<KubectlOutput> {

    const out: KubectlOutput = {
      code: 0,
      output: "",
      stdout: "",
      stderr: "",
    }

    const proc = spawn("kubectl", this.prepareArgs(args))

    proc.stdout.on("data", (s) => {
      if (!silent) {
        process.stdout.write(s)
      }
      out.output += s
      out.stdout! += s
    })

    proc.stderr.on("data", (s) => {
      if (!silent) {
        process.stderr.write(s)
      }
      out.output += s
      out.stderr! += s
    })

    if (data) {
      proc.stdin.end(data)
    }

    return new Promise<KubectlOutput>((resolve, reject) => {
      let _timeout

      const _reject = (msg: string) => {
        const err = new Error(msg)
        extend(err, <any>out)
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
        out.code = code

        if (code === 0 || ignoreError) {
          resolve(out)
        } else {
          _reject("Process exited with code " + code)
        }
      })
    })
  }

  async json(args: string[], opts: KubectlParams = {}): Promise<KubectlOutput> {
    if (!args.includes("--output=json")) {
      args.push("--output=json")
    }

    const result = await this.call(args, opts)

    return JSON.parse(result.output)
  }

  async tty(args: string[], { silent = true } = {}): Promise<KubectlOutput> {
    return spawnPty("kubectl", this.prepareArgs(args), { silent })
  }

  private prepareArgs(args: string[]) {
    const ops: string[] = []

    if (this.namespace) {
      ops.push(`--namespace=${this.namespace}`)
    }

    if (this.context) {
      ops.push(`--context=${this.context}`)
    }

    if (this.configPath) {
      ops.push(`--kubeconfig=${this.configPath}`)
    }

    return ops.concat(args)
  }
}
