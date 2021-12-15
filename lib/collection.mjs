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
import { ErrCantReserveProperty }         from "./errors.mjs";

export class CollectionMeta extends MetaClass {

    initiateInstance() {
        this.name                     = "Collection";
        this.attributeMode            = ATTRIBUTE_MODE.VARIABLE;
        const attributePresets        = this.attributePresets;
        attributePresets.autocomplete = true;
        attributePresets.cls          = Collection;
    }

}

export default class Collection extends ThoregonEntity() {

    static async create({ store, inmem = false } = {}) {
        return await super.create(undefined, { store, inmem })
    }

    // todo [OPEN]: allow a collection of entiries to be added
    async add(entry) {
        //@$ATTR -> add the entry with a random key
        const key = universe.random(9);
        this[key] = entry;
        await doAsync();
        return key;
    }

    get(key) {
        return this[key];
    }

    drop(key) {
        delete this[key];
    }

    async reserveItem(prop, Cls) {
        throw ErrCantReserveProperty(prop);
    }

}

Collection.checkIn(import.meta, CollectionMeta);

if (globalThis.universe) universe.$Collection = ThoregonObject;
