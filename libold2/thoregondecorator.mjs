/**
 * Neuland Decorator wraps persistent entities
 *
 * tasks of the decorator
 * - instantiate and hold the entities object
 * - memorize where the entity is peristent
 * - keep metafdata of the entity
 * - emit entity events on behalf
 *   - collect syncs from other peers over a defined period of time
 *   - then emit 'change'
 *
 * metaClass:
 * - immediate update
 * - deferred update within a transaction
 * - new instances initialized with property defaults
 * - non persistent properties
 *   - transient: can have a value but is not stored
 *   - computed: has a computed value and should not be stored
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import AccessObserver, { getAllMethodNames }             from "/evolux.universe/lib/accessobserver.mjs";
import MetaClass, { ATTRIBUTE_MODE, METACLASS_PROPERTY } from "/thoregon.archetim/lib/metaclass/metaclass.mjs";
import Transaction                                       from "./tx/transaction.mjs";
import murmurhash3                                       from './murmurhash.mjs';
// may use CRC32 instead -> https://github.com/SheetJS/js-crc32

import {
    isNil,
    isObject,
    isDate,
    isString,
    isSymbol,
    isPromise,
    isArray,
    isRef,
    isVal,
    isFunction
}                        from "/evolux.util/lib/objutils.mjs";
import {
    isSerializedRef,
    serialize,
    deserialize,
    serializeRef,
    deserializeRef,
    classOrigin,
    origin2Class,
    asOrigin,
    isThoregon,
}                  from "/evolux.util/lib/serialize.mjs";

// import SEA                                             from "/evolux.everblack/lib/crypto/sea.mjs";

//
// debugging & logging
//

// temp log
let logentries = [];

const debuglog = (...args) => { /*console.log("$$ TD", ...args); logentries.push({ ...args });*/ };
// const debuglog2 = (...args) => { console.log("$$ TD", ...args); logentries.push({ ...args }); };

const isDev = () => { try { return thoregon.isDev } catch (ignore) { return false } };

const DBGID = '== ThoregonDecorator';

const ME = () => globalThis.me ? me : { soul: '00000000000000' };

//
// decorate properties and methods from decorator to apply them on the entity
//

let thoregondecoratorprops = [], thoregondecoratormethods = [];


//
//  consts
//

// all syncs within this period will be collected to one
const SYNC_CONSOLIDATION_PERIOD = 80;
const SYNC_BY_GET_PERIOD        = 2000;

const MURMUR_SEED               = 7577308388235833;

const ANY_METACLASS = MetaClass.any();

//
// registry
//
if (!globalThis.THOREGON_KNOWN_ENTITIES) globalThis.THOREGON_KNOWN_ENTITIES = new Map();
const KNOWN_ENTITIES = globalThis.THOREGON_KNOWN_ENTITIES;
//
// transactions
//

let currentTX;  // no transaction

//
// queues
//

const MATERIALIZE_INTERVAL = 50;
const materializeQ = new Set();
let   materializeT = null;

const SYNCREQ_INTERVAL = 50;
const syncrequestQ = new Set();
let   syncrequestT = null;

//
// interfaces
//

const DB   = () => universe.neuland;
const AM   = () => universe.Automerge;
const SYNC = () => universe.syncmgr;

//
// helpers
//

const ObjCls = Object.prototype.constructor;

const isPrivateProperty = (property) => isSymbol(property) ? true : !isString(property) ? false :  property.startsWith('_') || property.startsWith('$') || property.endsWith('_') || property.endsWith('$');

// const

const isTimestamp = (property) => property === 'created' || property === 'modified' || property === 'deleted';

const isMetaProperty = (property) => property === 'metaClass' || property === 'metaclass' || property === METACLASS_PROPERTY;

const NON_ENUMERABLE = new Set(['metaclass', 'metaClass']);
const nonEnumerable  = (property) => NON_ENUMERABLE.has(property);

const shouldEmit = (property) => !(isPrivateProperty(property) || isTimestamp(property));

const hasClassReference = (obj) => !!(obj?._?.origin);
const getClassReference = (obj) => obj?._?.origin;

// export const isAutomerge = (obj) => false;

/**
 * ThoregonDecorator
 *
 * Proxy handler to work smoth with neuland entities
 */
export default class ThoregonDecorator extends AccessObserver {

    constructor(target, { parent, soul, handle, Cls, metaClass, encrypt, decrypt, is, amdoc, withDeleted = false, tombstone = false, load = false, readonly = false } = {}) {
        super(target, parent);
        Cls              = target?.constructor ?? Cls ?? ObjCls;
        metaClass        = target?.[METACLASS_PROPERTY] ?? Cls.metaClass ?? metaClass ?? ANY_METACLASS;
        this.amdoc       = amdoc;
        this.meta        = { Cls, metaClass, is };
        this.withDeleted = withDeleted;
        this.tombstone   = tombstone;
        this.readonly    = readonly;
        this.fullinit    = false;
        this.encrypt$    = encrypt;
        this.decrypt$    = decrypt;
        // this.__x         = universe.random(5);
        // this.__td        = universe.inow;
        this._soul       = soul ?? universe.random();
        this._handle     = handle ?? murmurhash3(this._soul,MURMUR_SEED) ?? undefined;

        this._synced              = (soul, amdoc) => this.__synced__(soul, amdoc);
        this._propertyDeleted     = (evt) => this.__propertyDeleted__(evt);

        this.__prepareMeta__();
    }

    /**
     *
     * @param target
     * @param soul
     * @param Cls
     * @param metaClass
     * @param encrypt
     * @param decrypt
     * @param is
     * @param amdoc
     * @param withDeleted   ... deleted objects can be retrieved by its property (key)
     * @param tombstone     ... properties of the deleted entity can be retrieved, but its readonly
     * @returns {Proxy<Object>}     decorated entity
     */
    static observe(target, { props, parent, soul, handle, create, ephemeral, Cls, typeRef, metaClass, encrypt, decrypt, amdoc, withDeleted, tombstone, incommingSync = false, load = false, readonly = false } = {}) {
        if (target == undefined) return undefined;
        const proxy = super.observe(target, { props, parent, soul, handle, create, ephemeral, Cls, typeRef, metaClass, encrypt, decrypt, amdoc, withDeleted, tombstone, load, readonly });
        const decorator = proxy.$access;
        this.ephemeral = ephemeral;
        if (decorator) {
            this.__addKnownEntity__(decorator.soul, proxy);
            decorator.__addSync__(incommingSync);
        }
        return proxy;
    }

    observerClass() {
        return ThoregonDecorator;
    }

    //
    // instances
    //


    static from(soul, { Cls, typeRef, metaClass, encrypt, decrypt, withDelete, tombstone, incommingSync = false } = {}) {
        let entity = this.getKnownEntity(soul);
        if (entity) return entity;

        entity = this.__restore__(soul, { Cls, typeRef, metaClass, encrypt, decrypt, withDelete, tombstone, incommingSync });
        if (this.inTX) {
            entity.involve$();
        }
        return entity;
    }

    static recreate(soul, obj, refs, opt) {
        return universe.neuland.has(soul) ? ThoregonDecorator.from(soul) : undefined;
    }

    //
    // info & inspection
    //

    inspect$() {
        const amdoc = this.amdoc;
        const props = Object.keys(amdoc).filter(prop => prop !== '_');
        const res = { _soul: this._soul, _origin: amdoc._.origin };
        props.forEach((prop) => {
            const val = amdoc[prop];
            if (val == undefined) return;
            if (isSerializedRef(val)) {
                res[prop] = val.substring(4).replace('|repo:', ' :: ');
            } else {
                res[prop] = amdoc[prop];
            }
        });
        return res;
    }


