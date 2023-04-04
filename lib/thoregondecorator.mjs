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

import AccessObserver, { getAllMethodNames } from "/evolux.universe/lib/accessobserver.mjs";
import MetaClass, { ATTRIBUTE_MODE }         from "/thoregon.archetim/lib/metaclass/metaclass.mjs";

import {
    isNil,
    isObject,
    isString,
    isPromise,
    isRef,
    isFunction
} from "/evolux.util/lib/objutils.mjs";
import {
    isSerializedRef,
    serialize,
    deserialize,
    serializeRef,
    deserializeRef,
    classOrigin,
    origin2Class,
    isThoregon,
}  from "/evolux.util/lib/serialize.mjs";

// import SEA                                             from "/evolux.everblack/lib/crypto/sea.mjs";

//
// debugging & logging
//

// temp log
let logentries = [];

const debuglog = (...args) => { /*console.log("$$ TD", ...args); logentries.push({ ...args });*/ };
const debuglog2 = (...args) => { console.log("$$ TD", ...args); logentries.push({ ...args }); };

const isDev = () => { try { return thoregon.isDev } catch (ignore) { return false } };

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

const isPrivateProperty = (property) => !isString(property) ? true :  property.startsWith('_') || property.startsWith('$') || property.endsWith('_') || property.endsWith('$');

