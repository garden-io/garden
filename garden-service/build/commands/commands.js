"use strict";
/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const build_1 = require("./build");
const create_1 = require("./create/create");
const call_1 = require("./call");
const init_1 = require("./init");
const delete_1 = require("./delete");
const deploy_1 = require("./deploy");
const dev_1 = require("./dev");
const get_1 = require("./get");
const link_1 = require("./link/link");
const logs_1 = require("./logs");
const publish_1 = require("./publish");
const run_1 = require("./run/run");
const scan_1 = require("./scan");
const set_1 = require("./set");
const test_1 = require("./test");
const unlink_1 = require("./unlink/unlink");
const update_remote_1 = require("./update-remote/update-remote");
const validate_1 = require("./validate");
const exec_1 = require("./exec");
exports.coreCommands = [
    new build_1.BuildCommand(),
    new call_1.CallCommand(),
    new create_1.CreateCommand(),
    new delete_1.DeleteCommand(),
    new deploy_1.DeployCommand(),
    new dev_1.DevCommand(),
    new exec_1.ExecCommand(),
    new get_1.GetCommand(),
    new init_1.InitCommand(),
    new link_1.LinkCommand(),
    new logs_1.LogsCommand(),
    new publish_1.PublishCommand(),
    new run_1.RunCommand(),
    new scan_1.ScanCommand(),
    new set_1.SetCommand(),
    new test_1.TestCommand(),
    new unlink_1.UnlinkCommand(),
    new update_remote_1.UpdateRemoteCommand(),
    new validate_1.ValidateCommand(),
];

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL2NvbW1hbmRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7O0FBR0gsbUNBQXNDO0FBQ3RDLDRDQUErQztBQUMvQyxpQ0FBb0M7QUFDcEMsaUNBQW9DO0FBQ3BDLHFDQUF3QztBQUN4QyxxQ0FBd0M7QUFDeEMsK0JBQWtDO0FBQ2xDLCtCQUFrQztBQUNsQyxzQ0FBeUM7QUFDekMsaUNBQW9DO0FBQ3BDLHVDQUEwQztBQUMxQyxtQ0FBc0M7QUFDdEMsaUNBQW9DO0FBQ3BDLCtCQUFrQztBQUNsQyxpQ0FBb0M7QUFDcEMsNENBQStDO0FBQy9DLGlFQUFtRTtBQUNuRSx5Q0FBNEM7QUFDNUMsaUNBQW9DO0FBRXZCLFFBQUEsWUFBWSxHQUFjO0lBQ3JDLElBQUksb0JBQVksRUFBRTtJQUNsQixJQUFJLGtCQUFXLEVBQUU7SUFDakIsSUFBSSxzQkFBYSxFQUFFO0lBQ25CLElBQUksc0JBQWEsRUFBRTtJQUNuQixJQUFJLHNCQUFhLEVBQUU7SUFDbkIsSUFBSSxnQkFBVSxFQUFFO0lBQ2hCLElBQUksa0JBQVcsRUFBRTtJQUNqQixJQUFJLGdCQUFVLEVBQUU7SUFDaEIsSUFBSSxrQkFBVyxFQUFFO0lBQ2pCLElBQUksa0JBQVcsRUFBRTtJQUNqQixJQUFJLGtCQUFXLEVBQUU7SUFDakIsSUFBSSx3QkFBYyxFQUFFO0lBQ3BCLElBQUksZ0JBQVUsRUFBRTtJQUNoQixJQUFJLGtCQUFXLEVBQUU7SUFDakIsSUFBSSxnQkFBVSxFQUFFO0lBQ2hCLElBQUksa0JBQVcsRUFBRTtJQUNqQixJQUFJLHNCQUFhLEVBQUU7SUFDbkIsSUFBSSxtQ0FBbUIsRUFBRTtJQUN6QixJQUFJLDBCQUFlLEVBQUU7Q0FDdEIsQ0FBQSIsImZpbGUiOiJjb21tYW5kcy9jb21tYW5kcy5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgeyBDb21tYW5kIH0gZnJvbSBcIi4vYmFzZVwiXG5pbXBvcnQgeyBCdWlsZENvbW1hbmQgfSBmcm9tIFwiLi9idWlsZFwiXG5pbXBvcnQgeyBDcmVhdGVDb21tYW5kIH0gZnJvbSBcIi4vY3JlYXRlL2NyZWF0ZVwiXG5pbXBvcnQgeyBDYWxsQ29tbWFuZCB9IGZyb20gXCIuL2NhbGxcIlxuaW1wb3J0IHsgSW5pdENvbW1hbmQgfSBmcm9tIFwiLi9pbml0XCJcbmltcG9ydCB7IERlbGV0ZUNvbW1hbmQgfSBmcm9tIFwiLi9kZWxldGVcIlxuaW1wb3J0IHsgRGVwbG95Q29tbWFuZCB9IGZyb20gXCIuL2RlcGxveVwiXG5pbXBvcnQgeyBEZXZDb21tYW5kIH0gZnJvbSBcIi4vZGV2XCJcbmltcG9ydCB7IEdldENvbW1hbmQgfSBmcm9tIFwiLi9nZXRcIlxuaW1wb3J0IHsgTGlua0NvbW1hbmQgfSBmcm9tIFwiLi9saW5rL2xpbmtcIlxuaW1wb3J0IHsgTG9nc0NvbW1hbmQgfSBmcm9tIFwiLi9sb2dzXCJcbmltcG9ydCB7IFB1Ymxpc2hDb21tYW5kIH0gZnJvbSBcIi4vcHVibGlzaFwiXG5pbXBvcnQgeyBSdW5Db21tYW5kIH0gZnJvbSBcIi4vcnVuL3J1blwiXG5pbXBvcnQgeyBTY2FuQ29tbWFuZCB9IGZyb20gXCIuL3NjYW5cIlxuaW1wb3J0IHsgU2V0Q29tbWFuZCB9IGZyb20gXCIuL3NldFwiXG5pbXBvcnQgeyBUZXN0Q29tbWFuZCB9IGZyb20gXCIuL3Rlc3RcIlxuaW1wb3J0IHsgVW5saW5rQ29tbWFuZCB9IGZyb20gXCIuL3VubGluay91bmxpbmtcIlxuaW1wb3J0IHsgVXBkYXRlUmVtb3RlQ29tbWFuZCB9IGZyb20gXCIuL3VwZGF0ZS1yZW1vdGUvdXBkYXRlLXJlbW90ZVwiXG5pbXBvcnQgeyBWYWxpZGF0ZUNvbW1hbmQgfSBmcm9tIFwiLi92YWxpZGF0ZVwiXG5pbXBvcnQgeyBFeGVjQ29tbWFuZCB9IGZyb20gXCIuL2V4ZWNcIlxuXG5leHBvcnQgY29uc3QgY29yZUNvbW1hbmRzOiBDb21tYW5kW10gPSBbXG4gIG5ldyBCdWlsZENvbW1hbmQoKSxcbiAgbmV3IENhbGxDb21tYW5kKCksXG4gIG5ldyBDcmVhdGVDb21tYW5kKCksXG4gIG5ldyBEZWxldGVDb21tYW5kKCksXG4gIG5ldyBEZXBsb3lDb21tYW5kKCksXG4gIG5ldyBEZXZDb21tYW5kKCksXG4gIG5ldyBFeGVjQ29tbWFuZCgpLFxuICBuZXcgR2V0Q29tbWFuZCgpLFxuICBuZXcgSW5pdENvbW1hbmQoKSxcbiAgbmV3IExpbmtDb21tYW5kKCksXG4gIG5ldyBMb2dzQ29tbWFuZCgpLFxuICBuZXcgUHVibGlzaENvbW1hbmQoKSxcbiAgbmV3IFJ1bkNvbW1hbmQoKSxcbiAgbmV3IFNjYW5Db21tYW5kKCksXG4gIG5ldyBTZXRDb21tYW5kKCksXG4gIG5ldyBUZXN0Q29tbWFuZCgpLFxuICBuZXcgVW5saW5rQ29tbWFuZCgpLFxuICBuZXcgVXBkYXRlUmVtb3RlQ29tbWFuZCgpLFxuICBuZXcgVmFsaWRhdGVDb21tYW5kKCksXG5dXG4iXX0=
