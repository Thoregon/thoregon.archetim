/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import { source, insertBlanksAtBeginning } from "/evolux.util/lib/stringutil.mjs";
import RepositoryEntry                     from "./repositoryentry.mjs";

export default class RepositoryEntryVersion {

    constructor(version, { modules, images, notes, tags, sources/*, digest*/ }) {
        Object.assign(this, { version, modules: modules ?? [], images: images ?? {}, notes: notes ?? [], tags: tags ?? [], sources: sources ?? []/*, digest*/ });
    }

    asSource(indent) {
        const str = source(this, { indent, excludes: ['version'] });
        return str; // insertBlanksAtBeginning(str, 4, false);
    }

    static fromObj(version, struct) {
        const { modules, images, notes, tags, sources, digest } = struct;
        const repoentryversion = new RepositoryEntryVersion(version, { modules, images, notes, tags, sources/*, digest*/ });
        return repoentryversion;
    }

}
