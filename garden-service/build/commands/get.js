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
const yaml = require("js-yaml");
const exceptions_1 = require("../exceptions");
const util_1 = require("../util/util");
const base_1 = require("./base");
const dedent = require("dedent");
class GetCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "get";
        this.help = "Retrieve and output data and objects, e.g. secrets, status info etc.";
        this.subCommands = [
            GetSecretCommand,
            GetStatusCommand,
        ];
    }
    action() {
        return __awaiter(this, void 0, void 0, function* () { return {}; });
    }
}
exports.GetCommand = GetCommand;
const getSecretArgs = {
    provider: new base_1.StringParameter({
        help: "The name of the provider to read the secret from.",
        required: true,
    }),
    key: new base_1.StringParameter({
        help: "The key of the configuration variable.",
        required: true,
    }),
};
// TODO: allow omitting key to return all configs
class GetSecretCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "secret";
        this.help = "Get a secret from the environment.";
        this.description = dedent `
    Returns with an error if the provided key could not be found.

    Examples:

        garden get secret kubernetes somekey
        garden get secret local-kubernetes some-other-key
  `;
        this.arguments = getSecretArgs;
    }
    action({ garden, args }) {
        return __awaiter(this, void 0, void 0, function* () {
            const key = args.key;
            const { value } = yield garden.actions.getSecret({ pluginName: args.provider, key });
            if (value === null || value === undefined) {
                throw new exceptions_1.NotFoundError(`Could not find config key ${key}`, { key });
            }
            garden.log.info(value);
            return { [key]: value };
        });
    }
}
exports.GetSecretCommand = GetSecretCommand;
class GetStatusCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "status";
        this.help = "Outputs the status of your environment.";
    }
    action({ garden }) {
        return __awaiter(this, void 0, void 0, function* () {
            const status = yield garden.actions.getStatus();
            const yamlStatus = yaml.safeDump(status, { noRefs: true, skipInvalid: true });
            // TODO: do a nicer print of this by default and add --yaml/--json options (maybe globally) for exporting
            garden.log.info(util_1.highlightYaml(yamlStatus));
            return { result: status };
        });
    }
}
exports.GetStatusCommand = GetStatusCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL2dldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7O0FBRUgsZ0NBQStCO0FBQy9CLDhDQUE2QztBQUM3Qyx1Q0FBNEM7QUFDNUMsaUNBS2U7QUFDZixpQ0FBaUM7QUFHakMsTUFBYSxVQUFXLFNBQVEsY0FBTztJQUF2Qzs7UUFDRSxTQUFJLEdBQUcsS0FBSyxDQUFBO1FBQ1osU0FBSSxHQUFHLHNFQUFzRSxDQUFBO1FBRTdFLGdCQUFXLEdBQUc7WUFDWixnQkFBZ0I7WUFDaEIsZ0JBQWdCO1NBQ2pCLENBQUE7SUFHSCxDQUFDO0lBRE8sTUFBTTs4REFBSyxPQUFPLEVBQUUsQ0FBQSxDQUFDLENBQUM7S0FBQTtDQUM3QjtBQVZELGdDQVVDO0FBRUQsTUFBTSxhQUFhLEdBQUc7SUFDcEIsUUFBUSxFQUFFLElBQUksc0JBQWUsQ0FBQztRQUM1QixJQUFJLEVBQUUsbURBQW1EO1FBQ3pELFFBQVEsRUFBRSxJQUFJO0tBQ2YsQ0FBQztJQUNGLEdBQUcsRUFBRSxJQUFJLHNCQUFlLENBQUM7UUFDdkIsSUFBSSxFQUFFLHdDQUF3QztRQUM5QyxRQUFRLEVBQUUsSUFBSTtLQUNmLENBQUM7Q0FDSCxDQUFBO0FBSUQsaURBQWlEO0FBRWpELE1BQWEsZ0JBQWlCLFNBQVEsY0FBNkI7SUFBbkU7O1FBQ0UsU0FBSSxHQUFHLFFBQVEsQ0FBQTtRQUNmLFNBQUksR0FBRyxvQ0FBb0MsQ0FBQTtRQUUzQyxnQkFBVyxHQUFHLE1BQU0sQ0FBQTs7Ozs7OztHQU9uQixDQUFBO1FBRUQsY0FBUyxHQUFHLGFBQWEsQ0FBQTtJQWMzQixDQUFDO0lBWk8sTUFBTSxDQUFDLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBMEI7O1lBQ25ELE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUE7WUFDcEIsTUFBTSxFQUFFLEtBQUssRUFBRSxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFBO1lBRXBGLElBQUksS0FBSyxLQUFLLElBQUksSUFBSSxLQUFLLEtBQUssU0FBUyxFQUFFO2dCQUN6QyxNQUFNLElBQUksMEJBQWEsQ0FBQyw2QkFBNkIsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFBO2FBQ3JFO1lBRUQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUE7WUFFdEIsT0FBTyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUE7UUFDekIsQ0FBQztLQUFBO0NBQ0Y7QUEzQkQsNENBMkJDO0FBRUQsTUFBYSxnQkFBaUIsU0FBUSxjQUFPO0lBQTdDOztRQUNFLFNBQUksR0FBRyxRQUFRLENBQUE7UUFDZixTQUFJLEdBQUcseUNBQXlDLENBQUE7SUFXbEQsQ0FBQztJQVRPLE1BQU0sQ0FBQyxFQUFFLE1BQU0sRUFBaUI7O1lBQ3BDLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQTtZQUMvQyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUE7WUFFN0UseUdBQXlHO1lBQ3pHLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLG9CQUFhLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQTtZQUUxQyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFBO1FBQzNCLENBQUM7S0FBQTtDQUNGO0FBYkQsNENBYUMiLCJmaWxlIjoiY29tbWFuZHMvZ2V0LmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCAqIGFzIHlhbWwgZnJvbSBcImpzLXlhbWxcIlxuaW1wb3J0IHsgTm90Rm91bmRFcnJvciB9IGZyb20gXCIuLi9leGNlcHRpb25zXCJcbmltcG9ydCB7IGhpZ2hsaWdodFlhbWwgfSBmcm9tIFwiLi4vdXRpbC91dGlsXCJcbmltcG9ydCB7XG4gIENvbW1hbmQsXG4gIENvbW1hbmRSZXN1bHQsXG4gIENvbW1hbmRQYXJhbXMsXG4gIFN0cmluZ1BhcmFtZXRlcixcbn0gZnJvbSBcIi4vYmFzZVwiXG5pbXBvcnQgZGVkZW50ID0gcmVxdWlyZShcImRlZGVudFwiKVxuaW1wb3J0IHsgQ29udGV4dFN0YXR1cyB9IGZyb20gXCIuLi9hY3Rpb25zXCJcblxuZXhwb3J0IGNsYXNzIEdldENvbW1hbmQgZXh0ZW5kcyBDb21tYW5kIHtcbiAgbmFtZSA9IFwiZ2V0XCJcbiAgaGVscCA9IFwiUmV0cmlldmUgYW5kIG91dHB1dCBkYXRhIGFuZCBvYmplY3RzLCBlLmcuIHNlY3JldHMsIHN0YXR1cyBpbmZvIGV0Yy5cIlxuXG4gIHN1YkNvbW1hbmRzID0gW1xuICAgIEdldFNlY3JldENvbW1hbmQsXG4gICAgR2V0U3RhdHVzQ29tbWFuZCxcbiAgXVxuXG4gIGFzeW5jIGFjdGlvbigpIHsgcmV0dXJuIHt9IH1cbn1cblxuY29uc3QgZ2V0U2VjcmV0QXJncyA9IHtcbiAgcHJvdmlkZXI6IG5ldyBTdHJpbmdQYXJhbWV0ZXIoe1xuICAgIGhlbHA6IFwiVGhlIG5hbWUgb2YgdGhlIHByb3ZpZGVyIHRvIHJlYWQgdGhlIHNlY3JldCBmcm9tLlwiLFxuICAgIHJlcXVpcmVkOiB0cnVlLFxuICB9KSxcbiAga2V5OiBuZXcgU3RyaW5nUGFyYW1ldGVyKHtcbiAgICBoZWxwOiBcIlRoZSBrZXkgb2YgdGhlIGNvbmZpZ3VyYXRpb24gdmFyaWFibGUuXCIsXG4gICAgcmVxdWlyZWQ6IHRydWUsXG4gIH0pLFxufVxuXG50eXBlIEdldEFyZ3MgPSB0eXBlb2YgZ2V0U2VjcmV0QXJnc1xuXG4vLyBUT0RPOiBhbGxvdyBvbWl0dGluZyBrZXkgdG8gcmV0dXJuIGFsbCBjb25maWdzXG5cbmV4cG9ydCBjbGFzcyBHZXRTZWNyZXRDb21tYW5kIGV4dGVuZHMgQ29tbWFuZDx0eXBlb2YgZ2V0U2VjcmV0QXJncz4ge1xuICBuYW1lID0gXCJzZWNyZXRcIlxuICBoZWxwID0gXCJHZXQgYSBzZWNyZXQgZnJvbSB0aGUgZW52aXJvbm1lbnQuXCJcblxuICBkZXNjcmlwdGlvbiA9IGRlZGVudGBcbiAgICBSZXR1cm5zIHdpdGggYW4gZXJyb3IgaWYgdGhlIHByb3ZpZGVkIGtleSBjb3VsZCBub3QgYmUgZm91bmQuXG5cbiAgICBFeGFtcGxlczpcblxuICAgICAgICBnYXJkZW4gZ2V0IHNlY3JldCBrdWJlcm5ldGVzIHNvbWVrZXlcbiAgICAgICAgZ2FyZGVuIGdldCBzZWNyZXQgbG9jYWwta3ViZXJuZXRlcyBzb21lLW90aGVyLWtleVxuICBgXG5cbiAgYXJndW1lbnRzID0gZ2V0U2VjcmV0QXJnc1xuXG4gIGFzeW5jIGFjdGlvbih7IGdhcmRlbiwgYXJncyB9OiBDb21tYW5kUGFyYW1zPEdldEFyZ3M+KTogUHJvbWlzZTxDb21tYW5kUmVzdWx0PiB7XG4gICAgY29uc3Qga2V5ID0gYXJncy5rZXlcbiAgICBjb25zdCB7IHZhbHVlIH0gPSBhd2FpdCBnYXJkZW4uYWN0aW9ucy5nZXRTZWNyZXQoeyBwbHVnaW5OYW1lOiBhcmdzLnByb3ZpZGVyLCBrZXkgfSlcblxuICAgIGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICB0aHJvdyBuZXcgTm90Rm91bmRFcnJvcihgQ291bGQgbm90IGZpbmQgY29uZmlnIGtleSAke2tleX1gLCB7IGtleSB9KVxuICAgIH1cblxuICAgIGdhcmRlbi5sb2cuaW5mbyh2YWx1ZSlcblxuICAgIHJldHVybiB7IFtrZXldOiB2YWx1ZSB9XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEdldFN0YXR1c0NvbW1hbmQgZXh0ZW5kcyBDb21tYW5kIHtcbiAgbmFtZSA9IFwic3RhdHVzXCJcbiAgaGVscCA9IFwiT3V0cHV0cyB0aGUgc3RhdHVzIG9mIHlvdXIgZW52aXJvbm1lbnQuXCJcblxuICBhc3luYyBhY3Rpb24oeyBnYXJkZW4gfTogQ29tbWFuZFBhcmFtcyk6IFByb21pc2U8Q29tbWFuZFJlc3VsdDxDb250ZXh0U3RhdHVzPj4ge1xuICAgIGNvbnN0IHN0YXR1cyA9IGF3YWl0IGdhcmRlbi5hY3Rpb25zLmdldFN0YXR1cygpXG4gICAgY29uc3QgeWFtbFN0YXR1cyA9IHlhbWwuc2FmZUR1bXAoc3RhdHVzLCB7IG5vUmVmczogdHJ1ZSwgc2tpcEludmFsaWQ6IHRydWUgfSlcblxuICAgIC8vIFRPRE86IGRvIGEgbmljZXIgcHJpbnQgb2YgdGhpcyBieSBkZWZhdWx0IGFuZCBhZGQgLS15YW1sLy0tanNvbiBvcHRpb25zIChtYXliZSBnbG9iYWxseSkgZm9yIGV4cG9ydGluZ1xuICAgIGdhcmRlbi5sb2cuaW5mbyhoaWdobGlnaHRZYW1sKHlhbWxTdGF0dXMpKVxuXG4gICAgcmV0dXJuIHsgcmVzdWx0OiBzdGF0dXMgfVxuICB9XG59XG4iXX0=
