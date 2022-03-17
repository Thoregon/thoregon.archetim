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
import { doAsync }                        from "/evolux.universe";

import ThoregonEntity, { ThoregonObject } from "./thoregonentity.mjs";
import MetaClass, { ATTRIBUTE_MODE }      from "./metaclass/metaclass.mjs";

export class DirectoryMeta extends MetaClass {

    initiateInstance() {
        this.name                     = "Directory";
        this.attributeMode            = ATTRIBUTE_MODE.VARENCRYPT;
        const attributePresets        = this.attributePresets;
        attributePresets.autocomplete = true;
        attributePresets.cls          = Directory;
    }

    async chainAutoComplete(entity) {
        // todo: chain the auto complete for collections & directories, use options to specify the class to use for the chain
    }
};

export default class Directory extends ThoregonEntity() {

    static async create({ store, inmem = false } = {}) {
        return await super.create(undefined, { store, inmem })
    }

    async put(key, entry) {
        this[key] = entry;
        await doAsync();
    }

    async get(key) {
        const entry = await this[key];
        return entry;
    }

    async reserveItem(prop, Cls) {
        return await this.reserveProperty(prop, Cls);
    }

    get length() {
        return [... this.propertyNames].length;
    }

    get asyncIterator() {
        return this[Symbol.asyncIterator];
    }

    /*
     * async iterator interface
     * // todo [REFACTOR]: add additional endless asyncIterator which listens to changes
     */
    [Symbol.asyncIterator]() {
        return {
            names     : [...this.propertyNames],
            collection: this,
            async next() {
                if (this.names.is_empty) return { done: true };
                const key = this.names.shift();
                const value = await this.collection[key];
                if (value == undefined) return this.next();     // don't replace with '===', filter also 'null'
                // todo: check also for deleted items!
                return { done: false, value: [key, value] };
            }
        }
    }

}

Directory.checkIn(import.meta, DirectoryMeta);

if (globalThis.universe) universe.$Directory = Directory;
