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
        attributePresets.autocomplete = false;
        attributePresets.cls          = Directory;
    }

    chainAutoComplete(entity) {
        // todo: chain the auto complete for directories, use options to specify the class to use for the chain
        // return new Directory();  !! this is dangerous, maybe we need a specialized class
    }
}

export default class Directory extends ThoregonEntity() {

    static create({ soul, encrypt, decrypt, opt } = {}) {
        return super.create(undefined, { soul, encrypt, decrypt })
    }

    static createtmp({ soul, encrypt, decrypt, opt } = {}) {
        return super.create(undefined, { soul, encrypt, decrypt, ephemeral: false });
    }

    static with(items, Itemclass) {
        const dir = this.create();
        const entries = Object.entries(items ?? {});
        entries.forEach(([key, item]) => { if (item != undefined) dir.put(key, dir.__adjustItem__(item, Itemclass)) });
        return dir;
    }

    put(key, entry) {
        this[key] = entry;
        return this.get(key);   // get again, it may now be decorated (don't return entry)
    }

    set(key, entry) {
        return this.put(key, entry);
    }

    add(entry) {
        //@$ATTR -> add the entry with a random key
        const key = entry.handle ?? universe.random(9);
        this[key] = entry;
        return this.get(key);   // get again, it may now be decorated (don't return entry)
        // return key;
    }

    get(key) {
        const entry = this[key];
        return entry;
    }

    has(key) {
        return this.keySet.has(key);
    }

    includes(item) {
        return !!this.find((entry) => entry == item);
    }

    remove(key) {
        const entry = this[key];
        delete this[key];
        // await doAsync();
        return entry;
    }

    delete(key) {
        return this.remove(key);
    }

    __adjustItem__(item, Itemclass) {
        if (Itemclass == undefined) return item;
        if (item.constructor !== Object) return item;   // if it's class is not Object use it as is
        const entity = Itemclass.create(item);
        return entity;
    }

    /**
     * get an element with key from this directory
     * is named getAny, because there is no guarantied sequence
     * if no items, an empty object {} will be returned
     * @returns {Promise<{}|{key: *, item: *}>}  tupel with key and item
     */
    getAny() {
        const $keys = this.$keys;
        if ($keys.is_empty) return {};
        const key = $keys[0];
        return { key, item: this.get(key) };
    }

    get isKeyed() {
        return true;
    }

    clear() {
        this.forEachKey((key) => delete this[key]);
        // await doAsync();
    }

    clearDeep() {
        this.forEachKey((key) => {
            const item = this[key];
            delete this[key];
            item?.delete();
        });
        // await doAsync();
    }

    //
    // sync iterator functions
    //

    get iterator() {
        return this[Symbol.iterator];
    }

    forEach(fn) {
        for (const [key, value] of this) {
            fn(value);
        }
    }

    forEachKey(fn) {
        for (const [key, value] of this) {
            fn(key);
        }
    }

    forEachEntry(fn) {
        for (const [key, value] of this) {
            fn([key, value]);
        }
    }

    filter(fn) {
        const items = [];
        for (const [key, value] of this) {
            const found = fn(value);
            if (found) items.push(value);
        }
        return items;
    }

    filterWithKeys(fn) {
        const items = {};
        for (const [key, value] of this) {
            const found = fn(value);
            if (found) items[key] = value;
        }
        return items;
    }

    find(fn) {
        for (const [key, value] of this) {
            const found = fn(value);
            if (found) return value;
        }
    }

    findKey(fn) {
        for (const [key, value] of this) {
            const found = fn(key);
            if (found) return value;
        }
    }

    map(fn) {
        const col = [];
        for (const [key, value] of this) {
            const item = fn(value);
            col.push(item);
        }
        return col;
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
            await fn([key, value]);
        }
    }

    async asyncFind(fn) {
        for await (const [key, value] of this) {
            const found = await fn(value);
            if (found) return value;
        }
    }

    async asyncFindKey(fn) {
        for await (const [key, value] of this) {
            const item = await fn(key);
            if (item) return value;
        }
    }

    async asyncMap(fn) {
        const col = [];
        for await (const [key, value] of this) {
            const item = await fn(value);
            col.push(item);
        }
        return col;
    }

    /*
     *  iterator interface
     */
    *[Symbol.iterator]() {
        const keys = this.$keys;
        for (const key of keys) {
            const value = this.get(key);
            yield [key, value];
        }
    }

    /*
     * async iterator interface
     */
    async *[Symbol.asyncIterator]() {
        const keys = this.$keys;
        for await (const key of keys) {
            const value = await this.get(key);
            yield [key, value];
        }
    }
}

Directory.checkIn(import.meta, DirectoryMeta);

if (globalThis.universe) universe.$Directory = Directory;