    transportPackage({ filter, entities, name } = {}) {
        entities = entities ?? {}; // new Map();
        const soul     = this.soul;
        const bin      = AM().save(this.amdoc);

        // entities.set(soul, { name: name ?? '*', origin: this.amdoc._.origin, bin });
        entities[soul] = bin;

        const that = this.proxy$;
        this.$keys.forEach((key) => {
            const val = that[key];
            if (filter && !filter(key,val)) return;
            const subsoul = val?.soul;
            if (!subsoul || !!entities[subsoul]) return;
            val.transportPackage?.({ filter, entities, name: key });
        })

        return entities;
    }

    asPackage({ filter, entities, name } = {}) {
        entities = entities ?? {}; // new Map();
        const soul     = this.soul;
        const bin      = AM().save(this.amdoc);

        // entities.set(soul, { name: name ?? '*', origin: this.amdoc._.origin, bin });
        entities[soul] = { name: name ?? '*', origin: this.amdoc._.origin, bin };

        const that = this.proxy$;
        this.$keys.forEach((key) => {
            const val = that[key];
            if (filter && !filter(key,val)) return;
            const subsoul = val?.soul;
            if (!subsoul || !!entities[subsoul]) return;
            val.transportPackage?.({ filter, entities, name: key });
        })

        return entities;
    }


    /**
     * get an entity by a soul
     * if it doesn't exist locally, wait until it is synced
     *
     * !! DON'T USE
     *
     * @param soul
     * @param Cls
     * @param metaClass
     * @param encrypt
     * @param decrypt
     * @returns {Promise<ThoregonEntity>}
     */
/*
    static /!*async*!/ available(soul, { Cls, metaClass, encrypt, decrypt, withDelete, tombstone } = {}) {
        return new Promise((resolve, reject) => {
            let entity = this.from(soul, { Cls, metaClass, encrypt, decrypt, withDelete, tombstone });
            // entity.__requestSync__();    this was already requested from 'observe'
            if (entity.materialized) return resolve(entity);
            // todo: add timeout
            entity.addEventListener('synced', (evt) => resolve(entity) );
        })
    }
*/

    /**
     * delete the entity
     *
     * todo [OPEN]
     *  - add to SSI 'trashcan'
     * just marks as deleted,
     */
    delete() {
        let amdoc = this.amdoc;
        if (this.__hasHeads__(amdoc)) amdoc = AM().clone(amdoc);
        this.amdoc = AM().change(amdoc, (doc) => doc._.deleted = universe.now);
        this.__materialize__();
        this.emit('delete', { obj: this.proxy$, type: 'delete' }, { once: true });
        this.__requestSync__();
    }

    get deleted() {
        return !!(this.amdoc?._?.deleted);
    }

    wasDeleted(prop) {
        const ref = this.amdoc[prop];   // the property in the automerge document was set to 'null' on delete
        return ref === null;
    }

    __canDelete__(target, prop) {
        return (prop in target) || (prop in this.amdoc && this.amdoc[prop] !== null);
    }

    //
    // known entities
    //

    static isKnownEntity(soul) {
        return KNOWN_ENTITIES.has(soul);
    }

    static getKnownEntity(soul) {
        const entity = KNOWN_ENTITIES.get(soul);
        return entity;
    }

    static __addKnownEntity__(soul, entity) {
        KNOWN_ENTITIES.set(soul, entity);
    }

    static knownEntities() {
        return KNOWN_ENTITIES;
    }

    //
    // decorator property and method decoration (apply decorator fn on the entity)
    //

    isDecoratedProperty(name) {
        // override by subclasses when needed
        return thoregondecoratorprops.includes(name) || super.isDecoratedProperty(name);
    }

    isDecoratedMethod(name) {
        // override by subclasses when needed
        return thoregondecoratormethods.includes(name) || super.isDecoratedProperty(name);
    }

    //
    //  metadata
    //

    __prepareMeta__() {}

    get $thoregon() {
        return this;
    }

    get metaClass$() {
        return this.target?.[METACLASS_PROPERTY] ?? this.meta?.metaClass ?? ANY_METACLASS;
    }

    get soul() {
        return this._soul;
    }

    get handle() {
        return this._handle;  // murmurhash3(this._soul, MURMUR_SEED);
    }

    get materialized() {
        return DB().has(this._soul);
    }

    materialize() {
        return this.__materialize__();
    }

    forceMaterialize() {
        return this.__materializeFromQ__();
    }

    static materialized(soul) {
        return DB().has(soul);
    }

    //
    // Automerge BUG ugly workaround ->
    //

    $amdocsave() {
        const Automerge = AM();
        try {   // @@FIREFOX
            const amdoc = this.amdoc;
            const bin   = Automerge.save(amdoc);
            const ream  = Automerge.load(bin);
            return amdoc;
        } catch (e) {
            // recreate the AM doc
            const amdoc = Automerge.init();
            this.amdoc  = Automerge.change(amdoc, (doc) => this.__syncEntity2AM__(this.target, doc));
            return this.$amdocsave();
        }
    }

    $ambinsafe() {
        const Automerge = AM();
        try {   // @@FIREFOX
            const amdoc = this.amdoc;
            const bin   = Automerge.save(amdoc);
            const ream  = Automerge.load(bin);
            return bin;
        } catch (e) {
            if (this.soul === ME().soul) {
                //debugger;
            }
            // recreate the AM doc
            const amdoc = Automerge.init();
            this.amdoc  = Automerge.change(amdoc, (doc) => this.__syncEntity2AM__(this.target, doc));
            return this.$ambinsafe();
        }
    }

    //
    // proxy handler
    //


    has(target, key) {
        return this.keySet.has(key); // Reflect.has(this.target, key);
    }

    ownKeys(target) {
        let keys = new Set([...Reflect.ownKeys(this.target), ...Reflect.ownKeys(this.amdoc ?? {}), ...this.metaClass$.getAttributeNames()]).values();
        keys = [...keys].filter((prop) => this.isEnumerable(prop) && (!this.isNil(prop) || this.metaClass$.getAttribute(prop)?.hasDefaultValue));
        return keys;
    }

    __buildPropertyDescriptor__(prop) {
        let descriptor = this._propertyDescriptors[prop];
        if (!descriptor) descriptor = this._propertyDescriptors[prop] = {
            enumerable: this.isEnumerable(prop),
            configurable: true,
            writable: true,
            value: Reflect.get(this.target, prop) ?? this.metaClass$.getAttribute(prop)?.defaultValue
        }
        return descriptor;
    }

    isEnumerable(name) {
        if (isPrivateProperty(name) || nonEnumerable(name)) return false;     // no symbols are emumerable
        if (!isArray(this.target) && name === 'length') return false;
        let propertySpec = this.metaClass$.getAttribute(name) ?? { enumerable : !isPrivateProperty(name) }; // if no property spec skip it in enumerations
        return !isTimestamp(name) || propertySpec.enumerable;
    } // add others when implemented

    isNil(prop) {
        const value = Reflect.get(this.target, prop, this.proxy$) ?? Reflect.get(this.amdoc ?? {}, prop);
        return isNil(value);
    }

    get $keys() {
        return this.ownKeys(this.target);
    }

    __keys__() {
        const keys = new Set([...Reflect.ownKeys(this.target), ...Reflect.ownKeys(this.amdoc), ...this.metaClass$.getAttributeNames()]).values();
        return [...keys].filter((prop) => !isPrivateProperty(prop));
    }

    get keySet() {
        return new Set(this.ownKeys(this.target));
    }

    classOrigin() {
        return this.amdoc._.origin ?? classOrigin(this.target);
    }

    //
    // overridden implementations
    //

    pop(...args) {
        const target = this.target;
        if (!isArray(target)) return;    // todo: should throw
        const res = target.pop(...args);
        const amdoc = this.amdoc;
        this.amdoc = AM().change(amdoc, (doc) => this.__syncEntity2AM__(this.target, doc, { clean: true }));
        if (this.materialized) {
            // this.dolog(">> pop::materialize");
            this.__materialize__();
            // this.dolog(">> pop::request sync");
            this.__requestSync__();
        }
        return res;
    }

