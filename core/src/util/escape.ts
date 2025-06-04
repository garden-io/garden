/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { InternalError } from "../exceptions.js"
import { joinSecrets, maybeSecret, type MaybeSecret, transformSecret } from "./secrets.js"

/**
 * Wraps every parameter in single quotes, escaping contained single quotes (for use in bash scripts). Joins the elements with a space character.
 *
 * Examples:
 *
 *   // returns `echo 'hello world'`
 *   commandListToShellScript({ command: ["echo", "hello world"] })
 *
 *   // returns `echo 'hello'"'"'world'`
 *   commandListToShellScript({ command: ["echo", "hello'world"] })
 *
 *   // returns `echo ''"'"'; exec ls /'`
 *   commandListToShellScript({ command: ["echo", "'; exec ls /"] })
 *
 * Caveat: This is only safe if the command is directly executed. It is not safe, if you wrap the output of this in double quotes, for instance.
 *
 * // SAFE
 *    exec(["sh", "-c", ${commandListToShellScript({ command: ["some", "command", "--with" untrustedInput] })}])
 *    exec(["sh", "-c", dedent`
 *       set -e
 *       echo "running command..."
 *       ${commandListToShellScript({ command: ["some", "command", "--with" untrustedInput] })}
 *       echo "done"
 *    `])
 *
 * // UNSAFE! don't do this
 *
 *    const UNSAFE_commandWithUntrustedInput = commandListToShellScript({ command: ["some", "UNSAFE", "command", "--with" untrustedInput] })
 *    exec(["sh", "-c", `UNSAFE_some_var="${UNSAFE_commandWithUntrustedInput}"; echo "$UNSAFE_some_var"`])
 *
 * The second is UNSAFE, because we can't know that the /double quotes/ need to be escaped here.
 *
 * If you can, use environment variables instead of this, to pass untrusted values to shell scripts, e.g. if you do not need to construct a command with untrusted input.
 *
 * // SAFE (preferred, if possible)
 *
 *    exec(["sh", "-c", `some_var="$UNTRUSTED_INPUT"; echo "$some_var"`], { env: { UNTRUSTED_INPUT: untrustedInput } })
 *
 * // ALSO SAFE
 *
 *    exec([
 *      "sh",
 *      "-c",
 *      commandListToShellScript({
 *        command: ["some", "command", "--with" untrustedInput],
 *        env: { UNTRUSTED_ENV_VAR: "moreUntrustedInput" },
 *      }),
 *    ])
 *
 * @param command array of command line arguments
 * @returns string to be used as shell script statement to execute the given command.
 */
export function commandListToShellScript<C extends MaybeSecret[], E extends Record<string, MaybeSecret>>({
  command,
  env,
}: {
  command: C
  env?: E
}) {
  const wrapInSingleQuotes = (s: MaybeSecret) =>
    maybeSecret`'${transformSecret(s, (clearText) => clearText.replaceAll("'", `'"'"'`))}'`

  const escapedCommand: MaybeSecret = joinSecrets(command.map(wrapInSingleQuotes), " ")

  const envVars = Object.entries(env || {})
  const escapedEnv =
    envVars.length > 0
      ? joinSecrets(
          envVars.map(([k, v]) => {
            if (!k.match(/^[0-9a-zA-Z_]+$/)) {
              throw new InternalError({
                message: `Invalid environment variable name ${k}. Alphanumeric letters and underscores are allowed.`,
              })
            }
            return maybeSecret`${k}=${wrapInSingleQuotes(v)}`
          }),
          " "
        )
      : undefined

  if (escapedEnv) {
    return maybeSecret`${escapedEnv} ${escapedCommand}`
  } else {
    return escapedCommand
  }
}
