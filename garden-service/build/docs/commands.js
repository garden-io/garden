"use strict";
/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const handlebars = require("handlebars");
const path_1 = require("path");
const cli_1 = require("../cli/cli");
const commands_1 = require("../commands/commands");
const lodash_1 = require("lodash");
const base_1 = require("../commands/base");
function generateCommandReferenceDocs(docsRoot) {
    const referenceDir = path_1.resolve(docsRoot, "reference");
    const outputPath = path_1.resolve(referenceDir, "commands.md");
    const commands = lodash_1.flatten(commands_1.coreCommands.map(cmd => {
        if (cmd.subCommands && cmd.subCommands.length) {
            return cmd.subCommands.map(subCommandCls => new subCommandCls(cmd).describe());
        }
        else {
            return [cmd.describe()];
        }
    }));
    const globalOptions = base_1.describeParameters(cli_1.GLOBAL_OPTIONS);
    const templatePath = path_1.resolve(__dirname, "templates", "commands.hbs");
    handlebars.registerPartial("argType", "{{#if choices}}{{#each choices}}`{{.}}` {{/each}}{{else}}{{type}}{{/if}}");
    const template = handlebars.compile(fs_1.readFileSync(templatePath).toString());
    const markdown = template({ commands, globalOptions });
    fs_1.writeFileSync(outputPath, markdown);
}
exports.generateCommandReferenceDocs = generateCommandReferenceDocs;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImRvY3MvY29tbWFuZHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7QUFFSCwyQkFHVztBQUNYLHlDQUF3QztBQUN4QywrQkFBOEI7QUFDOUIsb0NBQTJDO0FBQzNDLG1EQUFtRDtBQUNuRCxtQ0FBZ0M7QUFDaEMsMkNBQXFEO0FBRXJELFNBQWdCLDRCQUE0QixDQUFDLFFBQWdCO0lBQzNELE1BQU0sWUFBWSxHQUFHLGNBQU8sQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDLENBQUE7SUFDbkQsTUFBTSxVQUFVLEdBQUcsY0FBTyxDQUFDLFlBQVksRUFBRSxhQUFhLENBQUMsQ0FBQTtJQUV2RCxNQUFNLFFBQVEsR0FBRyxnQkFBTyxDQUFDLHVCQUFZLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFO1FBQzlDLElBQUksR0FBRyxDQUFDLFdBQVcsSUFBSSxHQUFHLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRTtZQUM3QyxPQUFPLEdBQUcsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsSUFBSSxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQTtTQUMvRTthQUFNO1lBQ0wsT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFBO1NBQ3hCO0lBQ0gsQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUVILE1BQU0sYUFBYSxHQUFHLHlCQUFrQixDQUFDLG9CQUFjLENBQUMsQ0FBQTtJQUV4RCxNQUFNLFlBQVksR0FBRyxjQUFPLENBQUMsU0FBUyxFQUFFLFdBQVcsRUFBRSxjQUFjLENBQUMsQ0FBQTtJQUNwRSxVQUFVLENBQUMsZUFBZSxDQUN4QixTQUFTLEVBQ1QsMEVBQTBFLENBQzNFLENBQUE7SUFDRCxNQUFNLFFBQVEsR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDLGlCQUFZLENBQUMsWUFBWSxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQTtJQUMxRSxNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsRUFBRSxRQUFRLEVBQUUsYUFBYSxFQUFFLENBQUMsQ0FBQTtJQUV0RCxrQkFBYSxDQUFDLFVBQVUsRUFBRSxRQUFRLENBQUMsQ0FBQTtBQUNyQyxDQUFDO0FBdkJELG9FQXVCQyIsImZpbGUiOiJkb2NzL2NvbW1hbmRzLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7XG4gIHJlYWRGaWxlU3luYyxcbiAgd3JpdGVGaWxlU3luYyxcbn0gZnJvbSBcImZzXCJcbmltcG9ydCAqIGFzIGhhbmRsZWJhcnMgZnJvbSBcImhhbmRsZWJhcnNcIlxuaW1wb3J0IHsgcmVzb2x2ZSB9IGZyb20gXCJwYXRoXCJcbmltcG9ydCB7IEdMT0JBTF9PUFRJT05TIH0gZnJvbSBcIi4uL2NsaS9jbGlcIlxuaW1wb3J0IHsgY29yZUNvbW1hbmRzIH0gZnJvbSBcIi4uL2NvbW1hbmRzL2NvbW1hbmRzXCJcbmltcG9ydCB7IGZsYXR0ZW4gfSBmcm9tIFwibG9kYXNoXCJcbmltcG9ydCB7IGRlc2NyaWJlUGFyYW1ldGVycyB9IGZyb20gXCIuLi9jb21tYW5kcy9iYXNlXCJcblxuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQ29tbWFuZFJlZmVyZW5jZURvY3MoZG9jc1Jvb3Q6IHN0cmluZykge1xuICBjb25zdCByZWZlcmVuY2VEaXIgPSByZXNvbHZlKGRvY3NSb290LCBcInJlZmVyZW5jZVwiKVxuICBjb25zdCBvdXRwdXRQYXRoID0gcmVzb2x2ZShyZWZlcmVuY2VEaXIsIFwiY29tbWFuZHMubWRcIilcblxuICBjb25zdCBjb21tYW5kcyA9IGZsYXR0ZW4oY29yZUNvbW1hbmRzLm1hcChjbWQgPT4ge1xuICAgIGlmIChjbWQuc3ViQ29tbWFuZHMgJiYgY21kLnN1YkNvbW1hbmRzLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIGNtZC5zdWJDb21tYW5kcy5tYXAoc3ViQ29tbWFuZENscyA9PiBuZXcgc3ViQ29tbWFuZENscyhjbWQpLmRlc2NyaWJlKCkpXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBbY21kLmRlc2NyaWJlKCldXG4gICAgfVxuICB9KSlcblxuICBjb25zdCBnbG9iYWxPcHRpb25zID0gZGVzY3JpYmVQYXJhbWV0ZXJzKEdMT0JBTF9PUFRJT05TKVxuXG4gIGNvbnN0IHRlbXBsYXRlUGF0aCA9IHJlc29sdmUoX19kaXJuYW1lLCBcInRlbXBsYXRlc1wiLCBcImNvbW1hbmRzLmhic1wiKVxuICBoYW5kbGViYXJzLnJlZ2lzdGVyUGFydGlhbChcbiAgICBcImFyZ1R5cGVcIixcbiAgICBcInt7I2lmIGNob2ljZXN9fXt7I2VhY2ggY2hvaWNlc319YHt7Ln19YCB7ey9lYWNofX17e2Vsc2V9fXt7dHlwZX19e3svaWZ9fVwiLFxuICApXG4gIGNvbnN0IHRlbXBsYXRlID0gaGFuZGxlYmFycy5jb21waWxlKHJlYWRGaWxlU3luYyh0ZW1wbGF0ZVBhdGgpLnRvU3RyaW5nKCkpXG4gIGNvbnN0IG1hcmtkb3duID0gdGVtcGxhdGUoeyBjb21tYW5kcywgZ2xvYmFsT3B0aW9ucyB9KVxuXG4gIHdyaXRlRmlsZVN5bmMob3V0cHV0UGF0aCwgbWFya2Rvd24pXG59XG4iXX0=
