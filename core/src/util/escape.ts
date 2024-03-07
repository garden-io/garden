/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * Wraps every parameter in single quotes, escaping contained single quotes (for use in bash scripts). Joins the elements with a space character.
 *
 * Examples:
 *
 *   // returns `echo 'hello world'`
 *   commandListToShellScript(["echo", "hello world"])
 *
 *   // returns `echo 'hello'"'"'world'`
 *   commandListToShellScript(["echo", "hello'world"])
 *
 *   // returns `echo ''"'"'; exec ls /'`
 *   commandListToShellScript(["echo", "'; exec ls /"])
 *
 * Caveat: This is only safe if the command is directly executed. It is not safe, if you wrap the output of this in double quotes, for instance.
 *
 * // SAFE
 *    exec(["sh", "-c", ${commandListToShellScript(["some", "command", "--with" untrustedInput])}])
 *    exec(["sh", "-c", dedent`
 *       set -e
 *       echo "running command..."
 *       ${commandListToShellScript(["some", "command", "--with" untrustedInput])}
 *       echo "done"
 *    `])
 *
 * // UNSAFE! don't do this
 *
 *    const commandWithUntrustedInput = commandListToShellScript(["some", "command", "--with" untrustedInput])
 *    exec(["sh", "-c", `some_var="${commandWithUntrustedInput}"; echo "$some_var"`])
 *
 * The second is UNSAFE, because we can't know that the /double quotes/ need to be escaped here.
 *
 * If you can, use environment variables instead of this, to pass untrusted values to shell scripts, e.g. if you do not need to construct a command with untrusted input.
 *
 * // SAFE
 *
 *    exec(["sh", "-c", `some_var="$UNTRUSTED_INPUT"; echo "$some_var"`], { env: { UNTRUSTED_INPUT: untrustedInput } })
 *
 * @param command array of command line arguments
 * @returns string to be used as shell script statement to execute the given command.
 */
export function commandListToShellScript(command: string[]) {
  return command.map((c) => `'${c.replaceAll("'", `'"'"'`)}'`).join(" ")
}
