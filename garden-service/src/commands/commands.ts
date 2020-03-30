/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command } from "./base"
import { BuildCommand } from "./build"
import { CallCommand } from "./call"
import { CreateCommand } from "./create/create"
import { DeleteCommand } from "./delete"
import { DeployCommand } from "./deploy"
import { DevCommand } from "./dev"
import { GetCommand } from "./get/get"
import { LinkCommand } from "./link/link"
import { LogsCommand } from "./logs"
import { MigrateCommand } from "./migrate"
import { PublishCommand } from "./publish"
import { RunCommand } from "./run/run"
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

export const coreCommands: Command[] = [
  new BuildCommand(),
  new CallCommand(),
  new CreateCommand(),
  new DeleteCommand(),
  new DeployCommand(),
  new DevCommand(),
  new ExecCommand(),
  new GetCommand(),
  new LinkCommand(),
  new LogsCommand(),
  new MigrateCommand(),
  new OptionsCommand(),
  new PluginsCommand(),
  new PublishCommand(),
  new RunCommand(),
  new ScanCommand(),
  new ServeCommand(),
  new SetCommand(),
  new TestCommand(),
  new UnlinkCommand(),
  new UpdateRemoteCommand(),
  new ValidateCommand(),
  new ConfigCommand(),
  new LoginCommand(),
  new LogOutCommand(),
]
