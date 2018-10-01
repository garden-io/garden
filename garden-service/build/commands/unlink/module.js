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
const dedent = require("dedent");
const base_1 = require("../base");
const ext_source_util_1 = require("../../util/ext-source-util");
const config_store_1 = require("../../config-store");
const unlinkModuleArguments = {
    module: new base_1.StringsParameter({
        help: "Name of the module(s) to unlink. Use comma separator to specify multiple modules.",
    }),
};
const unlinkModuleOptions = {
    all: new base_1.BooleanParameter({
        help: "Unlink all modules.",
        alias: "a",
    }),
};
class UnlinkModuleCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "module";
        this.help = "Unlink a previously linked remote module from its local directory.";
        this.arguments = unlinkModuleArguments;
        this.options = unlinkModuleOptions;
        this.description = dedent `
    After unlinking a remote module, Garden will go back to reading the module's source from
    its remote URL instead of its local directory.

    Examples:

        garden unlink module my-module # unlinks my-module
        garden unlink module --all # unlink all modules
  `;
    }
    action({ garden, args, opts }) {
        return __awaiter(this, void 0, void 0, function* () {
            garden.log.header({ emoji: "chains", command: "unlink module" });
            const sourceType = "module";
            const { module = [] } = args;
            if (opts.all) {
                yield garden.localConfigStore.set([config_store_1.localConfigKeys.linkedModuleSources], []);
                garden.log.info("Unlinked all modules");
                return { result: [] };
            }
            const linkedModuleSources = yield ext_source_util_1.removeLinkedSources({ garden, sourceType, names: module });
            garden.log.info(`Unlinked module(s) ${module}`);
            return { result: linkedModuleSources };
        });
    }
}
exports.UnlinkModuleCommand = UnlinkModuleCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL3VubGluay9tb2R1bGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7OztBQUVILGlDQUFpQztBQUVqQyxrQ0FNZ0I7QUFDaEIsZ0VBQWdFO0FBQ2hFLHFEQUcyQjtBQUUzQixNQUFNLHFCQUFxQixHQUFHO0lBQzVCLE1BQU0sRUFBRSxJQUFJLHVCQUFnQixDQUFDO1FBQzNCLElBQUksRUFBRSxtRkFBbUY7S0FDMUYsQ0FBQztDQUNILENBQUE7QUFFRCxNQUFNLG1CQUFtQixHQUFHO0lBQzFCLEdBQUcsRUFBRSxJQUFJLHVCQUFnQixDQUFDO1FBQ3hCLElBQUksRUFBRSxxQkFBcUI7UUFDM0IsS0FBSyxFQUFFLEdBQUc7S0FDWCxDQUFDO0NBQ0gsQ0FBQTtBQUtELE1BQWEsbUJBQW9CLFNBQVEsY0FBbUI7SUFBNUQ7O1FBQ0UsU0FBSSxHQUFHLFFBQVEsQ0FBQTtRQUNmLFNBQUksR0FBRyxvRUFBb0UsQ0FBQTtRQUMzRSxjQUFTLEdBQUcscUJBQXFCLENBQUE7UUFDakMsWUFBTyxHQUFHLG1CQUFtQixDQUFBO1FBRTdCLGdCQUFXLEdBQUcsTUFBTSxDQUFBOzs7Ozs7OztHQVFuQixDQUFBO0lBcUJILENBQUM7SUFuQk8sTUFBTSxDQUFDLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQTZCOztZQUM1RCxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxDQUFDLENBQUE7WUFFaEUsTUFBTSxVQUFVLEdBQUcsUUFBUSxDQUFBO1lBRTNCLE1BQU0sRUFBRSxNQUFNLEdBQUcsRUFBRSxFQUFFLEdBQUcsSUFBSSxDQUFBO1lBRTVCLElBQUksSUFBSSxDQUFDLEdBQUcsRUFBRTtnQkFDWixNQUFNLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyw4QkFBZSxDQUFDLG1CQUFtQixDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUE7Z0JBQzVFLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLENBQUE7Z0JBQ3ZDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRSxFQUFFLENBQUE7YUFDdEI7WUFFRCxNQUFNLG1CQUFtQixHQUFHLE1BQU0scUNBQW1CLENBQUMsRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFBO1lBRTVGLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHNCQUFzQixNQUFNLEVBQUUsQ0FBQyxDQUFBO1lBRS9DLE9BQU8sRUFBRSxNQUFNLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQTtRQUN4QyxDQUFDO0tBQUE7Q0FDRjtBQW5DRCxrREFtQ0MiLCJmaWxlIjoiY29tbWFuZHMvdW5saW5rL21vZHVsZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgZGVkZW50ID0gcmVxdWlyZShcImRlZGVudFwiKVxuXG5pbXBvcnQge1xuICBDb21tYW5kLFxuICBDb21tYW5kUmVzdWx0LFxuICBTdHJpbmdzUGFyYW1ldGVyLFxuICBCb29sZWFuUGFyYW1ldGVyLFxuICBDb21tYW5kUGFyYW1zLFxufSBmcm9tIFwiLi4vYmFzZVwiXG5pbXBvcnQgeyByZW1vdmVMaW5rZWRTb3VyY2VzIH0gZnJvbSBcIi4uLy4uL3V0aWwvZXh0LXNvdXJjZS11dGlsXCJcbmltcG9ydCB7XG4gIGxvY2FsQ29uZmlnS2V5cyxcbiAgTGlua2VkU291cmNlLFxufSBmcm9tIFwiLi4vLi4vY29uZmlnLXN0b3JlXCJcblxuY29uc3QgdW5saW5rTW9kdWxlQXJndW1lbnRzID0ge1xuICBtb2R1bGU6IG5ldyBTdHJpbmdzUGFyYW1ldGVyKHtcbiAgICBoZWxwOiBcIk5hbWUgb2YgdGhlIG1vZHVsZShzKSB0byB1bmxpbmsuIFVzZSBjb21tYSBzZXBhcmF0b3IgdG8gc3BlY2lmeSBtdWx0aXBsZSBtb2R1bGVzLlwiLFxuICB9KSxcbn1cblxuY29uc3QgdW5saW5rTW9kdWxlT3B0aW9ucyA9IHtcbiAgYWxsOiBuZXcgQm9vbGVhblBhcmFtZXRlcih7XG4gICAgaGVscDogXCJVbmxpbmsgYWxsIG1vZHVsZXMuXCIsXG4gICAgYWxpYXM6IFwiYVwiLFxuICB9KSxcbn1cblxudHlwZSBBcmdzID0gdHlwZW9mIHVubGlua01vZHVsZUFyZ3VtZW50c1xudHlwZSBPcHRzID0gdHlwZW9mIHVubGlua01vZHVsZU9wdGlvbnNcblxuZXhwb3J0IGNsYXNzIFVubGlua01vZHVsZUNvbW1hbmQgZXh0ZW5kcyBDb21tYW5kPEFyZ3MsIE9wdHM+IHtcbiAgbmFtZSA9IFwibW9kdWxlXCJcbiAgaGVscCA9IFwiVW5saW5rIGEgcHJldmlvdXNseSBsaW5rZWQgcmVtb3RlIG1vZHVsZSBmcm9tIGl0cyBsb2NhbCBkaXJlY3RvcnkuXCJcbiAgYXJndW1lbnRzID0gdW5saW5rTW9kdWxlQXJndW1lbnRzXG4gIG9wdGlvbnMgPSB1bmxpbmtNb2R1bGVPcHRpb25zXG5cbiAgZGVzY3JpcHRpb24gPSBkZWRlbnRgXG4gICAgQWZ0ZXIgdW5saW5raW5nIGEgcmVtb3RlIG1vZHVsZSwgR2FyZGVuIHdpbGwgZ28gYmFjayB0byByZWFkaW5nIHRoZSBtb2R1bGUncyBzb3VyY2UgZnJvbVxuICAgIGl0cyByZW1vdGUgVVJMIGluc3RlYWQgb2YgaXRzIGxvY2FsIGRpcmVjdG9yeS5cblxuICAgIEV4YW1wbGVzOlxuXG4gICAgICAgIGdhcmRlbiB1bmxpbmsgbW9kdWxlIG15LW1vZHVsZSAjIHVubGlua3MgbXktbW9kdWxlXG4gICAgICAgIGdhcmRlbiB1bmxpbmsgbW9kdWxlIC0tYWxsICMgdW5saW5rIGFsbCBtb2R1bGVzXG4gIGBcblxuICBhc3luYyBhY3Rpb24oeyBnYXJkZW4sIGFyZ3MsIG9wdHMgfTogQ29tbWFuZFBhcmFtczxBcmdzLCBPcHRzPik6IFByb21pc2U8Q29tbWFuZFJlc3VsdDxMaW5rZWRTb3VyY2VbXT4+IHtcbiAgICBnYXJkZW4ubG9nLmhlYWRlcih7IGVtb2ppOiBcImNoYWluc1wiLCBjb21tYW5kOiBcInVubGluayBtb2R1bGVcIiB9KVxuXG4gICAgY29uc3Qgc291cmNlVHlwZSA9IFwibW9kdWxlXCJcblxuICAgIGNvbnN0IHsgbW9kdWxlID0gW10gfSA9IGFyZ3NcblxuICAgIGlmIChvcHRzLmFsbCkge1xuICAgICAgYXdhaXQgZ2FyZGVuLmxvY2FsQ29uZmlnU3RvcmUuc2V0KFtsb2NhbENvbmZpZ0tleXMubGlua2VkTW9kdWxlU291cmNlc10sIFtdKVxuICAgICAgZ2FyZGVuLmxvZy5pbmZvKFwiVW5saW5rZWQgYWxsIG1vZHVsZXNcIilcbiAgICAgIHJldHVybiB7IHJlc3VsdDogW10gfVxuICAgIH1cblxuICAgIGNvbnN0IGxpbmtlZE1vZHVsZVNvdXJjZXMgPSBhd2FpdCByZW1vdmVMaW5rZWRTb3VyY2VzKHsgZ2FyZGVuLCBzb3VyY2VUeXBlLCBuYW1lczogbW9kdWxlIH0pXG5cbiAgICBnYXJkZW4ubG9nLmluZm8oYFVubGlua2VkIG1vZHVsZShzKSAke21vZHVsZX1gKVxuXG4gICAgcmV0dXJuIHsgcmVzdWx0OiBsaW5rZWRNb2R1bGVTb3VyY2VzIH1cbiAgfVxufVxuIl19
