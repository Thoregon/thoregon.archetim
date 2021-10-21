/**
 * decorate any object used in universe
 *
 * tasks of the decorator
 * - instantiate and hold the entities object
 * - memorize where the entity is peristent
 * - keep metafdata of the entity
 * - emit entity events on behalf
 *
 * permissions:
 * -
 * - permit (handle)
 *
 * metaClass:
 * - immediate update
 * - deferred update within a transaction
 * - new instances initialized with property defaults
 * - non persistent properties
 *   - transient: can have a value but is not stored
 *   - computed: has a computed value and should not be stored
 *
 * @author: Martin Neitz, Bernhard Lukassen
 */

import AccessObserver from "/evolux.universe/lib/accessobserver.mjs";
import ThoregonEntity from "./thoregonentity.mjs";

import { isObject, isDate, isNil }                                        from "/evolux.util/lib/objutils.mjs";
import {
    isSerialized,
    serialize,
    simpleSerialize,
    canReference,
    deserialize,
    isIterable,
    isPromise
} from "./serialize.mjs";

const T     = universe.T;
const PXAES = 'TS';      // thoregon symetric AES encrypted

const PERSISTER_VERSION = '21_1';

export default class ThoregonDecorator extends AccessObserver {

    // todo [REFACTOR]:
    //  - introduce a FinalizationRegistry on the proxy to invalidate this handler
    //  - don't  wrap target with WeakRef, because no other referrence may exist

    constructor(target, parent, { metaClass, encrypt, decrypt, inmem }) {
        super(target, parent);
        this.meta     = { metaClass };
        this.encrypt$ = encrypt;
        this.decrypt$ = decrypt;
        this.inmem    = inmem;
    }

    static observe(target, { metaClass, parent, encrypt, decrypt, inmem = false } = {}) {
        return super.observe(target, parent, { metaClass, encrypt, decrypt, inmem });
    }

    get $thoregon() {
        return this;
    }

    hasMetaClass() {
        return !!this.metaClass$;
    }

    get metaClass$() {
        return this.meta?.metaClass;
    }

    doGet(target, prop, receiver) {
        const res = super.doGet(target, prop, receiver);
        if (res == undefined) {
            // get default if provided
        }
        return res;
    }

    // doSet()

    /*
     * thoregon
     */

    // lazy init
    // provide defaults at 'get' when they are requested
    // don't fill objects, they may change

/*
    initDefaults$$(properties) {
        Object.entries(this.metaClass$.attributes).forEach(([attribute, def]) =>{
                if ( properties[attribute] ) {
                    this[attribute] = properties[attribute];
                } else if ( def.hasOwnProperty("default") ) {
                    this[attribute] = def.default;
                } else {
                    this[attribute] = undefined;
                }
            }
        );
    }
*/

    get __id__() {
        //  return 'soul' of the item
    }


    async __store__() {
        if (!this.handle$) {
            // create a random root
            let root = universe.random();
            this.handle$ = { where: root, store: universe.archetim.persitenceRoot[root] };
        }
        // distinguish between collections, objects and other special builtin objects like Maps, Sets, ...
        // streams are stored with their origin and the current position if specified. they are therefore 'simple serializable' objects like Date
        if (isIterable(this.target)) {
            await this.__storeIterable__();
        } else {
            await this.__storeObject__();
        }

    }

    /*
        format of an entry (JSON stringified)
        e: t͛{ v, p, s, c }
            v ... version
            p ... pubkey for verify -> check with known keys
            s ... signature
            c ... encrypted entry, contains: metadata

           cipertext: encrypted iterable
           { m: { v, o, m } }
                 m ... metadata
                    v ... version
                    o ... origin, <kind>:<reference_or_name>
                    s ... size, optional!
                 e ... entity, serialized properties of the collection (non items)s

        i: ... items with generated keys (from gun db)
     */
    async __storeIterable__() {
        // position in the collection is defined by its 'state' in gun, this is the natural order in gun
    }

    /*
        format of an entry (JSON stringified)
        e: t͛{ v, p, s, c }
            v ... version
            p ... pubkey for verify -> check with known keys
            s ... signature
            c ... encrypted entry, contains: metadata, propertiesmapping for references, serialized properties with primitives + dates

           cipertext: encrypted with the permissions (user or role) sym encryption key
           { m: { v, o, m }, e }
                 m ... metadata
                    v ... version
                    o ... origin, <kind>:<reference_or_name>
                    m ... property map of properties with referenced entities
                 e ... entity, serialized properties

        p: ... properties with random keys
     */
    async __storeObject__() {
        // dissociate 'primitive' values from references to objects
        // todo:
        //  - remove transient properties
        //  - use property settings from meta class
        //  - resolve Promises
        let { props, refs, nils } = await this.__dissociate__();      // use nils only for already persistent objects

        // create 'untrackable' properties for references
        const propertiesmap = {};
        Object.keys(refs).forEach(name => propertiesmap[name] = universe.random(9));

        const m = {};       // get either class or metaclass
        const entry = {
            e: { ...props },                // this is the entry with just the 'primitive' values
            m: { v: PERSISTER_VERSION, o: 'BO' , m: propertiesmap }
        }
        const sentry = JSON.stringify(entry);
        const eentry = T + JSON.stringify(this.encrypt$(sentry));

        this.handle$.store[T] = eentry;
        console.log(eentry);

        // now store all properties with references
        // each references object will be wrapped with a thoregondecorator, check it the object is already deocrated
        // the decorator will use the 'root' from this and the random propertyname as its root
        // some references treated different
        await Object.entries(props).aForEach(async ([name, obj]) => {
            await this.__storeReference(name, obj, propertiesmap);
        } )
    }

    async __storeReference(name, obj, propertiesmap) {
        // check if it is already thoregon entry
        let ref;
        // create a thoregon entry and reference it
        if (!obj.$thoregon) {
            // not a persistent object, decorate and store it
            if (!obj.$thoregonEntity) {
                // not even a thoregon entity, persist it anyways
            } else {

            }
        } else {
            ref = obj;
        }

        // now create a reference to the object
        let key = propertiesmap[name];
        this.handle$.store[key] = ref.$root;    // todo
    }

    async __read__() {

    }

    async __dissociate__() {
        const props = {};
        const refs  = {};
        const nils  = [];

        await Object.entries(this.target).aForEach(async ([prop, value]) => {
            if (isPromise(value)) value = await value;
            if (isNil(value)) {
                // if there was a value/entry stored before it must be marked as deleted
                nils.push(prop);
            } else if (simpleSerialize(value)) {
                // just serialize it if necessary
                props[prop] = serialize(value);
            } else if (canReference(value)) {
                // collect all object references
                refs[prop] = value;
            }
        });

        return { props, refs, nils };
    }

}

const Persister$21_1  = {
    buildEntry() {

    }
}

const CURRENTPERSISTER = Persister$21_1;

//
// Polyfill
//

if (!Object.prototype.$thoregon) Object.defineProperty(Object.prototype, '$thoregon', { configurable: false, enumerable: false, writable: false, value: undefined })
