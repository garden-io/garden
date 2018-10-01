"use strict";
/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const base_1 = require("./base");
const dedent = require("dedent");
const initOpts = {
    force: new base_1.BooleanParameter({ help: "Force initalization of environment, ignoring the environment status check." }),
};
class InitCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "init";
        this.help = "Initialize system, environment or other runtime components.";
        this.description = dedent `
    This command needs to be run before first deploying a Garden project, and occasionally after updating Garden,
    plugins or project configuration.

    Examples:

        garden init
        garden init --force   # runs the init flows even if status checks report that the environment is ready
  `;
        this.options = initOpts;
    }
    action({ garden, opts }) {
        return __awaiter(this, void 0, void 0, function* () {
            const { name } = garden.environment;
            garden.log.header({ emoji: "gear", command: `Initializing ${name} environment` });
            yield garden.actions.prepareEnvironment({ force: opts.force, allowUserInput: true });
            garden.log.info("");
            garden.log.header({ emoji: "heavy_check_mark", command: `Done!` });
            return { result: {} };
        });
    }
}
exports.InitCommand = InitCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL2luaXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7OztBQUVILGlDQUtlO0FBQ2YsaUNBQWlDO0FBRWpDLE1BQU0sUUFBUSxHQUFHO0lBQ2YsS0FBSyxFQUFFLElBQUksdUJBQWdCLENBQUMsRUFBRSxJQUFJLEVBQUUsNEVBQTRFLEVBQUUsQ0FBQztDQUNwSCxDQUFBO0FBSUQsTUFBYSxXQUFZLFNBQVEsY0FBTztJQUF4Qzs7UUFDRSxTQUFJLEdBQUcsTUFBTSxDQUFBO1FBQ2IsU0FBSSxHQUFHLDZEQUE2RCxDQUFBO1FBRXBFLGdCQUFXLEdBQUcsTUFBTSxDQUFBOzs7Ozs7OztHQVFuQixDQUFBO1FBRUQsWUFBTyxHQUFHLFFBQVEsQ0FBQTtJQWFwQixDQUFDO0lBWE8sTUFBTSxDQUFDLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBMkI7O1lBQ3BELE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFBO1lBQ25DLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsZ0JBQWdCLElBQUksY0FBYyxFQUFFLENBQUMsQ0FBQTtZQUVqRixNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUMsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxjQUFjLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQTtZQUVwRixNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQTtZQUNuQixNQUFNLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEtBQUssRUFBRSxrQkFBa0IsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQTtZQUVsRSxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRSxDQUFBO1FBQ3ZCLENBQUM7S0FBQTtDQUNGO0FBM0JELGtDQTJCQyIsImZpbGUiOiJjb21tYW5kcy9pbml0LmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7XG4gIEJvb2xlYW5QYXJhbWV0ZXIsXG4gIENvbW1hbmQsXG4gIENvbW1hbmRSZXN1bHQsXG4gIENvbW1hbmRQYXJhbXMsXG59IGZyb20gXCIuL2Jhc2VcIlxuaW1wb3J0IGRlZGVudCA9IHJlcXVpcmUoXCJkZWRlbnRcIilcblxuY29uc3QgaW5pdE9wdHMgPSB7XG4gIGZvcmNlOiBuZXcgQm9vbGVhblBhcmFtZXRlcih7IGhlbHA6IFwiRm9yY2UgaW5pdGFsaXphdGlvbiBvZiBlbnZpcm9ubWVudCwgaWdub3JpbmcgdGhlIGVudmlyb25tZW50IHN0YXR1cyBjaGVjay5cIiB9KSxcbn1cblxudHlwZSBPcHRzID0gdHlwZW9mIGluaXRPcHRzXG5cbmV4cG9ydCBjbGFzcyBJbml0Q29tbWFuZCBleHRlbmRzIENvbW1hbmQge1xuICBuYW1lID0gXCJpbml0XCJcbiAgaGVscCA9IFwiSW5pdGlhbGl6ZSBzeXN0ZW0sIGVudmlyb25tZW50IG9yIG90aGVyIHJ1bnRpbWUgY29tcG9uZW50cy5cIlxuXG4gIGRlc2NyaXB0aW9uID0gZGVkZW50YFxuICAgIFRoaXMgY29tbWFuZCBuZWVkcyB0byBiZSBydW4gYmVmb3JlIGZpcnN0IGRlcGxveWluZyBhIEdhcmRlbiBwcm9qZWN0LCBhbmQgb2NjYXNpb25hbGx5IGFmdGVyIHVwZGF0aW5nIEdhcmRlbixcbiAgICBwbHVnaW5zIG9yIHByb2plY3QgY29uZmlndXJhdGlvbi5cblxuICAgIEV4YW1wbGVzOlxuXG4gICAgICAgIGdhcmRlbiBpbml0XG4gICAgICAgIGdhcmRlbiBpbml0IC0tZm9yY2UgICAjIHJ1bnMgdGhlIGluaXQgZmxvd3MgZXZlbiBpZiBzdGF0dXMgY2hlY2tzIHJlcG9ydCB0aGF0IHRoZSBlbnZpcm9ubWVudCBpcyByZWFkeVxuICBgXG5cbiAgb3B0aW9ucyA9IGluaXRPcHRzXG5cbiAgYXN5bmMgYWN0aW9uKHsgZ2FyZGVuLCBvcHRzIH06IENvbW1hbmRQYXJhbXM8e30sIE9wdHM+KTogUHJvbWlzZTxDb21tYW5kUmVzdWx0PHt9Pj4ge1xuICAgIGNvbnN0IHsgbmFtZSB9ID0gZ2FyZGVuLmVudmlyb25tZW50XG4gICAgZ2FyZGVuLmxvZy5oZWFkZXIoeyBlbW9qaTogXCJnZWFyXCIsIGNvbW1hbmQ6IGBJbml0aWFsaXppbmcgJHtuYW1lfSBlbnZpcm9ubWVudGAgfSlcblxuICAgIGF3YWl0IGdhcmRlbi5hY3Rpb25zLnByZXBhcmVFbnZpcm9ubWVudCh7IGZvcmNlOiBvcHRzLmZvcmNlLCBhbGxvd1VzZXJJbnB1dDogdHJ1ZSB9KVxuXG4gICAgZ2FyZGVuLmxvZy5pbmZvKFwiXCIpXG4gICAgZ2FyZGVuLmxvZy5oZWFkZXIoeyBlbW9qaTogXCJoZWF2eV9jaGVja19tYXJrXCIsIGNvbW1hbmQ6IGBEb25lIWAgfSlcblxuICAgIHJldHVybiB7IHJlc3VsdDoge30gfVxuICB9XG59XG4iXX0=
