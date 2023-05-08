/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BuildCommand } from "./build"
import { CloudCommand } from "./cloud/cloud"
import { Command, CommandGroup } from "./base"
import { CommunityCommand } from "./community"
import { ConfigCommand } from "./config/config"
import { CreateCommand } from "./create/create"
import { DeleteCommand } from "./delete"
import { DeployCommand } from "./deploy"
import { DevCommand } from "./dev"
import { ExecCommand } from "./exec"
import { GetCommand } from "./get/get"
import { LinkCommand } from "./link/link"
import { LoginCommand } from "./login"
import { LogOutCommand } from "./logout"
import { LogsCommand } from "./logs"
import { memoize } from "lodash"
import { MigrateCommand } from "./migrate"
import { OptionsCommand } from "./options"
import { PluginsCommand } from "./plugins"
import { PublishCommand } from "./publish"
import { RunCommand } from "./run"
import { WorkflowCommand } from "./workflow"
import { SelfUpdateCommand } from "./self-update"
import { ServeCommand } from "./serve"
import { SetCommand } from "./set"
import { SyncCommand } from "./sync/sync"
import { TestCommand } from "./test"
import { ToolsCommand } from "./tools"
import { UnlinkCommand } from "./unlink/unlink"
import { UpdateRemoteCommand } from "./update-remote/update-remote"
import { UtilCommand } from "./util/util"
import { ValidateCommand } from "./validate"
import { UpCommand } from "./up"

export const getCoreCommands = (): (Command | CommandGroup)[] => [
  new BuildCommand(),
  new CloudCommand(),
  new CommunityCommand(),
  new ConfigCommand(),
  new CreateCommand(),
  new DeleteCommand(),
  new DeployCommand(),
  new DevCommand(),
  new ExecCommand(),
  new GetCommand(),
  new LinkCommand(),
  new LoginCommand(),
  new LogOutCommand(),
  new LogsCommand(),
  new MigrateCommand(),
  new OptionsCommand(),
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
]

export function flattenCommands(commands: (Command | CommandGroup)[]) {
  return commands.flatMap((cmd) => (cmd instanceof CommandGroup ? [cmd, ...cmd.getSubCommands()] : [cmd]))
}

export const getBuiltinCommands = memoize(() => {
  return flattenCommands(getCoreCommands())
})
