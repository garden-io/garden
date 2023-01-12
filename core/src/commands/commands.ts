/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandGroup } from "./base"
import { BuildCommand } from "./build"
import { CreateCommand } from "./create/create"
import { DeleteCommand } from "./delete"
import { DeployCommand } from "./deploy"
import { DevCommand } from "./dev"
import { GetCommand } from "./get/get"
import { CloudCommand } from "./cloud/cloud"
import { LinkCommand } from "./link/link"
import { LogsCommand } from "./logs"
import { MigrateCommand } from "./migrate"
import { PublishCommand } from "./publish"
import { RunCommand } from "./run"
import { RunWorkflowCommand } from "./run-workflow"
import { ScanCommand } from "./scan"
import { SetCommand } from "./set"
import { TestCommand } from "./test"
import { UnlinkCommand } from "./unlink/unlink"
import { UpdateRemoteCommand } from "./update-remote/update-remote"
import { ValidateCommand } from "./validate"
import { ExecCommand } from "./exec"
import { ServeCommand } from "./serve"
import { OptionsCommand } from "./options"
import { ConfigCommand } from "./config/config"
import { PluginsCommand } from "./plugins"
import { LoginCommand } from "./login"
import { LogOutCommand } from "./logout"
import { ToolsCommand } from "./tools"
import { UtilCommand } from "./util/util"
import { SelfUpdateCommand } from "./self-update"

export const getCoreCommands = (): (Command | CommandGroup)[] => [
  new BuildCommand(),
  new ConfigCommand(),
  new CreateCommand(),
  new DeleteCommand(),
  new DeployCommand(),
  new DevCommand(),
  new ExecCommand(),
  new CloudCommand(),
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
  new RunWorkflowCommand(),
  new ScanCommand(),
  new ServeCommand(),
  new SelfUpdateCommand(),
  new SetCommand(),
  new TestCommand(),
  new ToolsCommand(),
  new UnlinkCommand(),
  new UpdateRemoteCommand(),
  new UtilCommand(),
  new ValidateCommand(),
]

export function getBuiltinCommands() {
  return getCoreCommands().flatMap((cmd) => (cmd instanceof CommandGroup ? [cmd, ...cmd.getSubCommands()] : [cmd]))
}
