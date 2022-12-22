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
 * todo [OPEN]
 *  - introduce a lifecycle state machine for each persistent object (reserved, materialized, deleted)
 *  - introduce a modification state machine for each persistent object (before, while, done)
 *  - $@KIND check if property kind (simple of reference) has changed
 *  - reserve items
 *      - reserve named property/item, but also name is unknown
 *      - reserve collection item, again key is unknown
 *      - materialize with new name/key in the parent object
 *
 * TASKS:
 *  - $@PENDINGSET:
 *      - prevent emitting 'change' multiple
 *      - prevent setting the value/ref multiple
 *      - prevent retrieving an object multiple when it is already available
 *  - $@SOUL: check if a reference has been modified.
 *      - current: always emit 'change' event
 *      - is a check needed to emit only if the reference has been changed?
 *  - $@RESERVE
 *      - do nothing at first if no key is provided
 *      - if a key is provided, restore at first access (get/set)
 *
 * @author: Martin Neitz, Bernhard Lukassen
 */

import AccessObserver, { getAllMethodNames } from "/evolux.universe/lib/accessobserver.mjs";
import ThoregonEntity, { ThoregonObject }    from "./thoregonentity.mjs";
import Reporter                              from "/evolux.supervise/lib/reporter.mjs";
import SEA                                   from "/evolux.everblack/lib/crypto/sea.mjs";
import { isNil, isString, isPromise }        from "/evolux.util/lib/objutils.mjs";
import MetaClass, { ATTRIBUTE_MODE }         from "./metaclass/metaclass.mjs";
import PromiseChain                          from "./promisechain.mjs";

import {
    serialize,
    simpleSerialize,
    canReference,
    deserialize,
    classOrigin,
    originAsClass,
} from "/evolux.util/lib/serialize.mjs";

import {
    timeout,
    doAsync,
    asynccallback
} from "/evolux.universe";

import {
    ErrCantReserveProperty,
    ErrObjectNotFound,
//    ErrObjectOverwrite
} from "./errors.mjs";

// import Node             from "./graph/node.mjs";
let $persistenceRoot = universe.gun;     // Node.root() for testing
const persistenceRoot = () => $persistenceRoot ?? ($persistenceRoot = universe.gun);

const T     = universe.T;
const PXAES = 'TS';      // thoregon symetric AES encrypted

const PERSISTER_VERSION = '21_1';

const ANY_METACLASS = MetaClass.any();

//
// logging & debugging
//

const isDev = () => { try { return thoregon.isDev } catch (ignore) { return false } };

const debuglog = (...args) => logentries.push({ ...args }); // {};   // console.log(...args);

// temp log
let logentries = [];

//
// decorate properties and methods from decorator to apply them on the entity
//

let thoregondecoratorprops = [], thoregondecoratormethods = [];

/** native gun access ***********************************************************************************/

function is(gunnode) {
    return new Promise(resolve => {
        gunnode
            .once((res) => resolve(res != undefined))
            .not(() => resolve(false));
    });
}

function soul(gunnode) {
    return new Promise(resolve => {
        gunnode
            .once(item => resolve(nodeSoul(item)))
            .not(() => resolve(undefined));
    });
}

function val(gunnode) {
    return new Promise(resolve => {
        gunnode.once((data, key) => {
            resolve(data);
        }).not(() => resolve());
    });
}

function nodeSoul(node) {
    return node?._?.["#"];
}

function state() {
    return universe.Gun.state();
}

/********************************************************************************************************/
/* system properties */


const isPrivateProperty = (property) => !isString(property) ? true :  property.startsWith('_') || property.startsWith('$') || property.endsWith('_') || property.endsWith('$');

const isTimestamp = (property) => property === 'created' || property === 'modified' || property === 'deleted';

const shouldEmit = (property) => !(isPrivateProperty(property) || isTimestamp(property));

/********************************************************************************************************/

export default class ThoregonDecorator extends Reporter(AccessObserver) {

    //
    // creation
    //

    // don't  wrap target with WeakRef, because no other referrence may exist

    constructor(target, parent, { handle$, store, metaClass, encrypt, decrypt }) {
        super(target, parent);
        this.meta          = { metaClass };
        this.encrypt$      = encrypt;
        this.decrypt$      = decrypt;
        this.propsouls     = {};       // $@SOUL
        this.pendingSet    = {};
        this.varprops      = new Set();
        this._reserved     = false;    // $@RESERVE
        this.__x           = universe.random(5);
        this.__td          = universe.inow;
        if (handle$) {
            this.handle$ = handle$;
        } else if (store) {
            this.handle$ =  isString(store)
                            ? { store: persistenceRoot().get(store) }
                            : { store };
        }

        this.__prepareMeta__();
    }

    static observe(target, { handle$, store, metaClass, parent, encrypt, decrypt } = {}) {
        const proxy = super.observe(target, parent, { handle$, store, metaClass, encrypt, decrypt });
        if (globalThis.FinalizationRegistry) {
            // todo [REFACTOR]:
            //  - introduce a FinalizationRegistry on the proxy to invalidate this handler
        }
        return proxy;
    }

    static async from(root, { cls, metaClass, parent, encrypt, decrypt, dothrow } = {}) {
        let store;
        const _metaClass = metaClass;
        if (!isString(root)) {
            store = root;
        } else {
            store = persistenceRoot().get(root);
            if (! await ThoregonDecorator.materialized(store)) return;     // there is no object stored
        }
        try {
            let { target, handle$, metaClass } = await this.__restore__(store, decrypt, { dothrow });
            if (target == undefined) return;
            if (_metaClass) metaClass = _metaClass;
            const proxy               = this.observe(target, { handle$, metaClass, parent, encrypt, decrypt });
            await proxy.connect();
            return proxy;
        } catch (ignore) {
            this.logerr("from", "error", ignore);
        }
    }