    push(...args) {
        const target = this.target;
        if (!isArray(target)) return;    // todo: should throw
        const res = target.push(...args);
        const amdoc = this.amdoc;
        this.amdoc = AM().change(amdoc, (doc) => this.__syncEntity2AM__(this.target, doc, { clean: true }));
        if (this.materialized) {
            this.__materialize__();
            this.__requestSync__();
        }
        return res;
    }

    reverse(...args) {
        const target = this.target;
        if (!isArray(target)) return;    // todo: should throw
        const res = target.reverse(...args);
        const amdoc = this.amdoc;
        this.amdoc = AM().change(amdoc, (doc) => this.__syncEntity2AM__(this.target, doc, { clean: true }));
        if (this.materialized) {
            this.__materialize__();
            this.__requestSync__();
        }
        return res;
    }

    shift(...args) {
        const target = this.target;
        if (!isArray(target)) return;    // todo: should throw
        const res = target.shift(...args);
        const amdoc = this.amdoc;
        this.amdoc = AM().change(amdoc, (doc) => this.__syncEntity2AM__(this.target, doc, { clean: true }));
        if (this.materialized) {
            this.__materialize__();
            this.__requestSync__();
        }
        return res;
    }

    sort(...args) {
        const target = this.target;
        if (!isArray(target)) return;    // todo: should throw
        const res = target.sort(...args);
        const amdoc = this.amdoc;
        this.amdoc = AM().change(amdoc, (doc) => this.__syncEntity2AM__(this.target, doc, { clean: true }));
        if (this.materialized) {
            this.__materialize__();
            this.__requestSync__();
        }
        return res;
    }

    unshift(...args) {
        const target = this.target;
        if (!isArray(target)) return;    // todo: should throw
        const res = target.unshift(...args);
        const amdoc = this.amdoc;
        this.amdoc = AM().change(amdoc, (doc) => this.__syncEntity2AM__(this.target, doc, { clean: true }));
        if (this.materialized) {
            this.__materialize__();
            this.__requestSync__();
        }
        return res;
    }

    splice(start, deleteCount, ...items) {
        const target = this.target;
        if (!isArray(target)) return;    // todo: should throw
        const dels = target.splice(start, deleteCount, ...items);
        // now update automerge doc and sync
/*
        if (this.hasDeepListeners()) {
            // check deep listeners for added items
            items.forEach((value) => value?.__checkDeepListeners__?.(receiver, prop));   // todo [OPEN]: add deep listener chain only when needed)
        }
*/
        const amdoc = this.amdoc;
        this.amdoc = AM().change(amdoc, (doc) => this.__syncEntity2AM__(this.target, doc, { clean: true }));
        if (this.materialized) {
            this.__materialize__();
            this.__requestSync__();
        }
        return dels;
    }

    get is_empty() {
        return this.$keys.length === 0;
    }


    //
    // transactions
    //

    static get currentTX() {
        return currentTX;
    }

    static withTX(tx) {
        currentTX = tx;
    }

    static startTX() {
        const tx = Transaction.activate();
        return tx;
    }

    static terminateTX() {
        const tx = currentTX;
        // todo [REFACTOR]: check if tx should be set to 'terminated'
        currentTX = undefined;
        return tx;
    }

    static startSyncTX() {
        const tx = Transaction.activate({ sync: true });
        return tx;
    }

    static get inTX() {
        return currentTX != undefined;
    }

    get inTX() {
        return this.constructor.inTX;
    }

    /**
     *
     */
    involve$() {
        currentTX?.involve(this.proxy$);
        // todo [OPEN]:
        //  - keep a copy of the binary (Automerge) for rollback
    }

    __isInvolvedInTX__() {
        currentTX?.isInvolved(this.proxy$);
    }

    /**
     * invoked just b4 'commit'.
     * if it can not be commited, it must throw
     *
     * todo [OPEN]
     *  - involve validators
     */
    prepare$() {
        // todo
    }

    commit$() {
        // now the object is ready to sync
        // - materialize
        this.__materialize__();
        // - request sync
        if (currentTX.isSync) {
            this.__regSync__();
        } else {
            this.__requestSync__()
        }
    }

    rollback$() {
        // apply (primitve) old data
    }

    //
    // INIT
    //

    decorate(target, parent, prop, opt = {}) {
        const propertySpec = this.__attributeSpec__(prop, target);
        const metaClass = propertySpec?.cls?.metaClass ?? propertySpec?.metaClass ?? propertySpec.targetMetaClass;
        return super.decorate(target, parent, prop, { ...opt, metaClass });
        // return this.constructor.observe(target, { parent, ...opt });
    }


    __initLazyProps__() {
        // const current = new Set(Reflect.ownKeys(this.target));
        // const missing = this.$keys.filter((prop) => !current.has(prop));
        this.$keys.forEach((prop) => Reflect.get(this.proxy$, prop));
    }

    __mergeValues__(other) {
        if (!other) return;
        const current = this.target;
        const receiver = this.proxy$;

        let modified = false;

        if (this.soul === ME().soul) {
            //debugger;
        }

        // first we need to init also lazy initializes properties, otherwise we can't merge them
        this.__initLazyProps__();
        // walk over the properties
        const entries      = Object.entries(current);
        const propssettled = new Set();
        entries.forEach(([prop, currvalue]) => {
            propssettled.add(prop);
            if (isPrivateProperty(prop) || isTimestamp(prop)) return;
            let othervalue = Reflect.get(other.$access?.proxy$ ?? other, prop);
            if (othervalue == undefined) return;
            if (Object.is(currvalue, othervalue)) return;
            if (isRef(othervalue) && isRef(currvalue)) {
                // both are objects, merge it
                let entitymodified = this.__mergeEntities__(othervalue, currvalue, prop, current, receiver);
                modified = modified || entitymodified;
            } else {
                // replace with (primitive) othervalue
                othervalue = this.__observed__(othervalue, prop);
                if (currvalue !== othervalue) {
                    // attach deep listener if it exists
                    this.dolog("__mergeValues__ set value", this.soul, prop, othervalue);
                    this.__set__(current, prop, othervalue, receiver);
                    modified = true;
                }
            }
        });
        // need to process all remaining properties from other
        const otherentries = Object.entries((other)).filter(([prop, value]) => !propssettled.has(prop));
        otherentries.forEach(([prop, value]) => {
            if (isPrivateProperty(prop) || isTimestamp(prop) || value == undefined) return;
            value = this.__observed__(value, prop);
            this.dolog("__mergeValues__ set value", this.soul, prop, value);
            this.__set__(current, prop, value);
            modified = true;
        })
/*
        if (modified) {
            this.__maintainTimestamps__();
            if (this.materialized) {
                this.__materialize__();
                this.__requestSync__();
            }
        }
*/
        return modified;
    }

    __mergeEntities__(othervalue, value, prop, parent, receiver) {
        if (Object.is(othervalue, value)) return false;
        if (isPrivateProperty(prop) || isTimestamp(prop)) return false;
        if (this.soul === ME().soul) {
            //debugger;
        }
        // need to merge both
        // will be invoked only with 2 objects (othervalue, value)
        // todo [OPEN]: add sanity checks (if both values are an Object
        this.dolog("__mergeEntities__", this.soul, parent?.soul, prop, value);
        if (othervalue.constructor === value.constructor) {
            if (!this.isObserved(value)) {
                othervalue = this.__observed__(othervalue, prop, parent);
                // @$@ LISTENERS @$@: move (deep) listeners to new ref
                // this.doSet(this.target, prop, othervalue, receiver);
                this.__set__(parent, prop, othervalue, receiver);
                othervalue.__mergeValues__?.(value);
                return true;
            } else {
                // same class, just merge, don't replace in property
                const modified = value.__mergeValues__(othervalue);     // todo [REFACTOR]: store and sync only the sub object (value). no need to store the owner object
                return modified; // false;
            }
        } else if (othervalue.constructor === Object || othervalue.constructor === Array) {
            // value is instance on another class than Object, merge othervalue into value, don't replace in property
            const modified = value.__mergeValues__(othervalue);
            return false;
            // check deep listeners
        } else if (value.constructor === Object || value.constructor === Array) {
            // othervalue is instance on another class than Object, merge value into othervalue and replace in property
            othervalue = this.__observed__(othervalue, prop);
            // @$@ LISTENERS @$@: move (deep) listeners to new ref
            // this.doSet(this.target, prop, othervalue, receiver);
            this.__set__(parent, prop, othervalue, receiver);
            othervalue.__mergeValues__(value);
            return true;
        } else {
            // now we have two objects with different classes
            // replace the property with othervalue, don't merge
            othervalue = this.__observed__(othervalue, prop);
            // @$@ LISTENERS @$@: move (deep) listeners to new ref
            this.__set__(parent, prop, othervalue, receiver);
            return true;
        }
        return false;
    }

