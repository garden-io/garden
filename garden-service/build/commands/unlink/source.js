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
const unlinkSourceArguments = {
    source: new base_1.StringsParameter({
        help: "Name of the source(s) to unlink. Use comma separator to specify multiple sources.",
    }),
};
const unlinkSourceOptions = {
    all: new base_1.BooleanParameter({
        help: "Unlink all sources.",
        alias: "a",
    }),
};
class UnlinkSourceCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "source";
        this.help = "Unlink a previously linked remote source from its local directory.";
        this.arguments = unlinkSourceArguments;
        this.options = unlinkSourceOptions;
        this.description = dedent `
    After unlinking a remote source, Garden will go back to reading it from its remote URL instead
    of its local directory.

    Examples:

        garden unlink source my-source # unlinks my-source
        garden unlink source --all # unlinks all sources
  `;
    }
    action({ garden, args, opts }) {
        return __awaiter(this, void 0, void 0, function* () {
            garden.log.header({ emoji: "chains", command: "unlink source" });
            const sourceType = "project";
            const { source = [] } = args;
            if (opts.all) {
                yield garden.localConfigStore.set([config_store_1.localConfigKeys.linkedProjectSources], []);
                garden.log.info("Unlinked all sources");
                return { result: [] };
            }
            const linkedProjectSources = yield ext_source_util_1.removeLinkedSources({ garden, sourceType, names: source });
            garden.log.info(`Unlinked source(s) ${source}`);
            return { result: linkedProjectSources };
        });
    }
}
exports.UnlinkSourceCommand = UnlinkSourceCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL3VubGluay9zb3VyY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7OztBQUVILGlDQUFpQztBQUVqQyxrQ0FNZ0I7QUFDaEIsZ0VBQWdFO0FBQ2hFLHFEQUcyQjtBQUUzQixNQUFNLHFCQUFxQixHQUFHO0lBQzVCLE1BQU0sRUFBRSxJQUFJLHVCQUFnQixDQUFDO1FBQzNCLElBQUksRUFBRSxtRkFBbUY7S0FDMUYsQ0FBQztDQUNILENBQUE7QUFFRCxNQUFNLG1CQUFtQixHQUFHO0lBQzFCLEdBQUcsRUFBRSxJQUFJLHVCQUFnQixDQUFDO1FBQ3hCLElBQUksRUFBRSxxQkFBcUI7UUFDM0IsS0FBSyxFQUFFLEdBQUc7S0FDWCxDQUFDO0NBQ0gsQ0FBQTtBQUtELE1BQWEsbUJBQW9CLFNBQVEsY0FBbUI7SUFBNUQ7O1FBQ0UsU0FBSSxHQUFHLFFBQVEsQ0FBQTtRQUNmLFNBQUksR0FBRyxvRUFBb0UsQ0FBQTtRQUMzRSxjQUFTLEdBQUcscUJBQXFCLENBQUE7UUFDakMsWUFBTyxHQUFHLG1CQUFtQixDQUFBO1FBRTdCLGdCQUFXLEdBQUcsTUFBTSxDQUFBOzs7Ozs7OztHQVFuQixDQUFBO0lBcUJILENBQUM7SUFuQk8sTUFBTSxDQUFDLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQTZCOztZQUM1RCxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxDQUFDLENBQUE7WUFFaEUsTUFBTSxVQUFVLEdBQUcsU0FBUyxDQUFBO1lBRTVCLE1BQU0sRUFBRSxNQUFNLEdBQUcsRUFBRSxFQUFFLEdBQUcsSUFBSSxDQUFBO1lBRTVCLElBQUksSUFBSSxDQUFDLEdBQUcsRUFBRTtnQkFDWixNQUFNLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyw4QkFBZSxDQUFDLG9CQUFvQixDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUE7Z0JBQzdFLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLENBQUE7Z0JBQ3ZDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRSxFQUFFLENBQUE7YUFDdEI7WUFFRCxNQUFNLG9CQUFvQixHQUFHLE1BQU0scUNBQW1CLENBQUMsRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFBO1lBRTdGLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHNCQUFzQixNQUFNLEVBQUUsQ0FBQyxDQUFBO1lBRS9DLE9BQU8sRUFBRSxNQUFNLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQTtRQUN6QyxDQUFDO0tBQUE7Q0FDRjtBQW5DRCxrREFtQ0MiLCJmaWxlIjoiY29tbWFuZHMvdW5saW5rL3NvdXJjZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgZGVkZW50ID0gcmVxdWlyZShcImRlZGVudFwiKVxuXG5pbXBvcnQge1xuICBDb21tYW5kLFxuICBDb21tYW5kUmVzdWx0LFxuICBTdHJpbmdzUGFyYW1ldGVyLFxuICBCb29sZWFuUGFyYW1ldGVyLFxuICBDb21tYW5kUGFyYW1zLFxufSBmcm9tIFwiLi4vYmFzZVwiXG5pbXBvcnQgeyByZW1vdmVMaW5rZWRTb3VyY2VzIH0gZnJvbSBcIi4uLy4uL3V0aWwvZXh0LXNvdXJjZS11dGlsXCJcbmltcG9ydCB7XG4gIGxvY2FsQ29uZmlnS2V5cyxcbiAgTGlua2VkU291cmNlLFxufSBmcm9tIFwiLi4vLi4vY29uZmlnLXN0b3JlXCJcblxuY29uc3QgdW5saW5rU291cmNlQXJndW1lbnRzID0ge1xuICBzb3VyY2U6IG5ldyBTdHJpbmdzUGFyYW1ldGVyKHtcbiAgICBoZWxwOiBcIk5hbWUgb2YgdGhlIHNvdXJjZShzKSB0byB1bmxpbmsuIFVzZSBjb21tYSBzZXBhcmF0b3IgdG8gc3BlY2lmeSBtdWx0aXBsZSBzb3VyY2VzLlwiLFxuICB9KSxcbn1cblxuY29uc3QgdW5saW5rU291cmNlT3B0aW9ucyA9IHtcbiAgYWxsOiBuZXcgQm9vbGVhblBhcmFtZXRlcih7XG4gICAgaGVscDogXCJVbmxpbmsgYWxsIHNvdXJjZXMuXCIsXG4gICAgYWxpYXM6IFwiYVwiLFxuICB9KSxcbn1cblxudHlwZSBBcmdzID0gdHlwZW9mIHVubGlua1NvdXJjZUFyZ3VtZW50c1xudHlwZSBPcHRzID0gdHlwZW9mIHVubGlua1NvdXJjZU9wdGlvbnNcblxuZXhwb3J0IGNsYXNzIFVubGlua1NvdXJjZUNvbW1hbmQgZXh0ZW5kcyBDb21tYW5kPEFyZ3MsIE9wdHM+IHtcbiAgbmFtZSA9IFwic291cmNlXCJcbiAgaGVscCA9IFwiVW5saW5rIGEgcHJldmlvdXNseSBsaW5rZWQgcmVtb3RlIHNvdXJjZSBmcm9tIGl0cyBsb2NhbCBkaXJlY3RvcnkuXCJcbiAgYXJndW1lbnRzID0gdW5saW5rU291cmNlQXJndW1lbnRzXG4gIG9wdGlvbnMgPSB1bmxpbmtTb3VyY2VPcHRpb25zXG5cbiAgZGVzY3JpcHRpb24gPSBkZWRlbnRgXG4gICAgQWZ0ZXIgdW5saW5raW5nIGEgcmVtb3RlIHNvdXJjZSwgR2FyZGVuIHdpbGwgZ28gYmFjayB0byByZWFkaW5nIGl0IGZyb20gaXRzIHJlbW90ZSBVUkwgaW5zdGVhZFxuICAgIG9mIGl0cyBsb2NhbCBkaXJlY3RvcnkuXG5cbiAgICBFeGFtcGxlczpcblxuICAgICAgICBnYXJkZW4gdW5saW5rIHNvdXJjZSBteS1zb3VyY2UgIyB1bmxpbmtzIG15LXNvdXJjZVxuICAgICAgICBnYXJkZW4gdW5saW5rIHNvdXJjZSAtLWFsbCAjIHVubGlua3MgYWxsIHNvdXJjZXNcbiAgYFxuXG4gIGFzeW5jIGFjdGlvbih7IGdhcmRlbiwgYXJncywgb3B0cyB9OiBDb21tYW5kUGFyYW1zPEFyZ3MsIE9wdHM+KTogUHJvbWlzZTxDb21tYW5kUmVzdWx0PExpbmtlZFNvdXJjZVtdPj4ge1xuICAgIGdhcmRlbi5sb2cuaGVhZGVyKHsgZW1vamk6IFwiY2hhaW5zXCIsIGNvbW1hbmQ6IFwidW5saW5rIHNvdXJjZVwiIH0pXG5cbiAgICBjb25zdCBzb3VyY2VUeXBlID0gXCJwcm9qZWN0XCJcblxuICAgIGNvbnN0IHsgc291cmNlID0gW10gfSA9IGFyZ3NcblxuICAgIGlmIChvcHRzLmFsbCkge1xuICAgICAgYXdhaXQgZ2FyZGVuLmxvY2FsQ29uZmlnU3RvcmUuc2V0KFtsb2NhbENvbmZpZ0tleXMubGlua2VkUHJvamVjdFNvdXJjZXNdLCBbXSlcbiAgICAgIGdhcmRlbi5sb2cuaW5mbyhcIlVubGlua2VkIGFsbCBzb3VyY2VzXCIpXG4gICAgICByZXR1cm4geyByZXN1bHQ6IFtdIH1cbiAgICB9XG5cbiAgICBjb25zdCBsaW5rZWRQcm9qZWN0U291cmNlcyA9IGF3YWl0IHJlbW92ZUxpbmtlZFNvdXJjZXMoeyBnYXJkZW4sIHNvdXJjZVR5cGUsIG5hbWVzOiBzb3VyY2UgfSlcblxuICAgIGdhcmRlbi5sb2cuaW5mbyhgVW5saW5rZWQgc291cmNlKHMpICR7c291cmNlfWApXG5cbiAgICByZXR1cm4geyByZXN1bHQ6IGxpbmtlZFByb2plY3RTb3VyY2VzIH1cbiAgfVxufVxuIl19
