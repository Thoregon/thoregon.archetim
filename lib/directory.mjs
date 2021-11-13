/**
 * use to store key/value maps
 *
 * todo [OPEN]
 *  - indexes based on directory/object to properties
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */
import ThoregonEntity                         from "./thoregonentity.mjs";
import MetaClass, { ATTRIBUTE_MODE } from "./metaclass/metaclass.mjs";

export class DirectoryMeta extends MetaClass {

    initiateInstance() {
        this.name               = "Directory";
        this.attributeMode = ATTRIBUTE_MODE.VARENCRYPT;
    }

};

export default class Directory extends ThoregonEntity() {

    static async create({ store, inmem = false } = {}) {
        return await super.create(undefined, { store, inmem })
    }

    async put(key, entry) {
        this[key] = entry;
    }

    async get(key) {
        const entry = await this[key];
        return entry;
    }

}

Directory.checkIn(import.meta, DirectoryMeta);