    __mergeProperty__(target, prop, value, othervalue, receiver) {
        if (isPrivateProperty(prop) || isTimestamp(prop)) return false;
        if (isRef(othervalue) && isRef(value)) {
            if (this.__same__(value, othervalue)) return false;
            return this.__mergeEntities__(othervalue, value, prop, target, receiver);
        }
        this.__set0__(target, prop, othervalue, receiver);
        return true;
    }

    __same__(entity1, entity2) {
        return this.isObserved(entity1) && this.isObserved(entity2) && (entity1.soul === entity2.soul);
    }

    __observed__(value, prop, parent) {
        if (!isPrivateProperty(prop) && isRef(value) && !this.isObserved(value) && !isDate(value)) { // don't decorate already decorated entities
            const metaClass = this.metaClass$.getAttribute(prop)?.targetMetaClass;
            value = ThoregonDecorator.observe(value, { parent, metaClass, encrypt: this.encrypt$, decrypt: this.decrypt$ });
        } else if (this.isObserved(value) &&  value.observerClass() !== ThoregonDecorator) {
            const metaClass = this.metaClass$.getAttribute(prop)?.targetMetaClass;
            const obj = value.$access.target;
            value = ThoregonDecorator.observe(obj, { parent, metaClass, encrypt: this.encrypt$, decrypt: this.decrypt$ });
        }
        return value;
    }

    __adjustTarget__(props) {
        if (!isRef(props)) return;
        // const target = this.target;
        // const parentMetaClass = this.metaClass$;

        // wrap all internal objects with a ThoregonDecorator
        Object.entries(props).forEach(([prop, value]) => {
            if (!isPrivateProperty(prop) && !isTimestamp(prop)) Reflect.set(this.proxy$, prop, value);
            // todo [OPEN]:
            //  - avoid endless loops, pass set of visited objects
            //  - get class and metaclass from attribute spec if missing (e.g. the entity is a plain js object)
            //  - if there is a class and the entity is a plain object, create an instance and initialize ist properties with the objects props
            //  - instantiate 'right' collection & entity classes
            //  - set also 'observed' objects
            // if (!isPrivateProperty(prop) && isRef(value) && !this.isObserved(value)) { // don't decorate already decorated entities
            //     const propertySpec = parentMetaClass.getAttribute(prop);
            //     const metaClass = propertySpec?.targetMetaClass;
            //     const Cls = propertySpec?.cls ?? propertySpec?.Cls ?? undefined;
            //     this.dolog("__adjustTarget__", this.soul, prop);
            //     value = ThoregonDecorator.observe(value, { parent, Cls, metaClass, encrypt: this.encrypt$, decrypt: this.decrypt$ });
            //     this.__set__(parent, prop, value);
            // }
        })
    }



    __adjustReferencedEntity(entity, prop) {
        if (!entity) return entity;
        const propertySpec  = this.__attributeSpec__(prop);
        if (entity.constructor !== ObjCls) return entity;
        const Cls = propertySpec.cls;
    }

    __init__(opt = {}) {
        if (this.amdoc) {
            this.__initialSync2Entity__(opt);
        } else {
            this.__initialSync2Automerge__(opt);
        }
        // loop over embedded attributes to init them
        this. __initEmbedded__(opt);
    }

    __initEmbedded__({ create, load } = {}) {
        if (!create) return;

        let embeddedNames;
        if (!load && this.fullinit) {
            embeddedNames = this.$keys;
        } else {
            const attributes    = this.metaClass$.getAttributes();
            const embeddedAttrs = Object.entries(attributes).filter(([name, attrSpec]) => !isPrivateProperty(name) && (attrSpec.embedded || attrSpec.autoinit) && !(attrSpec.emergent));
            embeddedNames = embeddedAttrs.map(([name, attrSpec]) => name);
        }
        if (!embeddedNames?.is_empty) this.dolog("__initEmbedded__", this.soul, embeddedNames);
        embeddedNames.forEach((prop) => Reflect.get(this.proxy$, prop));    // just get the property should init it
    }

    //
    // properties
    //

    __attributeSpec__(prop, value) {
        return this.metaClass$?.getAttribute?.(prop) ?? this.__defaultAttributeSpec__(prop, value);
    }

    __defaultAttributeSpec__(prop, value) {
        const opt = { embedded: true, persistent: true, merge: true, defined: false };
        // todo [REFACTOR]: depending on the value differenciate the attibute type
        // now use an embedded, persistent attribute w/o additional conversions
        let attribuetSpec = ANY_METACLASS.text(prop, opt);
        return attribuetSpec;
    }

    //
    // access
    //

    doGet(target, prop, receiver, opt = {}) {
        if (prop === 'then') return;
        this.dolog("GET", prop);
        // if the property is available return it. this is essential to invoke functions as usual!
        // !! Don't wrap with a Promise, also not with a resolved Promise - Promise.resolve(Reflect.get(target, prop))
        // if (prop === 'is_empty') {
        //     // todo [REFACTOR]: if nedded add other 'functional' properties, extract to method
        //     return Reflect.ownKeys(this.target).length === 0;
        // }
        if (this.deleted && !this.tombstone) return undefined;      // when its deleted, no properties can be retrieved except it's a tombstone
        if (prop === 'length') {
            // todo [REFACTOR]: if nedded add other 'functional' properties, extract to method
            return isArray(target) ? target.length : this.$keys.length; // Object.keys(this.target).length;
        }
        if (prop === 'soul') {
            // todo [REFACTOR]: if nedded add other 'functional' properties, extract to method
            return this._soul;
        }
        // if (prop === 'handle') {
        //     // todo [REFACTOR]: if nedded add other 'functional' properties, extract to method
        //     return this._handle;
        // }
        let value = super.doGet(target, prop, receiver);
        if (isPrivateProperty(prop) || isTimestamp(prop) || isMetaProperty(prop)) return value;
        if (value == undefined && this.amdoc != undefined) {   // don't change to '==='
            // check if it lazy initialized
            const eref = this.amdoc[prop];
            if (eref != undefined) {     // don't change to '!=='
                if (isSerializedRef(eref)) {
                    const propertySpec  = this.__attributeSpec__(prop);
                    const { soul, ref } = deserializeRef(eref);
                    let   { Cls, repo } = origin2Class(ref);
                    if (!Cls) Cls = propertySpec?.cls ?? ObjCls;
                    const metaClass = Cls.metaClass ?? propertySpec.metaclass ?? propertySpec.targetMetaClass;
                    this.dolog("doGet - from", this.soul, prop, soul);
                    value              = ThoregonDecorator.from(soul, { Cls, metaClass });
                    if (!(value?.deleted) || this.withDeleted) {    // if the reference is not deleted or this entity is explicitly define 'withDeleted'
                            this.__set__(target, prop, value, receiver);
                            if (this.materialized && !value.materialized) {
                                value.materialize();
                                this.__requestSync__();
                                value.__requestSync__();
                            }
                            if (value?.__isObserved__) value.addEventListener('delete', (evt) => this.__propertyDeleted__(prop, value, evt));
                    } else {
                        // todo [OPEN]: remove property -> this.deleteProperty(...)
                        value = undefined;
                    }
                } else {
                    if (prop in this.amdoc) {
                        value = this.__deserializeValue__(this.amdoc[prop]);
                        this.__set__(target, prop, value, receiver);
                    }
                }
            } else {
                value = this.metaClass$.autoCompleteFor(target, prop);
                if (isRef(value)) {
                    if (!this.isObserved(value)) {
                        const metaClass = this.metaClass$.getAttribute(prop).targetMetaClass;
                        value = ThoregonDecorator.observe(value, { parent: this.proxy$, metaClass, encrypt: this.encrypt$, decrypt: this.decrypt$ });
                    }
                    this.dolog("doGet - autocomplete", this.soul, prop);
                    // in this case set and sync it
                    // this.set(target, prop, value, receiver);
                    // todo: the 'set' should be invoked with the proxy because it may invoke a set method
                    //  but currently this causes a endless loop, because the 'old' value will be retrieved,
                    //  whitch ends up here again.
                    this.doSet(target, prop, value, receiver, { override: true });
                    this.afterSet(target, prop, value, receiver, { override: true });
                    // Reflect.set(target, prop, value);
                }
            }
        }
        this.__checkSync__(value);
        return value;
    }

