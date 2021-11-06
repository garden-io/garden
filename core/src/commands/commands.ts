/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandGroup } from "./base"
import { BuildCommand } from "./build"
import { CallCommand } from "./call"
import { ConfigCommand } from "./config/config"
import { CreateCommand } from "./create/create"
import { DashboardCommand } from "./dashboard"
import { DeleteCommand } from "./delete"
import { DeployCommand } from "./deploy"
import { DevCommand } from "./dev"
import { EnterpriseCommand } from "./enterprise/enterprise"
import { ExecCommand } from "./exec"
import { GetCommand } from "./get/get"
import { LinkCommand } from "./link/link"
import { LogOutCommand } from "./logout"
import { LoginCommand } from "./login"
import { LogsCommand } from "./logs"
import { MigrateCommand } from "./migrate"
import { OptionsCommand } from "./options"
import { PluginsCommand } from "./plugins"
import { PublishCommand } from "./publish"
import { RenderCommand } from "./render/render"
import { RunCommand } from "./run/run"
import { ScanCommand } from "./scan"
import { SelfUpdateCommand } from "./self-update"
import { SetCommand } from "./set"
import { TestCommand } from "./test"
import { ToolsCommand } from "./tools"
import { UnlinkCommand } from "./unlink/unlink"
import { UpdateRemoteCommand } from "./update-remote/update-remote"
import { UtilCommand } from "./util/util"
import { ValidateCommand } from "./validate"

export const getCoreCommands = (): (Command | CommandGroup)[] => [
  new BuildCommand(),
  new CallCommand(),
  new ConfigCommand(),
  new CreateCommand(),
  new DashboardCommand(),
  new DeleteCommand(),
  new DeployCommand(),
  new DevCommand(),
  new EnterpriseCommand(),
  new ExecCommand(),
  new GetCommand(),
  new LinkCommand(),
  new LogOutCommand(),
  new LoginCommand(),
  new LogsCommand(),
  new MigrateCommand(),
  new OptionsCommand(),
  new PluginsCommand(),
  new PublishCommand(),
  new RenderCommand(),
  new RunCommand(),
  new ScanCommand(),
  new SelfUpdateCommand(),
  new SetCommand(),
  new TestCommand(),
  new ToolsCommand(),
  new UnlinkCommand(),
  new UpdateRemoteCommand(),
  new UtilCommand(),
  new ValidateCommand(),
]

export function getAllCommands() {
  return getCoreCommands().flatMap((cmd) => (cmd instanceof CommandGroup ? [cmd, ...cmd.getSubCommands()] : [cmd]))
}
