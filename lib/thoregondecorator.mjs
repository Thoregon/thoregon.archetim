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
    persistancedeserialize,
    persistanceserialize
}                                           from "/evolux.util/lib/serialize.mjs";

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

//
// interfaces
//

const DB   = () => universe.neuland;

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

    constructor(target, { parent, soul, handle, refs, Cls, metaClass, encrypt, decrypt, is, withDeleted = false, tombstone = false, load = false, readonly = false } = {}) {
        super(target, parent);
        Cls              = target?.constructor ?? Cls ?? ObjCls;
        metaClass        = target?.[METACLASS_PROPERTY] ?? Cls.metaClass ?? metaClass ?? ANY_METACLASS;
        this.meta        = { Cls, metaClass, is };
        this.refs        = refs ?? {};
        this.withDeleted = withDeleted;
        this.tombstone   = tombstone;
        this.readonly    = readonly ?? metaClass.readonly ?? false;
        this.fullinit    = false;
        this.encrypt$    = encrypt;
        this.decrypt$    = decrypt;
        this._soul       = soul ?? universe.random();
        this._handle     = handle ?? murmurhash3(this._soul,MURMUR_SEED) ?? undefined;

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
     * @param withDeleted   ... deleted objects can be retrieved by its property (key)
     * @param tombstone     ... properties of the deleted entity can be retrieved, but its readonly
     * @returns {Proxy<Object>}     decorated entity
     */
    static observe(target, { props, parent, soul, handle, refs, create, ephemeral, Cls, typeRef, metaClass, encrypt, decrypt, withDeleted, tombstone, load = false, readonly = false } = {}) {
        if (target == undefined) return undefined;
        const proxy = super.observe(target, { props, parent, soul, handle, refs, create, ephemeral, Cls, typeRef, metaClass, encrypt, decrypt, withDeleted, tombstone, load, readonly });
        const decorator = proxy.$access;
        this.ephemeral = ephemeral;
        if (decorator) {
            this.__addKnownEntity__(decorator.soul, proxy);
        }
        return proxy;
    }

    observerClass() {
        return ThoregonDecorator;
    }

    //
    // instances
    //


    static from(soul, { Cls, typeRef, handle, metaClass, encrypt, decrypt, withDelete, tombstone, incommingSync = false } = {}) {
        let entity = this.getKnownEntity(soul);
        if (entity) return entity;

        entity = this.__restore__(soul, { Cls, typeRef, handle, metaClass, encrypt, decrypt, withDelete, tombstone, incommingSync });
        return entity;
    }

    static recreate(soul, obj, refs, opt) {
        return universe.neuland.has(soul) ? ThoregonDecorator.from(soul) : undefined;
    }

    static async recode(prevobj, flat = true) {
        const soul   = prevobj.$soul;
        const origin = prevobj.$origin;
        const Cls    = await this.__class4origin__(origin);         //  dorifer.cls4origin(origin) ?? origin === 'builtin:Array' ? Array : Object;
        const obj    = new Cls();

        const props = Object.keys(prevobj).filter((prop) => !isPrivateProperty(prop));
        for await (const prop of props) {
            let value = prevobj[prop];
            if (isObject(value)) {
                if (flat) continue;
                if (Reflect.has(value, '$soul')) {
                    const subobj = await this.recode(value, false);
                    Reflect.set(obj, prop, subobj);
                } else {
                    const subobj = this.observe(value);
                    Reflect.set(obj, prop, subobj);
                }
            } else {
                Reflect.set(obj, prop, value);
            }
        }

        const proxy = this.observe(obj, { soul });
        return proxy;
    }

    static async __class4origin__(origin) {
        if (!origin || !origin.startsWith('repo:')) return origin === 'builtin:Array' ? Array : Object;
        let clspath = origin.substring(5);
        const i = clspath.indexOf(':');
        let clsname = 'default';
        if (i > -1) {
            clspath = clspath.substring(0,i);
            clsname = clspath.substring(i+1);
        }
        const module = await import(clspath);
        const Cls = module[clsname] ?? module.default;
        return Cls;
    }

    //
    // info & inspection
    //

    inspect$() {
        const target = this.target;
        const props = Object.keys(target).filter(prop => prop !== '_');
        const res = { _soul: this._soul, _origin: this_.origin };
        props.forEach((prop) => {
            const val = target[prop];
            if (val == undefined) return;
            if (isSerializedRef(val)) {
                res[prop] = val.substring(4).replace('|repo:', ' :: ');
            } else {
                res[prop] = target[prop];
            }
        });
        return res;
    }


    /**
     * delete the entity
     *
     * todo [OPEN]
     *  - add to SSI 'trashcan'
     * just marks as deleted,
     */
    delete() {
        // todo [**SYNC**]
        this.emit('delete', { obj: this.proxy$, type: 'delete' }, { once: true });
    }

    get deleted() {
        return false;
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
        const hdl = parseInt(this._handle);
        return !isNaN(hdl) ? hdl : murmurhash3(this._soul,MURMUR_SEED);
        // return this._handle;  // murmurhash3(this._soul, MURMUR_SEED);
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
    // proxy handler
    //


    has(target, key) {
        return this.keySet.has(key); // Reflect.has(this.target, key);
    }

    ownKeys(target) {
        let keys = new Set([...Reflect.ownKeys(this.target), ...Reflect.ownKeys(this.refs), ...this.metaClass$.getAttributeNames()]).values();
        keys = [...keys].filter((prop) => this.isEnumerable(prop) && (!this.isNil(prop) || this.metaClass$.getAttribute(prop)?.hasDefaultValue) || this.metaClass$.getAttribute(prop)?.autocomplete);
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
        if (this.refs.hasOwnProperty(prop)) return false;
        const value = Reflect.get(this.target, prop, this.proxy$);
        return isNil(value);
    }

    get $keys() {
        return this.ownKeys(this.target);
    }

    __keys__() {
        const keys = new Set([...Reflect.ownKeys(this.target), ...Reflect.ownKeys(this.refs), ...this.metaClass$.getAttributeNames()]).values();
        return [...keys].filter((prop) => !isPrivateProperty(prop));
    }

    get keySet() {
        return new Set(this.ownKeys(this.target));
    }

    classOrigin() {
        return this._origin ?? classOrigin(this.target);
    }

    get is_empty() {
        return this.$keys.length === 0;
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


    __init__(opt = {}) {
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
            return isArray(target) ? this.$keys.length - 1 : this.$keys.length; // Object.keys(this.target).length;
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
        if (value == undefined) {   // don't change to '==='
            // check if it lazy initialized
            const eref = this.refs[prop];
            if (eref != undefined) {     // don't change to '!=='
                    const propertySpec  = this.__attributeSpec__(prop);
                    const soul = eref;
                    // const { soul, ref } = deserializeRef(eref);
                    // let   { Cls, repo } = origin2Class(ref);
                    // if (!Cls) Cls = propertySpec?.cls ?? ObjCls;
                    // const metaClass = Cls.metaClass ?? propertySpec.metaclass ?? propertySpec.targetMetaClass;
                    this.dolog("doGet - from", this.soul, prop, soul);
                    value              = ThoregonDecorator.from(soul);
                    this.__set__(target, prop, value, receiver);
                    if (this.materialized && !value.materialized) {
                        value.materialize();
                    }
                    if (value?.__isObserved__) value.addEventListener('delete', (evt) => this.__propertyDeleted__(prop, value, evt));
            } else {
                value = this.metaClass$.autoCompleteFor(target, prop);
                if (isRef(value)) {
                    if (!this.isObserved(value)) {
                        const metaClass = this.metaClass$.getAttribute(prop).targetMetaClass;
                        value = ThoregonDecorator.observe(value, { parent: this.proxy$, metaClass, encrypt: this.encrypt$, decrypt: this.decrypt$ });
                    }
                    this.dolog("doGet - autocomplete", this.soul, prop);
                    // todo: the 'set' should be invoked with the proxy because it may invoke a set method
                    //  but currently this causes a endless loop, because the 'old' value will be retrieved,
                    //  whitch ends up here again.
                    this.doSet(target, prop, value, receiver, { override: true });
                    this.afterSet(target, prop, value, receiver, { override: true });
                    // Reflect.set(target, prop, value);
                }
            }
        }
        return value;
    }

    getDefaultValue(target, prop, opt = {}) {
        if (!opt.load) return super.getDefaultValue(target, prop, opt);
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
            this.dolog(">> SET::set0 value", prop);
            this.__set0__(target, prop, value, receiver);
        }  else {
            this.dolog(">> SET::do delete", prop);
            if (oldvalue != undefined) {
                delete this.refs[prop];
                // delete only when there was no object?  if (!isObject(oldvalue)) ...
                modified = super.doDelete(target, prop, receiver);
            }
        }
        modified = modified && propertySpec.storeIt;
        this.dolog(">> SET::set AM property", prop);
        if (modified) {
            this.dolog(">> SET::maintain timestamps", prop);
            this.__maintainTimestamps__();
            if (this.materialized) {
                this.dolog(">> SET::materialize", prop);
                this.__materialize__();
                if (value != undefined && this.materialized) value.materialize?.();
            }
        }
        this.dolog(">> SET::DONE", prop);
        return modified;
    }

    afterSet(target, prop, value, receiver, opt = {}) {
    }

    doDelete(target, prop, receiver, opt = {}) {
        return this.doSet(target, prop, null, receiver);
    }

    afterDelete(target, prop, receiver, opt = {}) {
        this.afterSet(target, prop, null, receiver);
    }

    additionalEventParams() {
        return { remotesoul: this.soul };
    }

    __maintainTimestamps__() {
        // will store it anyways for every entity.
        // entities with 'suppressTimestamps' just can't get the values
        const target = this.target;
        const now = universe.now;
        if (!target.created) {
            target.created = now;
        }
        target.modified = now;
    }

    //
    // primitive modifications
    //

    static primitiveSet(receiver, prop, value,) {
        const { decorator, target } = this.__primitive__(receiver);
        const res = super.primitiveSet(receiver, prop, value);
        return res;
    }

    static primitiveDelete(receiver, prop) {
        const { decorator, target } = this.__primitive__(receiver);
        const res = super.primitiveDelete(receiver, prop);
        return res;
    }

    //
    // sync & content
    //

    fullinit() {
        this.fullinit = true;
        this.__initEmbedded__();
    }

    //
    // persistent entities
    //

    static __load__(soul) {
        try {
            let serentity = DB().get(soul);
            return serentity;
        } catch (e) {
            this.logerr('__load__', soul, e);
        }
    }

    static __restore__(soul, { Cls, typeRef, handle, metaClass, encrypt, decrypt, withDelete, tombstone, incommingSync = false } = {}) {
        this.dolog("__restore__", soul);
        let serentity = this.__load__(soul);
        let obj, meta, refs = {};
        if (!serentity) {
            obj = Cls ? new Cls() : {};
        } else {
            ({ obj, refs, handle, Cls, meta } = this.__deserializeDecorator__(serentity, Cls));
        }
        const proxy = this.observe(obj, { soul, refs, handle, Cls, typeRef, metaClass, encrypt, decrypt, withDelete, tombstone, incommingSync, load:true, ...meta });
        return proxy;
    }

    static __deserializeDecorator__(serentity, OptCls) {
        const { soul, obj, refs, meta, Cls } = persistancedeserialize(serentity, { OptCls });
        const handle        = meta['@handle'];
        const origin        = meta['@type'];
        return { soul, handle, origin, obj, refs, meta, Cls }
    }

    __materialize__() {
        if (this.ephemeral) return;
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
            const target = this.target;
            const entity = {
                '@soul': soul,
                '@handle': this._handle,
                '@type': this.classOrigin(),
                ...target
            };
            const serentity   = persistanceserialize(entity, this.refs);
            DB().set(this.soul, serentity, { immed: this.__storeImmed__() });
            this.__materializeReferenced__(visited);
        } catch (e) {
            this.logerr("materialize", e);
            console.error("materialize", e);
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