    getDefaultValue(target, prop, opt = {}) {
        if (!opt.load) return super.getDefaultValue(target, prop, opt);
    }

    __checkSync__(value) {
        if (!this.amdoc) return;
        const soul = value?.soul;
        if (soul) {
            if (!SYNC().isResponsible(soul)) {
                this.__requestSync__();
                value.__requestSync__?.();
                return;
            }
        }
        // sanity
        if (!this._lastSync || (universe.inow - this._lastSync) > SYNC_BY_GET_PERIOD) {
            this._lastSync = universe.inow;
            this.__requestSync__();
        }
    }

    __set0__(target, prop, value, receiver) {
        this.dolog("__set0__", prop);
        const propertySpec = this.__attributeSpec__(prop, value);
        receiver = receiver ?? this.proxy$;
        if (value?.__isObserved__) value.addEventListener('delete', (evt) => this.__propertyDeleted__(prop, value, evt));
        // todo: set metaclass if missing
        if (value?.metaClass$ === ANY_METACLASS) {
            // problem: targetMetaClass for items is defined in the property spec of the entity containing the collection
        }
        Reflect.set(target, prop, value/*, receiver*/);
        // if (this.hasDeepListeners()) value?.__checkDeepListeners__?.(receiver, prop);   // todo [OPEN]: add deep listener chain only when needed
        if (propertySpec.storeIt) this.__setAMProperty__(prop, value, isArray(target));
    }

    __set__(target, prop, value, receiver) {
        this.__checkInitEmbedded__(value, prop);
        this.__set0__(target, prop, value, receiver);
    }

    __checkInitEmbedded__(value, prop) {
        if (value?.soul === this.soul) return;
        const propertySpec  = this.__attributeSpec__(prop);
        if (isRef(value)) propertySpec?.adjustMetaclass(value);
        if (!propertySpec?.doFullInit) return false;
        const decorator = value?.$access;
        if (!decorator) return false;
        decorator.fullinit = true;
        this.dolog("__checkInitEmbedded__", this.soul, prop);
        decorator.__initEmbedded__();
        return true;
    }

    __propertyDeleted__(prop, entity, evt) {
        this.deleteProperty(this.target, prop, this.proxy$);
        // if (!isPrivateProperty(prop) && !this.dontEmit(prop)) this.emit('change', { type: 'delete', obj: this.proxy$, property: prop, newValue: undefined, oldValue: entity });
    }

    decorate(target, parent, prop) {
        const propertySpec = this.metaClass$.getAttribute(prop);
        const metaClass = propertySpec?.targetMetaClass;
        const currentValue = Reflect.get(this.proxy$, prop)
        target = propertySpec?.adjustEntity(target, currentValue) ?? target;
        const value = ThoregonDecorator.observe(target, { parent: parent ?? this.proxy$, metaClass, encrypt: this.encrypt$, decrypt: this.decrypt$ });
        return value;
    }

    __deserializeValue__(value) {
        return this.target.$thoregonEntity ? deserialize(value) : value;
    }

    doSet(target, prop, value, receiver, opt = { override: false }) {
        if (isTimestamp(prop)) return false;      // don't modify timestamps
        if (this.readonly) return;

        if (isArray(target) && prop === 'length') {
            // todo [REFACTOR]: this is not correct since the change of 'length' also need to be synced.
            target.length = value;
            return;
        }

        // this._modified = true;
        if (value === undefined) value = null;  // Automerge can not handle undefined
        this.dolog(">> SET::get old value", prop);
        const oldvalue =  opt.override ? undefined : Reflect.get(receiver ?? target, prop); // Reflect.get(target, prop, receiver);
        if (Object.is(value, oldvalue)) return false;
        if (isPrivateProperty(prop) || isMetaProperty(prop)) {
            this.dolog(">> SET::set private prop", prop);
            Reflect.set(target, prop, value);
            return false;
        }
        let modified = true;
        if (this.inTX) {
            this.involve$();
        }
        this.dolog(">> SET::get attribute spec", prop);
        const propertySpec = this.__attributeSpec__(prop, value);
        if (value !== null) {
            // todo [REFACTOR]: introduce better type conversion
            if (propertySpec.isSimple && propertySpec.isDefined) {
                value = (propertySpec.isText) ? value?.toString() : value;
            } else {
                value = this.__deserializeValue__(value);
            }
            // ----
            if (propertySpec.merge && oldvalue != undefined) {
                this.dolog(">> SET::merge property", prop);
                modified = this.__mergeProperty__(target, prop, oldvalue, value, receiver);
                value = Reflect.get(target, prop);
                // if (!this.__mergeProperty__(target, prop, oldvalue, value, receiver)) {
                //     this.__set0__(target, prop, value, receiver);
                // }
            } else {
                this.dolog(">> SET::set0 value", prop);
                this.__set0__(target, prop, value, receiver);
            }
        }  else {
            this.dolog(">> SET::do delete", prop);
            if (oldvalue != undefined) {
                // delete only when there was no object?  if (!isObject(oldvalue)) ...
                modified = super.doDelete(target, prop, receiver);
            }
        }
        modified = modified && propertySpec.storeIt;
        this.dolog(">> SET::set AM property", prop);
        if (modified) /*modified =*/ this.__setAMProperty__(prop, value);
        if (modified) {
            this.dolog(">> SET::maintain timestamps", prop);
            this.__maintainTimestamps__();
            if (this.materialized) {
                this.dolog(">> SET::materialize", prop);
                this.__materialize__();
                if (value != undefined && this.materialized) value.materialize?.();
                this.dolog(">> SET::request sync", prop);
                this.__requestSync__();
            }
        }
        this.dolog(">> SET::DONE", prop);
        return modified;
    }

    afterSet(target, prop, value, receiver, opt = {}) {
        // this.__requestSync__();
    }

    doDelete(target, prop, receiver, opt = {}) {
        return this.doSet(target, prop, null, receiver);
    }

    afterDelete(target, prop, receiver, opt = {}) {
        this.afterSet(target, prop, null, receiver);
    }

    __maintainTimestamps__() {
        // will store it anyways for every entity.
        // entities with 'suppressTimestamps' just can't get the values
        const target = this.target;
        const now = universe.now;
        if (!target.created) {
            target.created = now;
            this.__setAMProperty__('created', now);
        }
        target.modified = now;
        this.__setAMProperty__('modified', now);
    }

    //
    // primitive modifications
    //