    //
    // logging & debugging
    //

    static getlog() {
        return logentries;
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

    /**
     * answers if there is a persistent object
     * does not check the target class
     * @param {String | Node} root
     * @return {Promise<boolean>}
     */
    static async materialized(root) {
        if (isString(root)) root = persistenceRoot().get(root);
        if (await is(root)) return true;
        await timeout(200);  // get rid of this workaround! gun sometimes sync to slow with other peers
        return await is(root);   // check again
    }

    connect() {
        return new Promise(async (resolve, reject) => {
            const handle$ = this.handle$;
            if (!handle$.listen) {
                const node = handle$.store;
                node.get(T).on((item, key) => this.modifiedEntry(item, key));
                node.map().on((item, key) => this.modifiedItem(item, key));
                handle$.listen = true;
                // this.connectQ = { resolve, reject };     // todo [DISCUSS]: behavior: should there be a timeout to reject the 'connect'
                await doAsync();
                // todo [OPEN]: fix the 'loose' listener problem with gun
                setTimeout(() => { node.once(() => {}); node.map().once(() => {}) }, 800);
                resolve();
            } else {
                resolve();
            }
        })
    }

    //
    //  reflection
    //

/*
    async prop(path, value) {
        if (!path) return this.proxy$;
        if (value != undefined) {
            const parts = elems(path);
            const setprop = parts.pop();
            const obj = await asyncWithPath(this.proxy$, parts.join('.'));
            if (!obj) return;
            obj[setprop] = value;
            return await obj[setprop];
        } else {
            return await asyncWithPath(this.proxy$, path);
        }
    }

    async probe() {
        return await probe(this.proxy$);
    }
*/
    isEnumerable(name) {
        let propertySpec = this.metaClass$.getAttribute(name) ?? { enumerable : false }; // if no property spec skip it in enumerations
        return !isTimestamp(name) || propertySpec.enumerable;
    } // add others when implemented

    //  methods returning AsyncIterators

    //
    //  metadata
    //

    get $thoregon() {
        return this;
    }

    get metaClass$() {
        return this.target?.metaClass ?? this.meta?.metaClass ?? ANY_METACLASS;
    }

    /*async*/ get soul() {
        const s = this.handle$?.store;
        return s ? soul(s) : undefined;
    }

    get val() {
        const s = this.handle$?.store;
        return s ? val(s) : undefined;
    }

    get hasStore() {
        return !!(this.handle$?.store);
    }

    get materialized() {
        const s = this.handle$?.store;
        return s ? ThoregonDecorator.materialized(s) : false;
    }

    get reserved() {
        return this._reserved;
    }

    async materialize() {
        return this.__materialize__();
    }

    static async __restore__(store, decrypt$, { instance, dothrow = true } = {}) {
        // restore entry
        // const where = await soul(store);
        const handle$ = { store };
        const eentry = await val(store.get(T));
        if (!eentry) {
            if (dothrow) throw ErrObjectNotFound();
            return { target: undefined, handle$ };
        }
        const sentry = JSON.parse(eentry.substr(2));
        const salt = sentry.s;
        // const pub = sentry.p;
        // handle$.pub = pub;
        handle$.salt = salt;
        const entry = await decrypt$(sentry);   // //@$CRYPT -> decrypt fn with the right credential!
        handle$.entry = entry;
        if (handle$.entry.x) return { target: undefined };
        const { Cls, repo } = originAsClass(entry.m.o);
        const target = instance ?? new Cls();
        let metaClass;
        // restore generic MetaClass if Cls not found
        if (!repo || !target.metaClass) {
            if (!this.meta) this.meta = {};
            metaClass = MetaClass.any();
            // if there is no key defined, attribute names can only be used as is but not be decrypted
            if (!entry.m?.k) metaClass.attributeMode = ATTRIBUTE_MODE.VARIABLE;
        }
        // restore all simple attributes
        const props = {};
        Object.entries(entry.e).forEach(([name, value]) => props[name] = deserialize(value));
        Object.assign(target, props);

        return { target, handle$, metaClass };
    }

    async __restore__() {
        const { target, handle$, metaClass } = await this.constructor.__restore__(this.handle$.store, this.decrypt$, { instance: this.target, dothrow: false });
        if (!target) return false;
        this.handle$ = handle$;
        this.meta = { metaClass };
        await this.connect();
        return true;
    }

    async __materialize__() {
        this._reserved = false;
        let done = false;
        // todo [OPEN]
        //  - run modifiers to adjust the entity
        //  - run filters to reject materialization
        if (!this.handle$ || !this.handle$.store) {
            // create a random root
            // todo [OPEN]: check if there exists something, loop random values fro free address
            let root = universe.random();
            this.handle$ = { store: persistenceRoot().get(root), entry: this.buildEntrySimple() };
            this.dolog("#==> materialize: new soul", root);
        } else {
            if (!this.handle$.entry) {
                this.handle$.entry = this.buildEntrySimple();
            }
            if (!this.handle$?.listen && await ThoregonDecorator.materialized(this.handle$.store)) {
                this.dolog("entity overwrite");
                // debugger;
                // throw ErrObjectOverwrite();
            } else {
                done = true;
            }
        }
        // distinguish between collections, objects and other special builtin objects like Maps, Sets, ...
        // streams and files are NOT iterables! they are stored with their origin and the current position if specified. they are therefore 'simple serializable' objects like Date
        this.dolog("#==> materialize: b4 storeObject");
        await this.__storeObject__();
        if (done) {
            this.dolog("#==> materialize: done -> send 'materialized'");
            this.emit('materialized', { entity: this.proxy$ });
            this.metaClass$?.emit('materialized', { entity: this.proxy$ });
        }
    }

    async __reserve__() {
        // $@RESERVE
        if (!await ThoregonDecorator.materialized(this.handle$.store)) {
            this._reserved = true;
            await this.connect();
            return;
        }

        await this.__restore__();
    }

    /*
     * Proxy handler implementation
     */

    has(target, key) {
        return this._collectOwnProperties().has(key);
    }

    ownKeys(target) {
        return [...this._collectOwnProperties()];
    }

    _collectOwnProperties() {
        let tprops = Reflect.ownKeys(this.target);
        const props = new Set(tprops.filter(key => !isPrivateProperty(key) && this.isEnumerable(key))); // filter private properties
        this.simpleProperties$$(props);
        this.namedProperties$$(props);
        this.variableProperties$$(props);
        this.filterDeletedProperties$$(props);
        return props;
    }

    propertyKey(prop) {
        // lookup name in properties map
        return this.$entry.m.r?.[prop]
    }

    simpleProperties$$(properties) {
        const entry = this.$entry;
        if (!entry) return;
        const names = Object.keys(entry.e);
        for (const name of names) {
            if (this.isEnumerable(name)) properties.add(name);
        }
    }

    namedProperties$$(properties) {
        const entry = this.$entry;
        if (!entry || !entry.m.r) return;
        const names = Object.keys(entry.m.r);
        for (const name of names) {
            if (this.isEnumerable(name)) properties.add(name);
        }
    }

    variableProperties$$(properties) {
        // todo [REFACTOR]:
        //  - introduce 'on' listeners for child properties
        //  - maintain a synced properties list
        //  - use this list to provide 'current' properties
        //  - offer an async iterator which will never be done e.g. to enable consumers to sync their state
        for (let prop of this.varprops.values()) {
            properties.add(prop);
        }
    }

    filterDeletedProperties$$(properties) {
        const entry = this.$entry;
        if (!entry || !entry.d) return;
        Object.keys(entry.d).forEach(deleted => properties.delete(deleted));
    }

    // todo [OPEN]:
    //  - async iterator which yields all 'changes'
    //  - never ends, is never done
    //  - at start it loops over all current existing properties with their key as 'added'
    //  - notifies deleted properties as { key, null }
    //  - if a property is added it notifies { key, obj }
    //  - does not notify changes inside child objects, listen on the object to get notifications about its changes
    //  - can be throttled to offer e.g 'infinite scolling'

    /**
     * the async iterator will iterate only over the current available propertiy names
     * @return {Promise<unknown>}
     */
    get propertyNames() {
        const that = this;
        let properties;
        let collectOwnProperties = () => this._collectOwnProperties().values();
        return ({
            // [Symbol.asyncIterator]()
            [Symbol.iterator]() {
                if (!properties) properties = collectOwnProperties();
                return properties
            }
        });
    }

    get $keys() {
        return [...this._collectOwnProperties().values()];
    }

    get length() {
        return this.$keys?.length ?? 0;
    }

    get is_empty() {
        return this.length === 0;
    }

    hasPendingSet(prop) {
        return this.pendingSet[prop] != undefined && !this.pendingSet[prop].is_empty
    }

    // check if there is an entry in the property mapping
    // check if there was nothing stored (!keep in sync)
    // retrieve the reference, if there was nothing remember,
    // get default if provided

    // references always returns a promise which needs to be resolved

    doGet(target, prop, receiver) {
        if (prop === 'then') return;
        // if the property is available return it. this is essential to invoke functions as usual!
        // !! Don't wrap with a Promise, also not with a resolved Promise - Promise.resolve(Reflect.get(target, prop))
        if (prop === 'is_empty') {
            // todo [REFACTOR]: if nedded add other 'functional' properties, extract to method
            return this._collectOwnProperties().size === 0;
        }
        if (prop === 'length') {
            // todo [REFACTOR]: if nedded add other 'functional' properties, extract to method
            return this._collectOwnProperties().size;
        }
        if (prop === 'soul') {
            // todo [REFACTOR]: if nedded add other 'functional' properties, extract to method
            return soul(this.handle$.store);
        }
        if (Reflect.has(target, prop)) {
            const value = Reflect.get(target, prop);
            if (value !== undefined) return value;
        }
        if (isPrivateProperty(prop)) {  // can not be persistent!
            const value = Reflect.get(target, prop);
            return value;
        }
        // $@PENDINGSET
        if (this.pendingSet[prop] != undefined) {     //
            // wait until the set has been done
            const { proxy, chain } = PromiseChain.with((resolve) => {
                this.pendingSet[prop].push(() => resolve(this.doGet(target, prop)));
            }, undefined, receiver);
            return proxy;
        }
        const { proxy, chain } = PromiseChain.with(async (resolve, reject) => {
            try {
                if (this._reserved) {
                    if (!await this.__restore__()) {
                        // not materialized, check default value
                        const defaultValue = this.metaClass$.getDefaultValue(prop);
                        resolve(defaultValue);
                        return;
                    }
                }

                // first check if this property was deleted
                if (this.isPropertyDeleted(prop)) {
                    await this.autoComplete(target, prop, receiver);
                    // resolve(undefined);
                } else if (Reflect.get(target, prop) == undefined && !this.hasStore) {
                    // if it is not materialized only use autocomplete to get a value
                    await this.autoComplete(target, prop, receiver);
                } else if (Reflect.get(target, prop) == undefined) {
                    let ref = this.propertyKey(prop);
                    const varAttrs = this.metaClass$.attributeMode;
                    if (!ref) {
                        if (varAttrs === ATTRIBUTE_MODE.VARENCRYPT) {
                            const meta = this.$entry.m;
                            if (!meta.k) {
                                this.logerr("$$ ThoregonDecorator: missing attribute key");
                            } else {
                                const skey = meta.k.k;
                                const salt = meta.k.s;
                                const iv   = meta.k.iv;
                                ref        = (await SEA.encrypt(prop, skey, { salt, iv })).ct;
                            }
                        } else {
                            ref = prop;
                        }
                    }
                    if (ref) {
                        const store = this.handle$.store.get(ref);
                        let obj;
                        if (await ThoregonDecorator.materialized(store)) {
                            // get the class!
                            obj = await ThoregonObject.from(store, { dothrow: false });
                            if (obj) {
                                /* $@SOUL */
                                const refsoul = await soul(store);
                                this.propsouls[prop] = refsoul;
                                /* $@SOUL */
                                Reflect.set(target, prop, obj);
                            } else {
                                Reflect.deleteProperty(target, prop);
                            }
                        } else {
                            // if missing, check autocompletion (no autocompletion for 'simple' objects, but default value is available)
                            await this.autoComplete(target, prop, receiver);
                        }
                    }
                }
                let res = Reflect.get(target, prop);
                if (res == undefined) {
                    // not set, check default value
                    res = this.metaClass$.getDefaultValue(prop);
                }
                resolve(res);
            } catch (e) {
                reject(e);
            }
        },undefined, receiver);
        return proxy;
    }

    async autoComplete(target, prop, receiver) {
        let value = await this.metaClass$.autoCompleteFor(target, prop);
        if (!value) return;
        await this.setProp(target, prop, value, receiver);
        value = Reflect.get(target, prop);
        return value;
    }

    set(target, prop, value, receiver) {
        Reflect.set(target, prop, value);
        this.setProp(target, prop, value, receiver);       // yes, this must run async.
        return true;
    }

    async setProp(target, prop, value, receiver) {
        let propertySpec = this.metaClass$.getAttribute(prop);
        if (!propertySpec) return; // this attribute can not be persistent and is therefore also rejected

        if (isNil(value)) {   // value undefined of null deletes the property
            return await this.deleteProperty(target, prop, receiver);
        }

        if (isPromise(value)) value = await value;  // resolve all promises

        if (isPrivateProperty(prop) || !propertySpec.persistent) {
            // this attribute is not persistent but can exist local (transient)
            value = this.beforeSet(target, prop, value, receiver) ?? value;
            Reflect.set(target, prop, value);
            this.afterSet(target, prop, value);
            await this.processPendingSetQ(prop);
            if (shouldEmit(prop)) {
                this.emit('change', { property: prop, obj: this.proxy$, type: 'set' });
                this.metaClass$?.emitEntityEvents(receiver);
            }
            return;
        }
        // todo [OPEN]
        //  - run detectors to emit events (after set) -> implement (also) on AccessObserver
        //  - do verifications based on the propertySpec

        // todo [OPEN]
        //  - since the 'real' value is set async, keep a pending set to 'await' the next get of the same property
        //  - introduce in 'get' a pending request queue

        // $@PENDINGSET pending local 'set property'
        if (this.pendingSet[prop] != undefined) {
            // there is a 'set' pending. wait for it an repeat the 'set'
            this.pendingSet[prop].push(() => this.set(target, prop, value, receiver));
        } else {
            this.pendingSet[prop] = [];     // establish a queue
        }
        try {
            if (this._reserved) {
                if (!await this.__restore__()) {
                    await this.__materialize__();
                }
            }

            this.__maintainTimestamps__();

            if (!this.hasStore) {
                // if it was now materialized just set the property. it may be materialized later.
                value = this.beforeSet(target, prop, value, receiver) ?? value;
                Reflect.set(target, prop, value);
                this.afterSet(target, prop, value);
                await this.processPendingSetQ(prop);
                if (shouldEmit(prop)) {
                    this.emit('change', { property: prop, obj: this.proxy$, type: 'set' });
                    this.metaClass$?.emitEntityEvents(receiver);
                }
            } else {
                const entry = this.handle$.entry;

                // remove the mark if this property was deleted
                const propertyWasDeleted = this.removeDelete(prop);

                // const oldValue = Reflect.get(target, prop);       // check if the stored value needs to be loaded first!
                // todo [OPEN]: $@KIND check what kind of value was there before! remove either the simple property of the reference if different
                value = this.beforeSet(target, prop, value, receiver) ?? value;
                if (simpleSerialize(value) || propertySpec.embedded) {
                    if (entry.m && entry.m.r && prop in entry.m.r) {
                        // $@KIND todo: drop reference entry
                    }
                    // just modify the property in the entry and storeit again
                    Reflect.set(target, prop, value);
                    entry.e[prop] = serialize(value);
                    await this.__storeObjectEntry0__(entry);
                    this.afterSet(target, prop, value);

                    await this.processPendingSetQ(prop);

                    if (shouldEmit(prop)) {
                        this.emit('change', { property: prop, obj: this.proxy$, type: 'set' });
                        this.metaClass$?.emitEntityEvents(receiver);
                    }
                } else if (!propertySpec.embedded && canReference(value) && !simpleSerialize(value)) {
                    const varAttrs = this.metaClass$.attributeMode;
                    if (prop in entry.e) {
                        // $@KIND
                        delete entry.e[prop];
                        if (varAttrs !== ATTRIBUTE_MODE.NAMED) {    // don't store the entry multiple times
                            await this.__storeObjectEntry0__(entry);
                        }
                    }
                    if (varAttrs === ATTRIBUTE_MODE.NAMED) {
                        const propertiesmap = entry.m.r;
                        if (!propertiesmap[prop]) {
                            propertiesmap[prop] = universe.random(9);
                            await this.__storeObjectEntry0__(entry);
                        }
                    } else {
                        this.varprops.add(prop);
                        if (propertyWasDeleted) {
                            // in this case the entity must be stored again! otherwise other listeners or after restart the property will still be deleted
                            await this.__storeObjectEntry0__(entry);
                        }
                    }
                    // __storeReference__ does also set the property with the decorated value
                    await this.__storeReference__(prop, value, entry.m);
                }
            }
        } catch (e) {
            this.logerr('GUN', e);
        }

        return true;
    }

    async processPendingSetQ(prop) {
        const q = this.pendingSet[prop];
        delete this.pendingSet[prop];
        if (!q || q.length < 1) return;
        for await (let fn of q) {
            try {
                await fn();
            } catch (e) {
                this.logerr("Error processing 'set' queue", e);
            }
        }
    }

    async reservePropertyStore(name, Cls) {
        const varAttrs = this.metaClass$.attributeMode;
        const entry    = this.handle$.entry;
        if (varAttrs === ATTRIBUTE_MODE.NAMED) {
            const propertiesmap = entry.m.r;
            if (!propertiesmap[prop]) {
                const key = universe.random(9);
                propertiesmap[prop] = key;
                await this.__storeObjectEntry0__(entry);
                const store = this.handle$.store.get(key);
                const reserved = await Cls.reserve(store);
                Reflect.set(this.target, name, reserved);
                return reserved;
            }
        } else if (varAttrs === ATTRIBUTE_MODE.VARENCRYPT) {
            this.varprops.add(name);
            const meta = entry.m;
            if (!meta.k) {
                this.logerr("$$ ThoregonDecorator: missing attribute key");
            } else {
                const skey = meta.k.k;
                const salt = meta.k.s;
                const iv = meta.k.iv;
                const encrypted = await SEA.encrypt(name, skey, { salt, iv });
                const key = encrypted.ct;
                const store = this.handle$.store.get(key);
                const reserved = await Cls.reserve(store);
                Reflect.set(this.target, name, reserved);
                return reserved;
            }
        }
        throw ErrCantReserveProperty(name);
    }

    isPropertyDeleted(prop) {
        const entry    = this.handle$?.entry;
        return entry?.d?.[prop];
    }

    removeDelete(prop) {
        const deleted    = this.handle$?.entry?.d;
        if (!deleted) return false;
        const exists = Reflect.has(deleted, prop);
        delete deleted[prop];
        return exists;
    }

    // check property in 'set' an 'get' also
    async deleteProperty(target, prop, receiver) {
        let modified = false;
        let propertySpec = this.metaClass$.getAttribute(prop);
        if (!propertySpec) return; // this attribute can not be persistent and therefore is also rejected

        if (isPrivateProperty(prop) || !propertySpec.persistent) {
            // this attribute is not persistent but can exist local (transient)
            this.beforeSet(target, prop, undefined, receiver);
            Reflect.deleteProperty(target, prop);
            this.afterSet(target, prop, undefined);
            await this.processPendingSetQ(prop);
            if (shouldEmit(prop)) {
                this.emit('change', { property: prop, obj: this.proxy$, type: 'del' });
                this.metaClass$?.emitEntityEvents(receiver);
            }
            return;
        }
        // todo [OPEN]
        //  - run detectors to emit events (after set)
        //  - do verifications based on the propertySpec

        this.__maintainTimestamps__(true);

        // $@PENDINGSET pending local 'set property'
        if (this.pendingSet[prop] != undefined) {
            // there is a 'set' pending. wait for it an repeat the 'set'
            this.pendingSet[prop].push(() => this.deleteProperty(target, prop, receiver));
        } else {
            this.pendingSet[prop] = [];     // establish a queue
        }
        try {
            if (this._reserved) {
                if (!await this.__restore__()) {
                    await this.__materialize__();
                }
            }
            // delete the property also on the target
            Reflect.deleteProperty(target, prop);

            // check what kind of property (simple, named ref, variable) the property is and remove it proper
            const entry = this.handle$.entry;
            if (prop in entry.e) {  // simple property, just remove it
                if (!isTimestamp(prop)) delete entry.e[prop];
                await this.__storeObjectEntry0__(entry);
                modified = true;
            } else {
                await this.__deleteProperty__(prop);
                modified = true;
            }

            await this.processPendingSetQ(prop);

            // emit event
            if (modified && shouldEmit(prop)) {
                this.emit('change', { property: prop, obj: this.proxy$, type: 'del' });
                this.metaClass$?.emitEntityEvents(this.proxy$);
            }
        } catch (e) {
            this.logerr('GUN', e);
        }

        return true;

    }

    async __deleteProperty__(prop) {
        const entry = this.handle$.entry;
        if (!entry.d) entry.d = {};
        entry.d[prop] = true;
        delete this.propsouls?.[prop]     // delete the soul reference of the property
        this.varprops?.delete(prop);
        const key = entry.m?.r?.[prop];
        if (key) delete entry.m.r[prop];
        await this.__storeObjectEntry0__(entry);
        // don't delete the object the property points to
        await this.__deleteReference__(prop, entry.m, key);
    }

    // todo [REFACTOR]: reimplement to 'deleteEntity'
    async __deleteReference__(name, meta, key) {
        await asynccallback(async (resolve, reject) => {
            try {
                key = key ?? meta.r?.[name];
                let propertySpec = this.metaClass$.getAttribute(name);
                if (!propertySpec) return; // this attribute can not be persistent and therefore is also rejected
                const varAttrs = this.metaClass$.attributeMode;
                if (!key && varAttrs !== ATTRIBUTE_MODE.NAMED) {     // check if entry has variable attributes
                    if (varAttrs === ATTRIBUTE_MODE.VARIABLE) {
                        key = name;
                    } else if (varAttrs === ATTRIBUTE_MODE.VARENCRYPT)  {
                        if (!meta.k) {
                            this.logerr("$$ ThoregonDecorator: missing attribute key");
                        } else {
                            const skey = meta.k.k;
                            const salt = meta.k.s;
                            const iv = meta.k.iv;
                            const encrypted = await SEA.encrypt(name, skey, { salt, iv });
                            key = encrypted.ct;
                        }
                    }
                }
                if (!key) {
                    debugger;
                    return;
                }

                const handle$ = this.handle$;
                const node = handle$.store.get(key);
                // firewall needs to recheck with the objects 'entry.d' (or if not a simple attr create a 'deleted' reference in the property (similar to the object entry))
                // this.dolog("#==> deleteReference", node, name, meta);
                const entry = { x: true };
                const salt    = handle$.salt ?? universe.random();
                const sentry  = await this.encrypt$({ v: PERSISTER_VERSION, s: salt, c: entry });
                const eentry  = T + JSON.stringify(sentry);
                const enode   = node;
                // this.dolog("#==> deleteReference -> storeRefEntry", node, entry);
                enode.put(eentry, (ack) => {
                    if (ack.err) {
                        this.logerr("GUN", ack.err, eentry);
                        reject(ack.err);
                    } else {
                        enode.off();
                        node.map().off();
                        resolve();
                    }
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    async drop() {
        await this.__deleteEntity__();
    }

    // todo [REFACTOR]: reimplement to 'deleteEntity'
    async __deleteEntity__() {
        await asynccallback(async (resolve, reject) => {
            try {
                const entry = handle$.entry;
                entry.x = true;
                const salt    = handle$.salt ?? universe.random();
                const sentry  = await this.encrypt$({ v: PERSISTER_VERSION, s: salt, c: entry });
                const eentry  = T + JSON.stringify(sentry);
                const node    = handle$.store;
                const enode   = node.get(T);
                // this.dolog("#==> deleteEntity -> storeRefEntry", node, entry);
                enode.put(eentry, (ack) => {
                    if (ack.err) {
                        this.logerr("GUN", ack.err, eentry);
                        reject(ack.err);
                    } else {
                        enode.off();
                        node.map().off();
                        resolve();
                    }
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    //
    //
    //
    __prepareMeta__() {
        if (this.meta.metaClass) return ;
        // create a default metaclass for the target
        // todo: if the class was missing and an Object was rebuilt, use another generic metaclass
        this.meta.metaClass = this.target.metaClass ?? ANY_METACLASS;
    }

    /*
     * thoregon
     */

    get $ref() {
        return this.handle$.store;
    }

    get $entry() {
        return this.handle$?.entry;
    }


    __maintainTimestamps__(withdelete = false) {
        // will store it anyways for every entity.
        // entities with 'suppressTimestamps' just can't get the values
        // if (!this.metaClass$.useTimestamps) return;
        const target = this.target;
        if (!target) return;
        const entry = this.handle$.entry;
        const now = universe.now;
        if (!target.created) {
            target.created = now;
            entry.e.created = serialize(now);
        }
        if (withdelete) {
            // target.deleted = now;
            entry.e.deleted = serialize(now);
        } else {
            target.modified = now;
            entry.e.modified = serialize(now);
        }
    }

    /*
        format of an entry (JSON stringified)
        e: t͛{ v, p, s, c, g, x }
            v ... persister version
            p ... pubkey for verify -> check with known keys
            s ... signature
            c ... ciphertext (encrypted entry), contains: metadata, propertiesmapping for references, serialized properties with primitives + dates
            g ... grants & permissions
            x ... if it contains any value this entity is deleted

           cipertext: encrypted with the permissions (user or role) sym encryption key
           { m: { o, m }, e }
                 m ... metadata
                    o ... origin, <kind>:<reference_or_name>
                    r ... reference property map (properties with referenced entities)
                 e ... entity, serialized properties

            grants & permissions: encrypted permission (with a secret granter-grantee)
                - owner does not neet an entry in grants

        p: ... properties with random keys
     */
    async __storeObject__() {
        // dissociate 'primitive' values from references to objects
        // todo:
        //  - remove transient properties
        //  - use property settings from meta class
        //  - resolve Promises

        // maintain timestamps
        this.__maintainTimestamps__();

        // split simple values and references
        let { props, refs, nils } = await this.__dissociate__();      // use nils only for already persistent objects

        // create 'untrackable' properties for references
        const propertiesmap = {};
        Object.keys(refs).forEach(name => propertiesmap[name] = universe.random(9));

        const meta = await this.__storeObjectEntry1__(props, propertiesmap);

        // now store all properties with references
        // each references object will be wrapped with a thoregondecorator, check it the object is already deocrated
        // the decorator will use the 'root' from this and the random propertyname as its root
        // some references treated different
        for await (const name of Object.keys(refs)) {
            const obj = refs[name];
            await this.__storeReference__(name, obj, meta);
        }
    }

    async __storeObjectEntry1__(props, propertiesmap) {
        // build the entry with
        const meta = { o: classOrigin(this.target) };
        const varAttrs = this.metaClass$.attributeMode;
        if (varAttrs === ATTRIBUTE_MODE.NAMED) {
            meta.r = propertiesmap;
        } else if (varAttrs === ATTRIBUTE_MODE.VARENCRYPT) {
            // key, salt, iv
            const k = universe.random();
            const s = universe.random(9);
            const iv = SEA.ivString(SEA.random(15), { encode: 'base64' });
            meta.k = { k , s , iv };
        }
        const entry = { e: { ...props }, m: meta };
        await this.__storeObjectEntry0__(entry);
        return meta;
    }

    buildEntrySimple() {
        let { props, refs, nils } = this.__dissociatesimple__();      // use nils only for already persistent objects
        const meta = { o: classOrigin(this.target) };
        const entry = { e: { ...props }, m: meta };
        return entry;
    }

    /*async*/ __storeObjectEntry0__(entry) {
        return new Promise(async (resolve, reject) => {
            try {
                const handle$ = this.handle$;
                const salt    = handle$.salt ?? universe.random();
                // handle$.pub   = pub;
                if (!handle$.salt) handle$.salt = salt;
                handle$.entry = entry;
                const sentry  = await this.encrypt$({ v: PERSISTER_VERSION, s: salt, c: entry });
                const eentry  = T + JSON.stringify(sentry);
                const node    = handle$.store;
                const enode   = node.get(T);
                // this.dolog("#==> storeObjectEntry0", node, entry);
                enode.put(eentry, (ack) => {
                    if (ack.err) {
                        this.logerr("GUN", ack.err, eentry);
                        reject(ack.err);
                    } else {
                        if (!handle$.listen) {
                            enode.on((item, key) => this.modifiedEntry(item, key));       // this is the objects entry
                            node.map().on((item, key) => this.emit(item, key));   // those are the properties with references
                            handle$.listen = true;
                        }
                        resolve();
                    }
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    async modifiedEntry(item, key) {
        this.dolog("modifiedEntry", "start", item);
        const handle$ = this.handle$;
        const sentry      = JSON.parse(item.substr(2));
        const entry       = await this.decrypt$(sentry);
        // the entry got modified
        if (entry) {
            // todo [OPEN]: $@KIND check what kind of value was there before! remove either the simple property of the reference if different
            if (JSON.stringify(entry) === JSON.stringify(handle$.entry)) return; // quick check if something has been modified
            // this happens only when the property was synced (from another node)!
            const oldprops    = handle$.entry?.e ?? {};     // if it was reserved there will not be an entry
            const simpleprops = entry.e;
            handle$.entry     = entry;
            if (this._reserved) {
                // this is for objects which have a distinguished soul and now become materialized from another peer
                this._reserved = false;
                this.emit('materialized', { entity: this.proxy$ });
                this.metaClass$?.emit('materialized', { entity: this.proxy$ });
            }
            this.dolog("modifiedEntry", "item", item);
            Object.entries(simpleprops).forEach(([prop, newValue]) => {
                // if (this.pendingSet[prop] != undefined ) return;
                newValue = deserialize(newValue);
                const oldValue = oldprops[prop];
                // $@PENDINGSET
                if (newValue !== oldValue) {
                    // set the new value in the thoregon object
                    if (newValue == undefined) {
                        Reflect.deleteProperty(this.target, prop);
                        if (shouldEmit(prop)) {
                            this.emit('change', { property: prop, obj: this.proxy$, type: 'del' });
                            this.metaClass$?.emitEntityEvents(this.proxy$);
                        }
                    } else {
                        Reflect.set(this.target, prop, newValue);
                        if (shouldEmit(prop)) {
                            this.emit('change', { property: prop, obj: this.proxy$, type: 'set' });
                            this.metaClass$?.emitEntityEvents(this.proxy$);
                        }
                    }
                }
            })
        }
    }

    async modifiedItem(item, key) {
        //@$MOD: check pending local 'set propery'
        const handle$ = this.handle$;
        if (key !== T) {
            this.dolog("modifiedItem", "start", key, item);
            const itemsoul = await nodeSoul(item);
            // if referenced object was not available add it as attribute
            // newvalue === undefined -> delete property
            const attrmode = this.metaClass$.attributeMode;
            let prop;
            if (attrmode === ATTRIBUTE_MODE.NAMED) {
                // a named property was modified
                const entry = handle$.entry;
                const map = Object.entries(entry.m.r).find(([name, ref]) => ref === key);
                // CAUTION: there may be a timing issue. the change of the 'entry' must be prior to this
                if (map) {
                    prop = map[0];
                }
            } else {
                prop = key;
                // a variable property was modified
                if (attrmode === ATTRIBUTE_MODE.VARENCRYPT) {
                    const meta = this.$entry.m.k;
                    const skey  = meta.k;
                    const salt = meta.s;
                    const iv   = meta.iv;
                    prop       = await SEA.decrypt({ ct: key, iv, s: salt }, skey);
                }
            }
            // $@PENDINGSET
            if (prop) {
                if ((handle$.entry?.d?.[prop])) {
                    this.varprops.delete(prop);
                    delete this.propsouls[prop];
                    if (shouldEmit(prop)) {
                        this.emit('change', { property: prop, obj: this.proxy$, type: 'del' });
                        this.metaClass$?.emitEntityEvents(this.proxy$);
                    }
                } else {
                    // todo [OPEN]: $@KIND check what kind of value was there before! remove either the simple property of the reference if different
                    // check 'item' is undefined -> remove variable attribute
                    if (attrmode !== ATTRIBUTE_MODE.NAMED && !this.varprops[prop]) {
                        this.varprops.add(prop);
                        // this.dolog("modifiedItem", "variable prop added", prop, item);
                        // notify changed variable attribute -> endless iterator
                        // this.emit('change', { property: prop, obj: this.proxy$, type: 'mod' });
                    }
                    /* $@SOUL */
                    if (!this.propsouls[prop] || this.propsouls[prop] !== itemsoul) {
                        this.propsouls[prop] = itemsoul;
                        this.dolog("modifiedItem", "item added", prop, item);
                        if (shouldEmit(prop)) {
                            this.emit('change', { property: prop, obj: this.proxy$, type: 'set' });
                            this.metaClass$?.emitEntityEvents(this.proxy$);
                        }
                    }
                }
            } else {
                // else: check what to do. this is a named property w/o mapping
                this.logerr("modifiedItem", "unknown", key, item);
            }
        }

        // if this entity was just restored, resume the consumer
        if (this.connectQ) {
            const { resolve } = this.connectQ;
            delete this.connectQ;
            (async () => {
                await doAsync();
                this.dolog("modifiedItem", "connectQ");
                resolve();
            })()
        }
    }

    // todo: if (transaction) await add to transaction
    async __storeReference__(name, obj, meta) {
        let modified = true;
        let key = meta.r?.[name];
        let propertySpec = this.metaClass$.getAttribute(name);
        if (!propertySpec) return; // this attribute can not be persistent and therefore is also rejected
        const varAttrs = this.metaClass$.attributeMode;
        if (!key && varAttrs !== ATTRIBUTE_MODE.NAMED) {     // check if entry has variable attributes
            if (varAttrs === ATTRIBUTE_MODE.VARIABLE) {
                key = name;
            } else if (varAttrs === ATTRIBUTE_MODE.VARENCRYPT)  {
                if (!meta.k) {
                    this.logerr("$$ ThoregonDecorator: missing attribute key");
                } else {
                    const skey = meta.k.k;
                    const salt = meta.k.s;
                    const iv = meta.k.iv;
                    const encrypted = await SEA.encrypt(name, skey, { salt, iv });
                    key = encrypted.ct;
                }
            }
        }
        // check if it is already thoregon entry
        // create a thoregon entry and reference it
        if (!obj.$thoregon) {
            const metaclass = this.metaClass$;
            const refstore = this.handle$.store.get(key);
            if (!obj.$thoregonEntity) {
                // not a thoregon entity, persist it anyways
                obj = ThoregonDecorator.observe(obj, { /*store,*/ encrypt: this.encrypt$, decrypt: this.decrypt$ });
                await obj.__materialize__();
            } else {
                obj = await obj.materialize({}, { /*store,*/ encrypt: this.encrypt$, decrypt: this.decrypt$ });
            }

            const ref =  obj.$ref;
            refstore.put(ref);

            /* $@SOUL */

            // await doAsync();
            const refsoul = await obj.soul; // soul(store);
            if (refsoul) {
                if (this.propsouls[name] !== refsoul) {
                    this.propsouls[name] = refsoul;
                } else {
                    modified = false;
                }
            }
            /* $@SOUL */
        } else {
            // this is an already persistent thoregon entity.
            // just get the objects node and store it
            const node = this.handle$.store.get(key);
            if (!obj.handle$?.store) {
/*
                // thoregon entity but not persistent
                const store = this.handle$.store.get(key);
                // use the property node as store
                obj.__at__(store);
*/
                await obj.__materialize__();
            }
            const ref = obj.$ref;
            // now create a reference to the object
            node.put(ref);
            /* $@SOUL */
            const refsoul = await obj.soul; // soul(ref);
            if (refsoul) {
                if (this.propsouls[name] !== refsoul) {
                    this.propsouls[name] = refsoul;
                } else {
                    modified = false;
                }
            }
            /* $@SOUL */
        }
        Reflect.set(this.target, name, obj); // replace the object in the property with the wrapper (proxy)

        this.afterSet(this.target, name, obj);

        await this.processPendingSetQ(name);

        if (modified && shouldEmit(prop)) {
            this.emit('change', { property: prop, obj: this.proxy$, type: 'set' });
            this.metaClass$?.emitEntityEvents(this.proxy$);
        }
    }

    __dissociatesimple__() {
        const props = {};
        for (let [prop, value] of Object.entries(this.target)) {
            let propertySpec = this.metaClass$.getAttribute(prop);
            if (propertySpec && propertySpec.persistent) {  // this attribute can be persistent
                if (simpleSerialize(value) || propertySpec.embedded) {
                    // just serialize it if necessary
                    props[prop] = serialize(value);
                }
            }
        }
        return props;
    }

    async __dissociate__() {
        const props = {};
        const refs  = {};
        const nils  = [];

        const metaClass = this.metaClass$;

        if (metaClass.attributeMode === ATTRIBUTE_MODE.NAMED && !metaClass.hasAttributes()) {
            this.logerr("Can't store object. no attributes im metaclass defined", this.metaClass$);
            return;
        }

        //@$ATTR -> also store simple serializable items as reference
        for await (let [prop, value] of Object.entries(this.target)) {
            let propertySpec = this.metaClass$.getAttribute(prop);
            if (propertySpec && propertySpec.persistent) {  // this attribute can be persistent
                if (isPromise(value)) value = await value;
                if (isNil(value)) {
                    // if there was a value/entry stored before it must be marked as deleted
                    nils.push(prop);
                } else if (simpleSerialize(value) || propertySpec.embedded) {
                    // just serialize it if necessary
                    props[prop] = serialize(value);
                } else if (!propertySpec.embedded && canReference(value) && !simpleSerialize(value)) {
                    // collect all object references
                    refs[prop] = value;
                }
            }
        }

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

thoregondecoratormethods = getAllMethodNames(ThoregonDecorator.prototype);

if (!Object.prototype.$thoregon) Object.defineProperties(Object.prototype, {
    '$thoregon'  : { configurable: false, enumerable: false, writable: false, value: undefined },
    '$collection': { configurable: false, enumerable: false, writable: false, value: undefined },
});

if (globalThis.universe) universe.$ThoregonDecorator = ThoregonDecorator;