const isTimestamp = (property) => property === 'created' || property === 'modified' || property === 'deleted';

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
        metaClass        = target?.$metaClass ?? Cls.metaClass ?? metaClass ?? ANY_METACLASS;
        this.amdoc       = amdoc;
        this.meta        = { Cls, metaClass, is };
        this.withDeleted = withDeleted;
        this.tombstone   = tombstone;
        this._soul       = soul ?? universe.random();
        this.encrypt$    = encrypt;
        this.decrypt$    = decrypt;
        this.__x         = universe.random(5);
        this.__td        = universe.inow;

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
    static observe(target, { parent, soul, Cls, metaClass, encrypt, decrypt, amdoc, withDeleted, tombstone } = {}) {
        if (target == undefined) return undefined;
        const proxy = super.observe(target, { parent, soul, Cls, metaClass, encrypt, decrypt, amdoc, withDeleted, tombstone });
        const decorator = proxy.$access;
        if (decorator) {
            this.__addKnownEntity__(soul, proxy);
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
     * @param soul
     * @param Cls
     * @param metaClass
     * @param encrypt
     * @param decrypt
     * @returns {Promise<ThoregonEntity>}
     */
    static /*async*/ available(soul, { Cls, metaClass, encrypt, decrypt, withDelete, tombstone } = {}) {
        return new Promise((resolve, reject) => {
            let entity = this.from(soul, { Cls, metaClass, encrypt, decrypt, withDelete, tombstone } = {});
            entity.__requestSync__();
            if (entity.materialized) return resolve(entity);
            // todo: add timeout
            entity.addEventListener('synced', (evt) => resolve(entity) );
        })
    }

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
        return !!this.amdoc._?.deleted;
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
        return this.target?.metaClass ?? this.meta?.metaClass ?? ANY_METACLASS;
    }

    get soul() {
        return this._soul;
    }

    get handle() {
        return this.amdoc._?.handle;
    }

    get materialized() {
        return DB().has(this._soul);
    }

    materialize() {
        return this.__materialize__();
    }

    //
    // proxy handler
    //


    has(target, key) {
        return Reflect.has(this.target, key);
    }

    ownKeys(target) {
        const keys = new Set([...Reflect.ownKeys(this.target), ...Reflect.ownKeys(this.amdoc), ...this.metaClass$.getAttributeNames()]).values();
        return [...keys].filter((prop) => this.isEnumerable(prop) && !this.isNil(prop));
    }

    isEnumerable(name) {
        if (typeof name === 'symbol' || isPrivateProperty(name)) return false;     // no symbols are emumerable
        let propertySpec = this.metaClass$.getAttribute(name) ?? { enumerable : !isPrivateProperty(name) }; // if no property spec skip it in enumerations
        return !isTimestamp(name) || propertySpec.enumerable;
    } // add others when implemented

    isNil(prop) {
        const value = Reflect.get(this.target, prop) ?? Reflect.get(this.amdoc, prop);
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
        return classOrigin(this.target);
    }

    get is_empty() {
        return this.$keys.length === 0;
    }
    //
    // INIT
    //

    __adjustTarget__(parent) {
        const target = this.target;
        parent = parent ?? target;
        // wrap all internal objects with a ThoregonDecorator
        Object.entries(target).forEach(([prop, value]) => {
            // todo [OPEN]:
            //  - avoid endless loops, pass set of visited objects
            //  - get class and metaclass from attribute spec if missing (e.g. the entity is a plain js object)
            //  - if there is a class and the entity is a plain object, create an instance and initialize ist properties with the objects props
            if (!isPrivateProperty(prop) && isRef(value) && !this.isObserved(value)) { // don't decorate already decorated entities
                value = ThoregonDecorator.observe(value, { parent, encrypt: this.encrypt$, decrypt: this.decrypt$ });
                this.__set__(target, prop, value);
            }
        })
    }

    __adjustReferencedEntity(entity, prop) {
        if (!entity) return entity;
        const propertySpec  = this.__attributeSpec__(prop);
        if (entity.constructor !== ObjCls) return entity;
        const Cls = propertySpec.cls;
    }

    __init__() {
        if (this.amdoc) {
            this.__initialSync2Entity__();
        } else {
            this.__initialSync2Automerge__();
        }
    }

    //
    // properties
    //

    __attributeSpec__(prop, value) {
        return this.metaClass$?.getAttribute(prop) ?? this.__defaultAttributeSpec__(prop, value);
    }

    __defaultAttributeSpec__(prop, value) {
        const opt = { embedded: true, persistent: true };
        // todo [REFACTOR]: depending on the value differenciate the attibute type
        // now use an embedded, persistent attribute w/o additional conversions
        let attribuetSpec = ANY_METACLASS.text(prop, opt);
        return attribuetSpec;
    }

    //
    // access
    //

    doGet(target, prop, receiver) {
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
        if (!this._syncFromGet || (universe.inow - this._syncFromGet) > SYNC_BY_GET_PERIOD) {
            this._syncFromGet = universe.inow;
            this.__requestSync__();
        }     // sanity
        let value = super.doGet(target, prop, receiver);
        if (value == undefined) {   // don't change to '==='
            // check if it lazy initialized
            const eref = this.amdoc[prop];
            if (eref != undefined) {     // don't change to '!=='
                if (isSerializedRef(eref)) {
                    const propertySpec  = this.__attributeSpec__(prop);
                    const { soul, ref } = deserializeRef(eref);
                    let   { Cls, repo } = origin2Class(ref);
                    if (!Cls) Cls = propertySpec?.cls ?? ObjCls;
                    this.dolog("doGet - from", this.soul, prop, soul);
                    value              = ThoregonDecorator.from(soul, { Cls });
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
                        value = ThoregonDecorator.observe(value, { parent: this.proxy$, encrypt: this.encrypt$, decrypt: this.decrypt$ });
                    }
                    this.dolog("doGet - autocomplete", this.soul, prop);
                    // in this case set and sync it
                    this.set(target, prop, value, receiver);
                }
            }
        }
        return value;
    }

    __set__(target, prop, value, receiver) {
        receiver = receiver ?? this.proxy$;
        Reflect.set(target, prop, value, receiver);
        if (this.hasDeepListeners()) value?.__checkDeepListeners__?.(receiver, prop);   // todo [OPEN]: add deep listener chain only when needed
    }

    __propertyDeleted__(prop, entity, evt) {
        this.deleteProperty(this.target, prop, this.proxy$);
        // if (!isPrivateProperty(prop) && !this.dontEmit(prop)) this.emit('change', { type: 'delete', obj: this.proxy$, property: prop, newValue: undefined, oldValue: entity });
    }

    decorate(target/*, parent*/) {
        const value = ThoregonDecorator.observe(target, { parent: this.proxy$, encrypt: this.encrypt$, decrypt: this.decrypt$ });
        return value;
    }

    doSet(target, prop, value, receiver) {
        if (isTimestamp(prop)) return;      // don't modify timestamps
        // this._modified = true;
        if (value === undefined) value = null;  // Automerge can not handle undefined
        const oldvalue = Reflect.get(target, prop, receiver);
        if (value === oldvalue) return;
        this.__maintainTimestamps__();
        if (value !== null) {
            this.__set__(target, prop, deserialize(value), receiver);
        }  else {
            super.doDelete(target, prop, receiver);
        }
        let propertySpec = this.__attributeSpec__(prop, value);
        if (propertySpec.storeIt) this.__setAMProperty__(prop, value);
        if (this.materialized && !isPrivateProperty(prop)) {
            this.__materialize__();
            if (value != undefined && this.materialized) value.materialize?.();
        }
    }

    afterSet(target, prop, value, receiver) {
        this.__requestSync__();
    }

    doDelete(target, prop, receiver) {
        this.doSet(target, prop, null, receiver);
    }

    afterDelete(target, prop, receiver) {
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
    // persistent entities
    //

    static __load__(soul) {
        try {
            let binentity = DB().get(soul);
            if (!binentity) return;
            const amdoc = AM().load(binentity);
            return amdoc;
        } catch (e) {
            this.logerr('__load__', e);
            return AM().init();
        }
    }

    static __entityFrom__(amdoc) {
        const origin = amdoc._?.origin;
        const { Cls, repo } = origin2Class(origin);
        const entity = new Cls();
        return entity;
    }

    static __restore__(soul, { Cls, metaClass, encrypt, decrypt, withDelete, tombstone } = {}) {
        let amdoc = this.__load__(soul);
        let target = (amdoc) ? this.__entityFrom__(amdoc) : Cls ? new Cls() : {};
        const proxy = this.observe(target, { soul, Cls, metaClass, encrypt, decrypt, amdoc, withDelete, tombstone });
        return proxy;
    }

    __materialize__(visited = new Set()) {
        const receiver = this.proxy$ ?? this;
        if (visited.has(receiver)) return;
        visited.add(receiver);
        try {
            const soul  = this._soul;
            const amdoc = this.amdoc;
            const bin   = AM().save(amdoc);
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
        const amdoc = AM().init();
        this.amdoc = AM().change(amdoc, (doc) => this.__syncEntity2AM__(this.target, doc));
    }

    //
    // sync thoregon entity 2 automerge
    //

    __syncEntity2AM__(from, to) {
        const origin = classOrigin(from);
        to._ = { origin, handle: universe.random(9) };
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
        if (isPrivateProperty(prop)) return;
        const amdoc = this.amdoc;
        if (isThoregon(value)) value = serializeRef(value);
        this.amdoc = AM().change(amdoc, (doc) => doc[prop] = value);
    }

    //
    // sync automerge 2 thoregon entity
    //

    __initialSync2Entity__() {
        this.__syncAM2Entity__(this.amdoc, this.target, true);
        // todo [OPEN]: TBD - previous persistent entites does not have a handle -> define what to do
        // if (this.amdoc._.handle == undefined) {
        // }
    }

    __syncAM2Entity__(amfrom, totarget, initial = false) {
        const changes     = { set: [], del: [] };
        const parent      = this.$proxy;
        const entityprops = new Set(Object.keys(totarget).filter((name) => !isPrivateProperty(name)));
        Object.entries(amfrom).forEach(([prop, value]) => {
            entityprops.delete(prop);
            if (isPrivateProperty(prop)) return;
            // let propertySpec = this.__attributeSpec__(prop, value);
            if (prop === '_') return; //
            let toval = Reflect.get(totarget, prop);
            if (toval === value) return;
            if (isNil(value)) {
                changes.del.push({ property: prop, oldValue: Reflect.get(totarget, prop) });
                Reflect.deleteProperty(totarget, prop);
            } else if (isSerializedRef(value)) {
                const otherref = value;
                const currval = toval;
                const currref = currval ? serializeRef(currval) : undefined;
                if (currref) {
                    if (!this.__checkReferenceConflict__(prop, amfrom, totarget, currref, currval, value)) {
                        if (otherref === currref) return;  // same reference, no change
                        // debugger;
                        console.log("$$ TD check merge!", prop, currref, otherref);
                        this.__mergeReferences__(prop, totarget, currref, currval, otherref); // there was an entity, need to merge with other
                    }
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
            changes.del.push({ property: prop, oldValue: Reflect.get(totarget, prop) });
            Reflect.deleteProperty(totarget, prop);
        });
        return changes;
    }

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

/*
    merge(parenthandler, to, other, prop) {
        this.__merge__(parenthandler, to, other, prop);
    }
*/

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
        this.dolog("synced", this.soul);
        const curram = this.amdoc;
        this.amdoc = AM().merge(curram, samdoc);
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
        debuglog(">", this.__x, this.__td, universe.inow, ...args);
    }

    dolog(...args) {
        debuglog(">", this.__x, this.__td, universe.inow, ...args);
    }

    static logerr(...args) {
        debuglog("E", this.__x, this.__td, universe.inow, ...args);
    }

    logerr(...args) {
        debuglog("E", this.__x, this.__td, universe.inow, ...args);
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
