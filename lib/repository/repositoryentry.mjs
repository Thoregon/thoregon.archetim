/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import { source, insertBlanksAtBeginning } from "/evolux.util/lib/stringutil.mjs";
import RepositoryEntryVersion              from "./repositoryentryversion.mjs";
import RepositoryEntryVersions             from "./repositoryentryversions.mjs";
import Publisher                           from "./publisher.mjs";

export default class RepositoryEntry {

    constructor(name, { publisher, licence, description, latest, images, notes, issues, versions } = {}) {
        Object.assign(this, { name, publisher: publisher ?? {}, licence: licence ?? '*', description: description ?? '', latest: latest ?? '1.0.0', images: images ?? {}, notes: notes ?? [], issues: issues ?? [], versions: versions ?? new RepositoryEntryVersions() });
    }

    asSource(indent) {
        const str = `'${this.name}': ${source(this, { indent, excludes: ['name'] })}`;
        return str; // insertBlanksAtBeginning(str, 4, false);
    }


    static fromObj(name, struct) {
        const repoEntry = new RepositoryEntry(name);
        const publisher = struct.publisher ? Publisher.fromObj(struct.publisher) : new Publisher();
        repoEntry.publisher = publisher;
        const versions = struct.versions;
        if (versions) Object.entries(versions).forEach(([version, entry]) => repoEntry.setVersion(version, RepositoryEntryVersion.fromObj(version, entry)));
        return repoEntry;
    }

    setVersion(version, obj) {
        this.versions.setVersionEntry(version, obj);
    }
}