    static primitiveSet(receiver, prop, value, { syncAM = true } = {}) {
        const { decorator, target } = this.__primitive__(receiver);
        const res = super.primitiveSet(receiver, prop, value);
        if (syncAM) decorator.__setAMProperty__?.(prop, value);
        return res;
    }

    static primitiveDelete(receiver, prop, { syncAM = true } = {}) {
        const { decorator, target } = this.__primitive__(receiver);
        const res = super.primitiveDelete(receiver, prop);
        if (syncAM) decorator.__setAMProperty__?.(prop, null);
        return res;
    }

    static detach(receiver, prop) {
        const obj = this.primitiveGet(receiver, prop);
        this.__detachReferenced__(obj);
        this.primitiveDelete(receiver, prop, { syncAM: false });
    }

    static __detachReferenced__(obj, visited = new Set()) {
        if (obj == undefined || !isRef(obj)) return;
        const soul = obj.soul;
        if (!soul) return;
        KNOWN_ENTITIES.delete(soul);
        Object.entries(obj).forEach(([prop, value]) => {
            if (visited.has(value)) return;
            visited.add(value);
            this.__detachReferenced__(value, visited);
        })
    }

    //
    // sync & content
    //

    fullinit() {
        this.fullinit = true;
        this.__initEmbedded__();
    }

    demandSync() {
        let demand = this._demand;
        if (!demand) demand = this._demand = { delay: 600, tries: 0 };
        if (demand.done) return;
        if (demand.tries > 5) demand.delay = 3000;
        if (demand.tries > 10) demand.delay = 8000;
        if (demand.tries > 15) demand.delay = 60000;
        demand.tries++;
        this.dolog("demandSync", demand);
        setTimeout(() => this._demandSync(), demand.delay);
    }

    _demandSync() {
        this.__requestSync__();
        this.demandSync();
    }

    //
    // persistent entities
    //

    static __load__(soul) {
        try {
            let binentity = DB().get(soul);
            if (!binentity) return;
            const amdoc = AM().load(binentity);
            return amdoc;
        } catch (e) {
            this.logerr('__load__', soul, e);
            return AM().init();
        }
    }

    static __entityFrom__(amdoc, ECls) {
        const origin = amdoc._?.origin;
        let { Cls, repo } = origin2Class(origin);
        // if (origin === 'builtin:Object') this.dolog("__entityFrom__ plain object");
        if (!repo) this.readonly = true;
        if (Cls === ObjCls && ECls) Cls = ECls;
        const entity = new Cls();
        return entity;
    }

    static __restore__(soul, { Cls, typeRef, metaClass, encrypt, decrypt, withDelete, tombstone, incommingSync = false } = {}) {
        this.dolog("__restore__", soul);
        let amdoc = this.__load__(soul);
        if (this.isCorrupted(amdoc)) {
            this.dolog("restore: corrupted AMDOC, recreate", soul)
            amdoc = this.correctAmdoc(amdoc, Cls);
        }
        const target = (amdoc) ? this.__entityFrom__(amdoc, Cls, typeRef) : Cls ? new Cls() : {};
        const handle = amdoc?._handle;
        const proxy = this.observe(target, { soul, handle, Cls, typeRef, metaClass, encrypt, decrypt, amdoc, withDelete, tombstone, incommingSync, load:true });
        return proxy;
    }

    static isCorrupted(amdoc) {
        return amdoc && !amdoc._?.origin;
    }

    static correctAmdoc(amdoc, Cls) {
        return  AM().change(amdoc, (doc) => {
            if (!doc._) doc._ = {};
            if ((!doc._.origin || doc._.origin.startsWith('builtin:')) && Cls) {
                const origin = asOrigin(Cls);
                doc._.origin = origin;
            }
        })
    }

    __materialize__() {
        if (this.ephemeral) return;
        if (this.inTX) {
            return;
        }
        this.__enqueueMaterialize__();
    }

    __enqueueMaterialize__() {
        materializeQ.add(this);
        this.__restartMaterialize__();
    }

    __restartMaterialize__() {
        if (materializeT) clearTimeout(materializeT);
        materializeT = setTimeout(() => {
            for (const item of materializeQ) item.__materializeFromQ__();
            materializeQ.clear();
        }, MATERIALIZE_INTERVAL)
    }

    __materializeFromQ__(visited = new Set()) {
        if (this.readonly) return;
        const receiver = this.proxy$ ?? this;
        if (visited.has(receiver)) return;
        visited.add(receiver);
        this.dolog("__materialize__", this.soul);
        try {
            const soul  = this._soul;
            if (soul === ME().soul) {
                // debugger;
            }
            const bin   = this.$ambinsafe();
            // const amdoc = this.amdoc;
            // const bin   = AM().save(amdoc);
            // const check = AM().load(bin);
            DB().set(this.soul, bin, { immed: this.__storeImmed__() });
            this.__materializeReferenced__(visited);
        } catch (e) {
            this.logerr("materialize", e);
            // debugger;
        }
    }

    restore$() {
        return this._restore_$()
    }

    _restore_$(visited = new Set()) {
        this.$keys.forEach((key) => {
            const value = this.proxy$[key];
            if (value != undefined && isObject(value)) {
                if (visited.has(value)) return;
                visited.add(value);
                value. _restore_$?.(visited);
            }
        })
        return this.proxy$;
    }

    __materializeReferenced__(visited) {
        Object.entries(this.target).forEach(([prop, value]) => {
            // if (visited.has(value)) return;
            let propertySpec = this.__attributeSpec__(prop, value);
            if (value != undefined && isObject(value)) {
                // visited.add(value);
                if (!isPrivateProperty(prop) && propertySpec.storeIt) value.__materializeFromQ__?.(visited);
            }
        });
    }

    __storeImmed__() {
        const metaclass = this.metaClass$;
        return metaclass?.storeImmed ?? false;
    }

    //
    // SYNC
    //

    __requestSync__() {
        if (this.ephemeral) return;
        if (this.inTX) {
            this.dolog("addSync - inTX", this.soul);
            return;
        }
        if (this.readonly) return;
        if (!this.amdoc) return;
        this.dolog(">> SET::request sync 1");
        this.__enqueueSyncRequest__();
        this.dolog(">> SET::request sync 2");
    }

    __initialSync2Automerge__(opt) {
        this.dolog("initial Entity > AM", this.soul);
        this.__maintainTimestamps__();
        const amdoc = AM().init();
        this.amdoc = AM().change(amdoc, (doc) => this.__syncEntity2AM__(this.target, doc, opt));
    }

    __enqueueSyncRequest__() {
        syncrequestQ.add(this);
        this.__restartSyncReqest__();
    }

    __restartSyncReqest__() {
        if (syncrequestT) clearTimeout(syncrequestT);
        syncrequestT = setTimeout(() => {
            for (const item of syncrequestQ) item.__syncRequestFromQ__();
            syncrequestQ.clear();
        }, SYNCREQ_INTERVAL)
    }

    __syncRequestFromQ__() {
        this.dolog("request sync start");
        const soul    = this._soul;
        const syncmgr = SYNC();
        const samdoc = AM().clone(this.amdoc);
        syncmgr.discover(soul, samdoc, this._synced);
        this.dolog("request sync end");
    }


    //
    // sync thoregon entity 2 automerge
    //

