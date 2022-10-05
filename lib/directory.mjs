/**
 * use to store key/value maps
 *
 * todo [OPEN]
 *  - indexes based on directory/object to properties
 *  - static with(): pass Objects and Array as initialization, allow options (for create)
 *  - add additional endless asyncIterator which listens to changes
 *  - directly after await ThoregonObject.from(...) the 'asyncIterator' has no items!
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
        // todo: chain the auto complete for directories, use options to specify the class to use for the chain
        // return new Directory();  !! this is dangerous, maybe we need a specialized class
    }
};

export default class Directory extends ThoregonEntity() {

    static async create({ store, inmem = false } = {}) {
        return await super.create(undefined, { store, inmem })
    }

    async put(key, entry) {
        this[key] = entry;
        await doAsync();
        return await this.get(key);
    }

    async get(key) {
        const entry = await this[key];
        return entry;
    }

    async reserveItem(prop, Cls) {
        return await this.reserveProperty(prop, Cls);
    }

    get isKeyed() {
        return true;
    }

    //
    // async iterator functions
    // todo: add 'lazy' functions working like an iterator on request
    //

    get asyncIterator() {
        return this[Symbol.asyncIterator];
    }

    async asyncForEach(fn) {
        for await (const [key, value] of this) {
            await fn(value);
        }
    }

    async asyncForEachKey(fn) {
        for await (const [key, value] of this) {
            await fn(key);
        }
    }

    async asyncForEachEntry(fn) {
        for await (const [key, value] of this) {
            await fn(key, value);
        }
    }

    async asyncFind(fn) {
        for await (const [key, value] of this) {
            if (await fn(value)) return await fn(key, value);
        }
    }

    async asyncFindKey(fn) {
        for await (const [key, value] of this) {
            if (await fn(key)) return await fn(key, value);
        }
    }

    async asyncMap(fn) {
        const col = [];
        for await (const [key, value] of this) {
             col.push(await fn(key, value));
        }
        return col;
    }

    /*
     * async iterator interface
     */
    [Symbol.asyncIterator]() {
        return {
            names     : undefined,
            collection: this,
            async next() {
                if (!this.names) {
                    await doAsync();
                    this.names = [...this.collection.propertyNames];
                }
                if (this.names.is_empty) return { done: true };
                const key = this.names.shift();
                const value = await this.collection[key];
                if (value == undefined) return this.next();     // don't replace with '===', filter also 'null'
                // todo: check also for deleted items!
                return { done: false, value: [key, value] };
            },
            return() {
                // This will be reached if the consumer called 'break' or 'return' early in the loop.
                return { done: true };
            }
        }
    }

}

Directory.checkIn(import.meta, DirectoryMeta);

if (globalThis.universe) universe.$Directory = Directory;
