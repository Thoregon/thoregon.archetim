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
import murmurhash3                                       from './murmurhash.mjs';
// may use CRC32 instead -> https://github.com/SheetJS/js-crc32

import {
    isNil,
    isObject,
    isString,
    isSymbol,
    isPromise,
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
    isThoregon,
}                        from "/evolux.util/lib/serialize.mjs";

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

//
// decorate properties and methods from decorator to apply them on the entity
//

let thoregondecoratorprops = [], thoregondecoratormethods = [];


//
//  consts
//

// all syncs within this period will be collected to one
const SYNC_CONSOLIDATION_PERIOD = 80;
const SYNC_BY_GET_PERIOD        = 800;

const MURMUR_SEED               = 7577308388235833;

const ANY_METACLASS = MetaClass.any();

//
// registry
//

const KNOWN_ENTITIES = new Map();

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

const isPrivateProperty = (property) => isSymbol(property) || !isString(property) ? true :  property.startsWith('_') || property.startsWith('$') || property.endsWith('_') || property.endsWith('$');

const isTimestamp = (property) => property === 'created' || property === 'modified' || property === 'deleted';

const NON_ENUMERABLE = new Set(['metaclass', 'metaClass']);
const nonEnumerable  = (property) => NON_ENUMERABLE.has(property);

const shouldEmit = (property) => !(isPrivateProperty(property) || isTimestamp(property));

const hasClassReference = (obj) => !!(obj?._?.origin);
const getClassReference = (obj) => obj?._?.origin;


/**
 * ThoregonDecorator
 *
 * Proxy handler to work smoth with neuland entities
 */
export default class ThoregonDecorator extends AccessObserver {