    __syncEntity2AM__(from, to, { clean = false, typeRef } = {}) {
        if (!to._) to._ = {};
        const origin = classOrigin(from);
        if (!to._.origin) {
            to._.origin = (origin.startsWith('builtin:') && typeRef) ? typeRef : origin;
        } else {
            // don't override origin with 'builtin:*'
            // this is caused by missing import of the class
            if (!origin.startsWith('builtin:')) to._.origin = origin;
        }
        if (isArray(from)) {
            if (!to.$ary) to.$ary = [];
            to.$ary.splice(0, to.$ary.length, ...from);
        } else {
            const delprops = clean ? Object.keys(me.$access.amdoc).filter((prop) => prop != '_') : [];
            Object.entries(from).forEach(([prop, value]) => {
                if (prop === '_handle') return to[prop] = value;
                if (isPrivateProperty(prop)) return;
                let propertySpec = this.__attributeSpec__(prop, value);
                let toval        = to[prop];
                if (Object.is(toval, value)) return;  // check if some information needs to be used by the thoregon decorator
                const i = delprops.indexOf(prop);
                if (i > -1) delprops.splice(i, 1);
                if (isPromise(value) || isFunction(value)) {
                    // value = await value; // no support for promises.
                } else if (isNil(value)) {
                    if (!isNil(toval)) delete to[prop];
                } else if (isThoregon(value)) {
                    // consider embedded thoregon entities in future
                    const ref = serializeRef(value);
                    to[prop] = ref;
                } else {
                    // just use all other values.
                    to[prop] = value;
                }
            })
            delprops.forEach((delprop) => delete to[delprop]);
        }
    }

    __setAMProperty__(prop, value) {
        const amdoc = this.amdoc;
        if (prop === '_handle' && this.amdoc != undefined) return this.amdoc = AM().change(amdoc, (doc) => doc._handle = value ?? null);
        if (isPrivateProperty(prop) || this.amdoc == undefined) return;
        if (isThoregon(value)) value = serializeRef(value);
        if (Object.is(Reflect.get(this.amdoc, prop), value)) return false;
        if (isArray(value)) {
            this.amdoc = AM().change(amdoc, (doc) => {
                if (!doc.$ary) doc.$ary = [];
                doc.$ary.splice(0, doc.$ary.length, ...from);
            });
        } else {
            this.amdoc = AM().change(amdoc, (doc) => doc[prop] = value ?? null);
        }
        return true;
    }

    //
    // sync automerge 2 thoregon entity
    //

    __initialSync2Entity__() {
        this.dolog("initial AM > Entity", this.soul);
        this.__syncAM2Entity__(this.amdoc);
        // todo [OPEN]: TBD - previous persistent entites does not have a handle -> define what to do
    }

    __syncAM2Entity__(amfrom, amremote) {
        let totarget = this.target;
        const changes     = { set: [], del: [] };
        if (isArray(totarget) || amfrom?.$ary) {
            if (!isArray(totarget)) {
                totarget = this.target = [];
            }
            let newary;
            if (!amremote?.$ary && !amfrom.$ary) {
                newary = [];
                const aryprops = Object.keys(amfrom).filter(key => !isNaN(key));
                aryprops.forEach((i) => newary.push(amfrom[i]));
                amfrom.$ary = newary;
            } else {
                newary = [...amfrom?.$ary ?? amremote.$ary];
            }
            if (newary) {
                const oldary = [...totarget];
                totarget.splice(0, totarget.length, ...newary);
                for (let i =0; i<totarget.length; i++) {
                    const oldValue = oldary[i];
                    const newValue = totarget[i];
                    if (newValue !== oldValue) changes.set.push({ property: i, oldValue, newValue });
                }
                for (let i = totarget.length; i < oldary.length; i++) {
                    changes.del.push({ property: i, oldValue: Reflect.get(oldary, i, this.$proxy) });
                }
            }
        } else {
            const parent      = this.$proxy;
            const entityprops = new Set(Reflect.ownKeys(totarget).filter((name) => !isPrivateProperty(name)));
            this.dolog("__syncAM2Entity__", this.soul);
            const properties  = Object.entries(amfrom);
            const rproperties = Object.keys(amremote ?? {});
            const propadd     = rproperties.filter((rprop) => !properties.find((entry) => entry[0] === rprop));
            const propdel     = []; // properties.filter((prop) => !rproperties.includes(prop[0])).map(entry => entry[0]);
            propadd.forEach((rprop) => properties.push([rprop, amremote[rprop]]));
            properties.forEach(([prop, value]) => {
                entityprops.delete(prop);
                if (isPrivateProperty(prop)) return;
                if (prop === '_') return; //
                let propertySpec = this.__attributeSpec__(prop, value);
                if (propertySpec?.derived) return;
                let toref = amfrom[prop];
                let toval = Reflect.get(totarget, prop, this.$proxy);
                if (Object.is(toval, value)) return;
                const remotevalue = amremote?.[prop];
                if (amremote && Object.is(value, remotevalue) && Object.is(toval, value)) {
                    if (!Object.is(toref, remotevalue)) this.__setAMProperty__(prop, remotevalue);
                    return; // skip if values from both amdocs are equal
                }
                if (Object.is(toval, value)) return;
                if (isNil(value) || propdel.includes(prop)) {
                    changes.del.push({ property: prop, oldValue: Reflect.get(totarget, prop, this.$proxy) });
                    Reflect.deleteProperty(totarget, prop);
                } else if (isSerializedRef(value)) {
                    const otherref = value;
                    const currval = toval;
                    const currref = currval ? serializeRef(currval) : amfrom[prop];
                    if (currref === otherref && isSerializedRef(remotevalue) && currref !== remotevalue) {
                        this.__mergeReferences__(prop, totarget, currref, currval, remotevalue); // there was a conflict and an existing entity, need to merge with other
                    } else {
                        if (currref !== otherref) {
                            if (currref) {
                                if (!this.__checkReferenceConflict__(prop, amfrom, totarget, currref, currval, value)) {
                                    if (otherref === currref) return;  // same reference, no change
                                    // debugger;
                                    // console.log("$$ TD check merge!", prop, currref, otherref);
                                    this.__mergeReferences__(prop, totarget, currref, currval, otherref); // there was an entity, need to merge with other
                                }
                            }
                            if (currval) {
                                // if there is now a reference to an object but there was a value, remove the value
                                Reflect.deleteProperty(totarget, prop);
                                // and initialize it to sync it
                                Reflect.get(totarget, prop, this.$proxy);
                                // thoregon entity -> lazy init
                                changes.set.push({ property: prop, oldValue: toval });  // since new value is lazy initialized it can't be provided
                            }
                        }
                    }
                } else {
                    // just use all other values.
                    this.__set__(totarget, prop, this.__deserializeValue__(value));
                    changes.set.push({ property: prop, oldValue: toval, newValue: value })
                }
            })

            entityprops.forEach((prop) => {
                changes.del.push({ property: prop, oldValue: Reflect.get(totarget, prop, this.$proxy) });
                Reflect.deleteProperty(totarget, prop);
            });
        }

        return changes;
    }

    //
    // Merge entities, resolve conflicts
    //

    /* ----------------------------------------
     * - combine with __adjustTarget__()
     * - walk over properties of both objects
     * - merge 'values'
     * - resolve objects recursive and merge also
     *   - if the property exists only on one entity -> handle like __adjustTarget__
     * - connect deep listeners
     * ---------------------------------------- */

    __checkReferenceConflict__(prop, amfrom, totarget, currref, currval, value) {
        this.dolog("checkReferenceConflicts", prop, currref);
        const conflicts = AM().getConflicts(amfrom, prop);
        if (!conflicts) return false;
        const otherref = Object.values(AM().getConflicts(amfrom, prop)).find(ref => ref !== currref);      // this finds the 'other' entity reference which causes the conflict
        if (!otherref) return false;
        // now we have the 'other' entity, merge it
        this.__mergeReferences__(prop, totarget, currref, currval, otherref);
        return true;
    }

    __mergeReferences__(prop, to, currref, currval, otherref) {
        // merge local entity with 'other', set merged (new) in property
        this.dolog("mergeReferences", prop, currref, otherref);
        if (this.soul === ME().soul) {
            //debugger;
        }
        if (!currval) {
            const { soul, ref } = deserializeRef(currref);
            const { Cls, repo } = origin2Class(ref);
            currval = ThoregonDecorator.from(soul, { Cls });
        }
        const propertySpec = this.__attributeSpec__(prop);
        const { soul, ref } = deserializeRef(otherref);
        let   { Cls, repo } = origin2Class(ref);
        if (!Cls) propertySpec?.cls ?? currval.constructor ?? ObjCls;
        const other        = ThoregonDecorator.from(soul, { Cls });  // todo [REFACTOR]: add the class origin to the reference
        if (!other.materialized) {
            this.dolog("mergeReferences need sync other", prop, currref, otherref);
            other.__addSync__();
            other.addEventListener('synced', (evt) => other.__merge__(this, to, currval, prop), { once: true } );
        } else {
            other.__merge__(this, to, currval, prop);
        }
        // this.__setAMProperty__(prop, otherref); // this was done by the sync already
    }

