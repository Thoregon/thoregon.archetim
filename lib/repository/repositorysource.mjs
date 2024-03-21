/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import { source, insertBlanksAtBeginning } from "/evolux.util/lib/stringutil.mjs";
import RepositoryEntry                     from "./repositoryentry.mjs";

export default class RepositorySource {

    constructor(name) {
        this.name = name;
        this.entries = {};
    }

    asSource(indent) {
        let str = `'${this.name}': {`;
        let sep = '';
        Object.values(this.entries).forEach((entry) => {
            str += sep + "\n" + insertBlanksAtBeginning(entry.asSource(indent), 4, true);
            sep = ','
        })
        str += "\n}";
        return insertBlanksAtBeginning(str, 4, false);
    }

    static fromObj(name, struct) {
        const repoSource = new RepositorySource(name);
        const entrynames = Object.keys(struct);
        entrynames.forEach((entryname) => repoSource.setEntry(entryname, RepositoryEntry.fromObj(entryname, struct[entryname])))
        return repoSource;
    }

    setEntry(name, entry) {
        this.entries[name] = entry;
    }

    addAllEntries(source) {
        this.entries = { ...source.entries, ...this.entries };
    }
}