    constructor(target, { parent, soul, handle, Cls, metaClass, encrypt, decrypt, is, amdoc, withDeleted = false, tombstone = false } = {}) {
        super(target, parent);
        Cls              = target?.constructor ?? Cls ?? ObjCls;
        metaClass        = target?.[METACLASS_PROPERTY] ?? Cls.metaClass ?? metaClass ?? ANY_METACLASS;
        this.amdoc       = amdoc;
        this.meta        = { Cls, metaClass, is };
        this.withDeleted = withDeleted;
        this.tombstone   = tombstone;
        this.fullinit    = false;
        this.encrypt$    = encrypt;
        this.decrypt$    = decrypt;
        this.__x         = universe.random(5);
        this.__td        = universe.inow;
        this._soul       = soul ?? universe.random();
        this._handle     = !soul ? universe.random(9) : undefined;

        this._synced          = (soul, amdoc) => this.__synced__(soul, amdoc);
        this._propertyDeleted = (evt) => this.__propertyDeleted__(evt);

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
    static observe(target, { parent, soul, create, Cls, metaClass, encrypt, decrypt, amdoc, withDeleted, tombstone, load = false } = {}) {
        if (target == undefined) return undefined;
        const proxy = super.observe(target, { parent, soul, create, Cls, metaClass, encrypt, decrypt, amdoc, withDeleted, tombstone, load });
        const decorator = proxy.$access;
        if (decorator) {
            this.__addKnownEntity__(decorator.soul, proxy);
            decorator.__addSync__();
        }
        return proxy;
    }

    //
    // instances
    //


    static from(soul, { Cls, metaClass, encrypt, decrypt, withDelete, tombstone } = {}) {
        let entity = this.getKnownEntity(soul);
        if (entity) return entity;

        entity = this.__restore__(soul, { Cls, metaClass, encrypt, decrypt, withDelete, tombstone });
        return entity;
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
        this.amdoc = AM().change(this.amdoc, (doc) => doc._.deleted = universe.now);
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
        return murmurhash3(this._soul, MURMUR_SEED);
    }

    get materialized() {
        return DB().has(this._soul);
    }

    materialize() {
        return this.__materialize__();
    }

    //
    // Automerge BUG ugly workaround ->
    //

    $amdocsafe() {
        const Automerge = AM();
        try {
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
        try {
            const amdoc = this.amdoc;
            const bin   = Automerge.save(amdoc);
            const ream  = Automerge.load(bin);
            return bin;
        } catch (e) {
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
        return Reflect.has(this.target, key);
    }

    ownKeys(target) {
        const keys = new Set([...Reflect.ownKeys(this.target), ...Reflect.ownKeys(this.amdoc ?? {}), ...this.metaClass$.getAttributeNames()]).values();
        return [...keys].filter((prop) => this.isEnumerable(prop) && !this.isNil(prop));
    }

    isEnumerable(name) {
        if (isPrivateProperty(name) || nonEnumerable(name)) return false;     // no symbols are emumerable
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

    classOrigin() {
        return this.amdoc._.origin ?? classOrigin(this.target);
    }

    get is_empty() {
        return this.$keys.length === 0;
    }
    //
    // INIT
    //

    __mergeValues__(other) {
        if (!other) return;
        const current = this.target;
        const receiver = this.proxy$;

        // walk over the properties
        const entries      = Object.entries(current);
        const propssettled = new Set();
        entries.forEach(([prop, currvalue]) => {
            if (isPrivateProperty(prop) || isTimestamp(prop)) return;
            let othervalue = Reflect.get(other, prop, other.$access?.proxy$);
            if (othervalue == undefined) return;
            propssettled.add(prop);
            if (currvalue === othervalue) return;
            if (isRef(othervalue) && isRef(currvalue)) {
                // both are objects, merge it
                this.__mergeEntities__(othervalue, currvalue, prop, current, receiver);
            } else {
                // replace with (primitive) othervalue
                othervalue = this.__observed__(othervalue, prop);
                // attach deep listener if it exists
                this.dolog("__mergeValues__ set value", this.soul, prop, othervalue);
                this.__set__(current, prop, othervalue, receiver);
            }
        });
        // need to process all remaining properties from other
        const otherentries = Object.entries((other)).filter(([prop, value]) => !propssettled.has(prop));
        otherentries.forEach(([prop, value]) => {
            if (isPrivateProperty(prop) || isTimestamp(prop) || value == undefined) return;
            value = this.__observed__(value, prop);
            this.dolog("__mergeValues__ set value", this.soul, prop, value);
            this.__set__(current, prop, value);
        })
    }

    __mergeEntities__(othervalue, value, prop, parent, receiver) {
        if (othervalue === value) return;
        if (isPrivateProperty(prop) || isTimestamp(prop)) return;
        // need to merge both
        // will be invoked only with 2 objects (othervalue, value)
        // todo [OPEN]: add sanity checks (if both values are an Object
        this.dolog("__mergeEntities__", this.soul, parent?.soul, prop, value);
        if (othervalue.constructor === value.constructor) {
            if (!this.isObserved(value)) {
                othervalue = this.__observed__(othervalue, prop);
                this.__set__(parent, prop, othervalue, receiver);
                othervalue.__mergeValues__(value);
            } else {
                // same class, just merge, don't replace in property
                value.__mergeValues__(othervalue);
            }
        } else if (othervalue.constructor === Object) {
            // value is instance on another class than Object, merge othervalue into value, don't replace in property
            value.__mergeValues__(othervalue);
            // check deep listeners
        } else if (value.constructor === Object) {
            // othervalue is instance on another class than Object, merge value into othervalue and replace in property
            othervalue = this.__observed__(othervalue, prop);
            this.__set__(parent, prop, othervalue, receiver);
            othervalue.__mergeValues__(value);
        } else {
            // now we have two objects with different classes
            // replace the property with othervalue, don't merge
            othervalue = this.__observed__(othervalue, prop);
            this.__set__(parent, prop, othervalue, receiver);
        }
    }

    __mergeProperty__(target, prop, value, othervalue, receiver) {
        if (isPrivateProperty(prop) || isTimestamp(prop)) return false;
        if (isRef(othervalue) && isRef(value)) {
            this.__mergeEntities__(othervalue, value, prop, target, receiver)
            return true;
        }
        return false;
    }

    __observed__(value, prop) {
        if (!isPrivateProperty(prop) && isRef(value) && !this.isObserved(value)) { // don't decorate already decorated entities
            const metaClass = this.metaClass$.getAttribute(prop).targetMetaClass;
            value = ThoregonDecorator.observe(value, { parent, metaClass, encrypt: this.encrypt$, decrypt: this.decrypt$ });
        }
        return value;
    }

    __adjustTarget__(parent) {
        const target = this.target;
        parent = parent ?? target;
        const parentMetaClass = this.metaClass$;
        // wrap all internal objects with a ThoregonDecorator
        Object.entries(parent).forEach(([prop, value]) => {
            // todo [OPEN]:
            //  - avoid endless loops, pass set of visited objects
            //  - get class and metaclass from attribute spec if missing (e.g. the entity is a plain js object)
            //  - if there is a class and the entity is a plain object, create an instance and initialize ist properties with the objects props
            if (!isPrivateProperty(prop) && isRef(value) && !this.isObserved(value)) { // don't decorate already decorated entities
                const propertySpec = parentMetaClass.getAttribute(prop);
                const metaClass = propertySpec?.targetMetaClass;
                this.dolog("__adjustTarget__", this.soul, prop);
                value = ThoregonDecorator.observe(value, { parent, metaClass, encrypt: this.encrypt$, decrypt: this.decrypt$ });
                this.__set__(parent, prop, value);
            }
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
            this.__initialSync2Entity__();
        } else {
            this.__initialSync2Automerge__();
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
        const opt = { embedded: true, persistent: true, merge: true };
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
        // if the property is available return it. this is essential to invoke functions as usual!
        // !! Don't wrap with a Promise, also not with a resolved Promise - Promise.resolve(Reflect.get(target, prop))
        // if (prop === 'is_empty') {
        //     // todo [REFACTOR]: if nedded add other 'functional' properties, extract to method
        //     return Object.keys(this.target).length === 0;
        // }
        if (this.deleted && !this.tombstone) return undefined;      // when its deleted, no properties can be retrieved except it's a tombstone
        if (prop === 'length') {
            // todo [REFACTOR]: if nedded add other 'functional' properties, extract to method
            return Object.keys(this.target).length;
        }
        if (prop === 'soul') {
            // todo [REFACTOR]: if nedded add other 'functional' properties, extract to method
            return this._soul;
        }
        if (prop === 'handle') {
            // todo [REFACTOR]: if nedded add other 'functional' properties, extract to method
            return this._handle;
        }
        let value = super.doGet(target, prop, receiver);
        if (isPrivateProperty(prop)) return value;
        if (value == undefined) {   // don't change to '==='
            // check if it lazy initialized
            const eref = this.amdoc[prop];
            if (eref != undefined) {     // don't change to '!=='
                if (isSerializedRef(eref)) {
                    const propertySpec  = this.__attributeSpec__(prop);
                    const { soul, ref } = deserializeRef(eref);
                    let   { Cls, repo } = origin2Class(ref);
                    if (!Cls) Cls = propertySpec?.cls ?? ObjCls;
                    const metaClass = Cls.metaClass ?? propertySpec.metaclass;
                    this.dolog("doGet - from", this.soul, prop, soul);
                    value              = ThoregonDecorator.from(soul, { Cls, metaClass });
                    if (!(value?.deleted) || this.withDeleted) {    // if the reference is not deleted or this entity is explicitly define 'withDeleted'
                            this.__set__(target, prop, value, receiver);
                            if (value?.__isObserved__) value.addEventListener('delete', (evt) => this.__propertyDeleted__(prop, value, evt));
                    } else {
                        // todo [OPEN]: remove property -> this.deleteProperty(...)
                        value = undefined;
                    }
                } else {
                    if (prop in this.amdoc) {
                        value = deserialize(this.amdoc[prop]);
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
                    this.set(target, prop, value, receiver);
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
        if (!this._syncFromGet || (universe.inow - this._syncFromGet) > SYNC_BY_GET_PERIOD) {
            this._syncFromGet = universe.inow;
            this.__requestSync__();
        }
    }

    __set0__(target, prop, value, receiver) {
        const propertySpec = this.__attributeSpec__(prop, value);
        receiver = receiver ?? this.proxy$;
        if (value?.__isObserved__) value.addEventListener('delete', (evt) => this.__propertyDeleted__(prop, value, evt));
        Reflect.set(target, prop, value, receiver);
        if (this.hasDeepListeners()) value?.__checkDeepListeners__?.(receiver, prop);   // todo [OPEN]: add deep listener chain only when needed
        if (propertySpec.storeIt) this.__setAMProperty__(prop, value);
    }

    __set__(target, prop, value, receiver) {
        this.__checkInitEmbedded__(value, prop);
        this.__set0__(target, prop, value, receiver);
    }

    __checkInitEmbedded__(value, prop) {
        const propertySpec  = this.__attributeSpec__(prop);
        propertySpec?.adjustMetaclass(value);
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
        const currentValue = Reflect.get(target, prop, this.proxy$)
        target = propertySpec?.adjustEntity(target, currentValue) ?? target;
        const value = ThoregonDecorator.observe(target, { parent: parent ?? this.proxy$, metaClass, encrypt: this.encrypt$, decrypt: this.decrypt$ });
        return value;
    }

    doSet(target, prop, value, receiver, opt = {}) {
        if (isTimestamp(prop)) return;      // don't modify timestamps
        // this._modified = true;
        if (value === undefined) value = null;  // Automerge can not handle undefined
        const oldvalue = Reflect.get(target, prop, receiver);
        if (value === oldvalue) return;
        this.__maintainTimestamps__();
        if (isPrivateProperty(prop)) {
            Reflect.set(target, prop, value);
        } else {
            const propertySpec = this.__attributeSpec__(prop, value);
            if (value !== null) {
                value = deserialize(value);
                if (propertySpec.merge) {
                    if (!this.__mergeProperty__(target, prop, oldvalue, value, receiver)) {
                        this.__set0__(target, prop, value, receiver);
                    }
                } else {
                    this.__set0__(target, prop, value, receiver);
                }
            }  else {
                // delete only when there was no object?  if (!isObject(oldvalue)) ...
                super.doDelete(target, prop, receiver);
            }
            if (propertySpec.storeIt) this.__setAMProperty__(prop, value);
            if (this.materialized) {
                this.__materialize__();
                if (value != undefined && this.materialized) value.materialize?.();
            }
        }
    }

    afterSet(target, prop, value, receiver, opt = {}) {
        this.__requestSync__();
    }

    doDelete(target, prop, receiver, opt = {}) {
        this.doSet(target, prop, null, receiver);
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
        if (Cls === ObjCls && ECls) Cls = ECls;
        const entity = new Cls();
        return entity;
    }

    static __restore__(soul, { Cls, metaClass, encrypt, decrypt, withDelete, tombstone } = {}) {
        this.dolog("__restore__", soul);
        let amdoc = this.__load__(soul);
        let target = (amdoc) ? this.__entityFrom__(amdoc, Cls) : Cls ? new Cls() : {};
        const proxy = this.observe(target, { soul, Cls, metaClass, encrypt, decrypt, amdoc, withDelete, tombstone, load:true });
        return proxy;
    }

    __materialize__(visited = new Set()) {
        const receiver = this.proxy$ ?? this;
        if (visited.has(receiver)) return;
        visited.add(receiver);
        this.dolog("__materialize__", this.soul);
        try {
            const soul  = this._soul;
            const bin   = this.$ambinsafe();
            // const amdoc = this.amdoc;
            // const bin   = AM().save(amdoc);
            // const check = AM().load(bin);
            DB().set(soul, bin);
            // this._modified = false;
            this.__materializeReferenced__(visited);
        } catch (e) {
            this.logerr("materialize", e);
            // debugger;
        }
    }

    __materializeReferenced__(visited) {
        Object.entries(this.target).forEach(([prop, value]) => {
            if (visited.has(value)) return;
            let propertySpec = this.__attributeSpec__(prop, value);
            if (value != undefined && isObject(value)) {
                visited.add(value);
                if (!isPrivateProperty(prop) && propertySpec.storeIt) value.materialize?.(visited);
            }
        });
    }

    //
    // SYNC
    //

    __requestSync__() {
        if (!this.amdoc) return;
        this.dolog("requestSync", this.soul);
        const soul    = this._soul;
        const syncmgr = SYNC();
        const samdoc = AM().clone(this.amdoc);
        syncmgr.discover(soul, samdoc, this._synced);

        // ** no need to merge with resource from syncmgr
        // if (syncmgr.isResponsible(soul)) {
        //     let samdoc = AM().merge(syncmgr.getResource(soul), this.amdoc);
        //     syncmgr.discover(soul, samdoc);
        // } else {
        //     const samdoc = AM().clone(this.amdoc);
        //     syncmgr.discover(soul, samdoc, this._synced);
        // }
    }

    __initialSync2Automerge__() {
        this.dolog("initial Entity > AM", this.soul);
        this.__maintainTimestamps__();
        const amdoc = AM().init();
        this.amdoc = AM().change(amdoc, (doc) => this.__syncEntity2AM__(this.target, doc));
    }

    //
    // sync thoregon entity 2 automerge
    //

    __syncEntity2AM__(from, to) {
        if (!to._) to._ = {};
        const origin = classOrigin(from);
        if (!to._origin) {
            to._.origin = origin;
        } else {
            // don't override origin with 'builtin:*'
            // this is caused by missing import of the class
            if (!origin.startsWith('builtin:')) to._.origin = origin;
        }
        Object.entries(from).forEach(([prop, value]) => {
            if (isPrivateProperty(prop)) return;
            let propertySpec = this.__attributeSpec__(prop, value);
            let toval        = to[prop];
            if (toval === value) return;  // check if some information needs to be used by the thoregon decorator
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
    }

    __setAMProperty__(prop, value) {
        if (isPrivateProperty(prop) || this.amdoc == undefined) return;
        const amdoc = this.amdoc;
        if (isThoregon(value)) value = serializeRef(value);
        this.amdoc = AM().change(amdoc, (doc) => doc[prop] = value);
    }

    //
    // sync automerge 2 thoregon entity
    //

    __initialSync2Entity__() {
        this.dolog("initial AM > Entity", this.soul);
        this.__syncAM2Entity__(this.amdoc, this.target, true);
        // todo [OPEN]: TBD - previous persistent entites does not have a handle -> define what to do
    }

    __syncAM2Entity__(amfrom, totarget, initial = false) {
        const changes     = { set: [], del: [] };
        const parent      = this.$proxy;
        const entityprops = new Set(Object.keys(totarget).filter((name) => !isPrivateProperty(name)));
        this.dolog("__syncAM2Entity__", this.soul);
        Object.entries(amfrom).forEach(([prop, value]) => {
            entityprops.delete(prop);
            if (isPrivateProperty(prop)) return;
            // let propertySpec = this.__attributeSpec__(prop, value);
            if (prop === '_') return; //
            let toval = Reflect.get(totarget, prop, this.$proxy);
            if (toval === value) return;
            if (isNil(value)) {
                changes.del.push({ property: prop, oldValue: Reflect.get(totarget, prop, this.$proxy) });
                Reflect.deleteProperty(totarget, prop);
            } else if (isSerializedRef(value)) {
                const otherref = value;
                const currval = toval;
                const currref = currval ? serializeRef(currval) : undefined;
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
                }
                // thoregon entity -> lazy init
                changes.set.push({ property: prop, oldValue: toval });  // since new value is lazy initialized it can't be provided
            } else {
                // just use all other values.
                this.__set__(totarget, prop, deserialize(value));
                changes.set.push({ property: prop, oldValue: toval, newValue: value })
            }
        })

        entityprops.forEach((prop) => {
            changes.del.push({ property: prop, oldValue: Reflect.get(totarget, prop, this.$proxy) });
            Reflect.deleteProperty(totarget, prop);
        });
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

    /*
        merge(parenthandler, to, other, prop) {
            this.__merge__(parenthandler, to, other, prop);
        }
    */

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
    __useRef__(parenthandler, to, other, prop) {
        const value = this.proxy$;

        // todo: current (other) must be applied to this object before it can be used!

        // exchange the entity in the parents property to this entity
        //const parent = parenthandler.proxy$;
        parenthandler.__set__(to, prop, value);
        parenthandler.__setAMProperty__(prop, value);
        // value?.__checkDeepListeners__?.(parenthandler.proxy$, prop);    // todo [OPEN]: only when there are deep listeners

        this.__materialize__();
    }

    __merge__(parenthandler, to, other, prop) {
        this.dolog("merge", prop, this.proxy$, other);
        if (!other) return;
        const oldval = parenthandler.target[prop];
        if (oldval === this) return; // already in sync

        const otheramdoc = other.$access?.amdoc;
        if (!otheramdoc) return;

        this.__synced__(this._soul, otheramdoc);

        const value = this.proxy$;

        // exchange the entity in the parents property to this entity
        //const parent = parenthandler.proxy$;
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
    //
    // sync manager
    //

    __addSync__() {
        this.dolog("addSync", this.soul);
        const soul = this._soul;
        const samdoc = AM().clone(this.amdoc);
        SYNC().discover(soul, samdoc, this._synced);
    }

    __synced__(soul, samdoc) {
        if (!samdoc) return;
        this.dolog("synced", this.soul);
        if (this._demand) this._demand.done = true;
        const curram = this.amdoc;
        try {
            if (AM().equals(curram, samdoc)) return false;
            this.amdoc    = AM().merge(curram, samdoc);
            const changes = this.__syncAM2Entity__(this.amdoc, this.target);
            this.emit('synced', { obj: this.proxy$ }, { once: true });

            if (this.amdoc._?.del) {
                this.__materialize__();
                this.emit('delete', { obj: this.proxy$, type: 'delete', isSync: true });
                return true;
            }

            const modified = this.__hasChangesToEmit__(changes);
            if (modified) {
                this.__materialize__();
                this.emit('change', { property: '*', changes, obj: this.proxy$, type: 'changes', isSync: true });
            }
            return modified;
        } catch (e) {
            console.log("Can't merge", e);
        }
        return false;
    }

    __hasChangesToEmit__(changes) {
        const doEmit = !!changes.set?.find((change) => shouldEmit(change.property)) ?? false;
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

    static dolog(...args) {
        universe.debuglog(DBGID, this.soul, /* this.__x, this.__td, */ ...args);
        universe.debuglog(DBGID, this.soul, /* this.__x, this.__td, */ ...args);
    }

    dolog(...args) {
        universe.debuglog(DBGID, this.soul, /* this.__x, this.__td, */ ...args);
    }

    static logerr(...args) {
        universe.debuglog(DBGID, this.soul, /* this.__x, this.__td, */ ...args);
    }

    logerr(...args) {
        universe.debuglog(DBGID, this.soul, /* this.__x, this.__td, */ ...args);
    }

}

//
// Polyfill
//

thoregondecoratormethods = getAllMethodNames(ThoregonDecorator.prototype);

if (!Object.prototype.$thoregon) Object.defineProperties(Object.prototype, {
    '$thoregon'  : { configurable: false, enumerable: false, writable: false, value: undefined },
    '$collection': { configurable: false, enumerable: false, writable: false, value: undefined },
});

if (globalThis.universe) universe.$ThoregonDecorator = ThoregonDecorator;