    // maybe try this later: store ref to other entity immediately before sync.
/*
    __useRef__(parenthandler, to, other, prop) {
        const value = this.proxy$;

        // todo: current (other) must be applied to this object before it can be used!

        // exchange the entity in the parents property to this entity
        //const parent = parenthandler.proxy$;
        // @$@ LISTENERS @$@: move (deep) listeners to new ref
        parenthandler.__set__(to, prop, value);
        parenthandler.__setAMProperty__(prop, value);
        // value?.__checkDeepListeners__?.(parenthandler.proxy$, prop);    // todo [OPEN]: only when there are deep listeners

        this.__materialize__();
    }
*/

    __merge__(parenthandler, to, other, prop) {
        this.dolog("merge", prop, this.proxy$, other);
        if (!other) return;
        if (this.soul === ME().soul) {
            //debugger;
        }
        if (this.deleted) {
            parenthandler.__set__(to, prop, null);
            parenthandler.__setAMProperty__(prop, null);
            // value?.__checkDeepListeners__?.(parenthandler.proxy$, prop);    // todo [OPEN]: only when there are deep listeners
            this.__materialize__();
            parenthandler.materialize();
            const oldsoul = other.soul;
            SYNC().dropResource(oldsoul);
            DB().del(oldsoul);
        } else {
            const oldval = parenthandler.target[prop];
            if (oldval === this) return; // already in sync

            const otheramdoc = other.$access?.amdoc;
            if (!otheramdoc) return;

            this.__synced__(this._soul, otheramdoc);

            const value = this.proxy$;

            // exchange the entity in the parents property to this entity
            //const parent = parenthandler.proxy$;
            // @$@ LISTENERS @$@: move (deep) listeners to new ref
            parenthandler.__set__(to, prop, value);
            parenthandler.__setAMProperty__(prop, value);
            // value?.__checkDeepListeners__?.(parenthandler.proxy$, prop);    // todo [OPEN]: only when there are deep listeners

            this.__materialize__();
            parenthandler.materialize();
            const oldsoul = other.soul;
            SYNC().dropResource(oldsoul);
            DB().del(oldsoul);

            // this.__addSync__();     // again, sync with all other
            // parenthandler.__addSync__();
        }

    }
    //
    // sync manager
    //

    __addSync__(incommingSync) {
        if (this.ephemeral) return;
        if (this.inTX) {
            this.dolog("addSync - inTX");
            return;
        }
        if (this.readonly) return;
        this.dolog("addSync", this.soul);
        const soul = this._soul;
        const samdoc = AM().clone(this.amdoc);
        SYNC().discover(soul, samdoc, this._synced, { incommingSync });
    }

    __regSync__() {
        this.dolog("regSync", this.soul);
        const soul = this._soul;
        const samdoc = AM().clone(this.amdoc);
        SYNC().setResource(soul, samdoc, this._synced);
    }

    __synced__(soul, samdoc) {
        if (!samdoc) return;    // @@FIREFOX
        this.dolog("synced", this.soul);
        if (this._demand) this._demand.done = true;
        let curram = this.amdoc;
        this._lastSync = universe.inow;
        try {
            if (AM().equals(curram, samdoc) && curram !== samdoc) return false;
            if (this.soul === ME().soul) {
                // debugger;
            }
            let found = false;
            // if (soul === 'KZ0hl3pLJBU7n0osb68cDpU9vCvTr84b') {
            //     if (this.target.vatid !== 'EIN: 92-2983673') found = true;
            // }

            // if (this.__hasHeads__(curram)) curram = AM().clone(curram);
            const originremote = samdoc._?.origin;
            const originlocal  = curram._?.origin;
            const sizeMod = Object.keys(curram).length - Object.keys(samdoc).length;
            let ammerged  = AM().merge(AM().clone(curram), AM().clone(samdoc));
            this.amdoc    = this.chooseOrigin(ammerged, originremote, originlocal);

            // const amchanges = AM().getChanges(curram, this.amdoc);
            const changes = this.__syncAM2Entity__(this.amdoc, samdoc);
            this.emit('synced', { obj: this.proxy$ }, { once: true });

            // if (soul === 'KZ0hl3pLJBU7n0osb68cDpU9vCvTr84b' && found) {
            //     if (this.target.vatid === 'EIN: 92-2983673') debugger;
            // }
            if (this.amdoc._?.deleted) {
                this.__materialize__();
                this.emit('delete', { obj: this.proxy$, type: 'delete', isSync: true });
                return true;
            }

            const modified = this.__hasChangesToEmit__(changes);
            if (modified || sizeMod !== 0) {
                this.__materialize__();
                this.emit('change', { property: '*', changes, obj: this.proxy$, type: 'changes', isSync: true });
            }
            return modified;
        } catch (e) {
            console.log("Can't merge", e);
        }
        return false;
    }

    __hasHeads__(amdoc) {
        const hasHeads = AM().getHeads(amdoc)?.length > 0;
        return hasHeads;
    }

    chooseOrigin(curramdoc, originremote, originlocal) {
        let amdoc = curramdoc;

        if (originlocal == undefined) {
            amdoc = AM().change(amdoc, (doc) => doc._.origin = originremote);
        } else if (originlocal.startsWith('builtin:') && originremote?.startsWith('repo:')) {
            amdoc = AM().change(amdoc, (doc) => doc._.origin = originremote);
        }

        if (!amdoc._.origin) {
            amdoc = AM().change(amdoc, (doc) => doc._.origin = originremote ?? 'builtin:Object');
        } else if (amdoc._.origin.startsWith('builtin:')) {
            originlocal = amdoc._.origin;
            if (originlocal.startsWith('repo:')) amdoc = AM().change(amdoc, (doc) => doc._.origin = originlocal)
            else if (originremote.startsWith('repo:')) amdoc = AM().change(amdoc, (doc) => doc._.origin = originremote);
        }

        return amdoc;
    }

    __hasChangesToEmit__(changes) {
        const doEmit = !!changes.set?.find((change) => ((shouldEmit(change.property) ?? false) && !(Object.is(change.oldValue, change.newValue))));
        return doEmit || changes.del?.length > 0;
    }

    //
    // logging & debugging
    //

    static getlog(filter) {
        return filter
               ? logentries.filter(filter)
               : logentries;
    }

    static clearlog() {
        logentries = [];
    }

    static dolog(msg, ...args) {
        universe.debuglog(DBGID, msg, this.soul, /* this.__x, this.__td, */ ...args);
    }

    dolog(msg, ...args) {
        universe.debuglog(DBGID, msg, this.soul, /* this.__x, this.__td, */ ...args);
    }

    static logerr(msg, ...args) {
        universe.debuglog(DBGID, msg, this.soul, /* this.__x, this.__td, */ ...args);
    }

    logerr(msg,...args) {
        universe.debuglog(DBGID, msg, this.soul, /* this.__x, this.__td, */ ...args);
    }

}

//
// Polyfill
//

thoregondecoratormethods = getAllMethodNames(ThoregonDecorator.prototype);

if (!Object.prototype.$thoregon) Object.defineProperties(Object.prototype, {
    '$thoregon'  : { configurable: false, enumerable: false, writable: false, value: undefined },
    '$collection': { configurable: false, enumerable: false, writable: false, value: false },
});

if (globalThis.universe) universe.$ThoregonDecorator = ThoregonDecorator;
