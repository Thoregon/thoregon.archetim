/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import { source, insertBlanksAtBeginning } from "/evolux.util/lib/stringutil.mjs";

export default class RepositoryEntryVersions {

    constructor() {
        this.versions = {};
    }

    asSource(indent) {
        let str = '{';
        Object.entries(this.versions).forEach(([version, entry]) => {
            // str += `\n` + entry.asSource(indent);
            str += insertBlanksAtBeginning(`\n'${version}': ` + entry.asSource(indent), 4, false);
        })
        str += '\n}'
        return insertBlanksAtBeginning(str, 4, false);
    }

    setVersionEntry(version, entry) {
        this.versions[version] = entry;
    }
}
