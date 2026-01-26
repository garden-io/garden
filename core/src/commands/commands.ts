/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BuildCommand } from "./build.js"
import { CloudCommand } from "./cloud/cloud.js"
import type { Command } from "./base.js"
import { CommandGroup } from "./base.js"
import { CommunityCommand } from "./community.js"
import { ConfigCommand } from "./config/config.js"
import { CreateCommand } from "./create/create.js"
import { DeleteCommand } from "./delete.js"
import { DeployCommand } from "./deploy.js"
import { DevCommand } from "./dev.js"
import { ExecCommand } from "./exec.js"
import { GetCommand } from "./get/get.js"
import { LinkCommand } from "./link/link.js"
import { LoginCommand } from "./login.js"
import { LogOutCommand } from "./logout.js"
import { LogsCommand } from "./logs.js"
import { memoize } from "lodash-es"
import { OptionsCommand } from "./options.js"
import { PlanCommand } from "./plan.js"
import { PluginsCommand } from "./plugins.js"
import { PublishCommand } from "./publish.js"
import { RunCommand } from "./run.js"
import { WorkflowCommand } from "./workflow.js"
import { SelfUpdateCommand } from "./self-update.js"
import { ServeCommand } from "./serve.js"
import { SetCommand } from "./set.js"
import { SyncCommand } from "./sync/sync.js"
import { TestCommand } from "./test.js"
import { ToolsCommand } from "./tools.js"
import { UnlinkCommand } from "./unlink/unlink.js"
import { UpdateRemoteCommand } from "./update-remote/update-remote.js"
import { UtilCommand } from "./util/util.js"
import { ValidateCommand } from "./validate.js"
import { UpCommand } from "./up.js"
import { VersionCommand } from "./version.js"
import { DiffCommand } from "./diff.js"

export const getCoreCommands = (): (Command | CommandGroup)[] => [
  new BuildCommand(),
  new CloudCommand(),
  new CommunityCommand(),
  new ConfigCommand(),
  new CreateCommand(),
  new DeleteCommand(),
  new DeployCommand(),
  new DevCommand(),
  new DiffCommand(),
  new ExecCommand(),
  new GetCommand(),
  new LinkCommand(),
  new LoginCommand(),
  new LogOutCommand(),
  new LogsCommand(),
  new OptionsCommand(),
  new PlanCommand(),
  new PluginsCommand(),
  new PublishCommand(),
  new RunCommand(),
  new WorkflowCommand(),
  new SelfUpdateCommand(),
  new ServeCommand(),
  new SetCommand(),
  new SyncCommand(),
  new TestCommand(),
  new ToolsCommand(),
  new UnlinkCommand(),
  new UpCommand(),
  new UpdateRemoteCommand(),
  new UtilCommand(),
  new ValidateCommand(),
  new VersionCommand(),
]

export function flattenCommands(commands: (Command | CommandGroup)[]): Command[] {
  return commands.flatMap((cmd) => (cmd instanceof CommandGroup ? [cmd, ...cmd.getSubCommands()] : [cmd]))
}

export const getBuiltinCommands = memoize(() => {
  return flattenCommands(getCoreCommands())
})
