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
 * todo [OPEN]
 *  - introduce a lifecycle state machine for each persistent object (reserved, materialized, deleted)
 *  - introduce a modification state machine for each persistent object (before, while, done)
 *  - $@KIND check if property kind (simple of reference) has changed
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

import AccessObserver from "/evolux.universe/lib/accessobserver.mjs";
import ThoregonObject from "./thoregonobject.mjs";
import Reporter       from "/evolux.supervise/lib/reporter.mjs";
import SEA            from "/evolux.everblack/lib/crypto/sea.mjs";

import {
    serialize,
    simpleSerialize,
    canReference,
    deserialize,
    isPromise,
    classOrigin,
    originAsClass,
} from "./serialize.mjs";
import { isNil, isString }  from "/evolux.util/lib/objutils.mjs";
import { timeout, doAsync } from "/evolux.universe";

import MetaClass, { ATTRIBUTE_MODE } from "./metaclass/metaclass.mjs";

import { ErrCantReserveProperty, ErrObjectNotFound, ErrObjectOverwrite } from "./errors.mjs";

// import Node             from "./graph/node.mjs";

const T     = universe.T;
const PXAES = 'TS';      // thoregon symetric AES encrypted

const PERSISTER_VERSION = '21_1';

const ANY_METACLASS = MetaClass.any();

const EMPTY_ITERATOR = {
    [Symbol.asyncIterator]() {
        return { async next() { return { done: true } } }
    }
};
const isDev = () => { try { return thoregon.isDev } catch (ignore) { return false } };

let persistenceRoot = universe.gun;     // Node.root() for testing

/** native gun access ***********************************************************************************/

function is(gunnode) {
    return new Promise(resolve => {
        gunnode
            .once(() => resolve(true))
            .not(() => resolve(false));
    });
}

function soul(gunnode) {
    return new Promise(resolve => {
        gunnode
            .once(item => resolve(universe.Gun.node.soul(item)))
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

/********************************************************************************************************/

export default class ThoregonDecorator extends Reporter(AccessObserver) {

    //
    // creation
    //

    // don't  wrap target with WeakRef, because no other referrence may exist

    constructor(target, parent, { handle$, store, metaClass, encrypt, decrypt, inmem = false}) {
        super(target, parent);
        this.meta          = { metaClass };
        this.encrypt$      = encrypt;
        this.decrypt$      = decrypt;
        this.inmem         = inmem;
        this.propsouls     = {};       // $@SOUL
        this.pendingSet    = {};
        this.varprops      = new Set();
        this._reserved     = false;    // $@RESERVE
        this.__x           = universe.random(5);
        if (handle$) {
            this.handle$ = handle$;
        } else if (store) {
            this.handle$ =  isString(store)
                            ? { store: persistenceRoot.get(store) }
                            : { store };
        }

        this.__prepareMeta__();
    }

    static observe(target, { handle$, store, metaClass, parent, encrypt, decrypt, inmem = false } = {}) {
        const proxy = super.observe(target, parent, { handle$, store, metaClass, encrypt, decrypt, inmem });
        if (globalThis.FinalizationRegistry) {
            // todo [REFACTOR]:
            //  - introduce a FinalizationRegistry on the proxy to invalidate this handler
        }
        return proxy;
    }

    static async from(root, { cls, metaClass, parent, encrypt, decrypt }) {
        let store;
        if (!isString(root)) {
            store = root;
        } else {
            store = persistenceRoot.get(root);
            if (! await is(store)) return;     // there is no object stored
        }
        try {
            const { target, handle$ } = await this.__restore__(store, decrypt);
            const proxy               = this.observe(target, { handle$, metaClass, parent, encrypt, decrypt });
            proxy.connect();
            return proxy;
        } catch (ignore) {
            this.logger.debug(ignore);
        }
    }

    /**
     * answers if there is a persistent object
     * does not check the target class
     * @param {String | Node} root
     * @return {Promise<boolean>}
     */
    static async materialized(root) {
        if (isString(root)) root = persistenceRoot.get(root);
        if (await is(root)) return true;
        await timeout(100);  // get rid of this workaround! gun sometimes sync to slow with other peers
        return await is(root);   // check again
    }

    connect() {
        const handle$ = this.handle$;
        if (!handle$.listen) {
            const node = handle$.store;
            node.get(T).on((item, key) => this.modifiedEntry(item, key));
            node.map().on((item, key) => this.modifiedItem(item, key));
            handle$.listen = true;
        }
    }

    //
    //  reflection
    //

    //  methods returning AsyncIterators

    //
    //  metadata
    //

    get $thoregon() {
        return this;
    }

    get metaClass$() {
        return this.meta?.metaClass ?? ANY_METACLASS;
    }

    get soul() {
        const s = this.handle$?.store;
        return s ? soul(s) : undefined;
    }

    get val() {
        const s = this.handle$?.store;
        return s ? val(s) : undefined;
    }

    get materialized() {
        const s = this.handle$?.store;
        return s ? is(s) : undefined;
    }

    get reserved() {
        return this._reserved;
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
        // console.log("restore entry found");
        const entry = await decrypt$(sentry.c, salt);   // //@$CRYPT -> decrypt fn with the right credential!
        handle$.entry = entry;
        // console.log("restore entry set");
        const Cls = originAsClass(entry.m.o);
        const target = instance ?? new Cls();
        // restore all simple attributes
        const props = {};
        Object.entries(entry.e).forEach(([name, value]) => props[name] = deserialize(value));
        Object.assign(target, props);

        return { target, handle$ };
    }

    async __restore__() {
        const { target, handle$ } = await this.constructor.__restore__(this.handle$.store, this.decrypt$, { instance: this.target, dothrow: false });
        if (!target) return false;
        this.handle$ = handle$;
        this.connect();
        return true;
    }

    async __materialize__() {
        if (!this.handle$) {
            // create a random root
            // todo [OPEN]: check if there exists something, loop random values fro free address
            let root = universe.random();
            this.handle$ = { store: persistenceRoot.get(root) };
        }
        if (await is(this.handle$.store)) throw ErrObjectOverwrite();
        // distinguish between collections, objects and other special builtin objects like Maps, Sets, ...
        // streams and files are NOT iterables! they are stored with their origin and the current position if specified. they are therefore 'simple serializable' objects like Date
        await this.__storeObject__();
    }

    async __reserve__() {
        // $@RESERVE
        if (!await is(this.handle$.store)) {
            this._reserved = true;
            this.connect();
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
        const props = new Set(tprops.filter(key => !key.startsWith('_') && !key.startsWith('$'))); // filter private properties
        this.simpleProperties$$(props);
        this.namedProperties$$(props);
        this.variableProperties$$(props);
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
            properties.add(name);
        }
    }

    namedProperties$$(properties) {
        const entry = this.$entry;
        if (!entry || !entry.m.r) return;
        const names = Object.keys(entry.m.r);
        for (const name of names) {
            properties.add(name);
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

    // check if there is an entry in the property mapping
    // check if there was nothing stored (!keep in sync)
    // retrieve the reference, if there was nothing remember,
    // get default if provided

    // references always returns a promise which needs to be resolved

    doGet(target, prop, receiver) {
        if (prop === 'then') return;
        // if the property is available return it. this is essential to invoke functions as usual!
        // !! Don't wrap with a Promise, also not with a resolved Promise - Promise.resolve(Reflect.get(target, prop))
        if (Reflect.has(target, prop)) return Reflect.get(target, prop);
        // $@PENDINGSET
        if (this.pendingSet[prop] != undefined) {
            // wait until the set has been done
            return new Promise((resolve) => {
                // this.pendingSet[prop].push(() => resolve(Reflect.get(target, prop)));
                this.pendingSet[prop].push(() => resolve(this.doGet(target, prop)));
            })
        }
        return new Promise(async (resolve, reject) => {
            try {
                if (this._reserved) {
                    if (!await this.__restore__()) {
                        resolve();
                        return;
                    }
                }
                if (!Reflect.has(target, prop)) {
                    let ref = this.propertyKey(prop);
                    const varAttrs = this.metaClass$.attributeMode;
                    if (!ref) {
                        if (varAttrs === ATTRIBUTE_MODE.VARENCRYPT) {
                            const meta = this.$entry.m;
                            const skey = meta.k.k;
                            const salt = meta.k.s;
                            const iv   = meta.k.iv;
                            ref        = (await SEA.encrypt(prop, skey, { salt, iv })).ct;
                        } else {
                            ref = prop;
                        }
                    }
                    if (ref) {
                        const store = this.handle$.store.get(ref);
                        if (await is(store)) {
                            // get the class!
                            const obj = await ThoregonObject.from(store);
                            if (obj) {
                                /* $@SOUL */
                                const refsoul = await soul(store);
                                this.propsouls[prop] = refsoul;
                                /* $@SOUL */
                                Reflect.set(target, prop, obj);
                            }
                        }
                    }
                }
                const res = Reflect.get(target, prop);
                resolve(res);
            } catch (e) {
                reject(e);
            }
        });
    }

    set(target, prop, value, receiver) {
        let propertySpec = this.metaClass$.getAttribute(prop);
        if (!propertySpec || !propertySpec.persistent) return; // this attribute can not be persistent and therefore is also rejected
        // todo [OPEN] do verifications based on the propertySpec

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
        (async () => {
            try {
                if (this._reserved) {
                    if (!await this.__restore__()) {
                        await this.__materialize__();
                    }
                }
                const entry    = this.handle$.entry;
                // const oldValue = Reflect.get(target, prop);       // check if the stored value needs to be loaded first!
                // todo [OPEN]: $@KIND check what kind of value was there before! remove either the simple property of the reference if different
                value = this.beforeSet(target, prop, value, receiver) ?? value;
                if (isNil(value)) {
                    // todo
                } else if (simpleSerialize(value) || propertySpec.embedded) {
                    if (prop in entry.m.r) {
                        // $@KIND todo: drop reference entry
                    }
                    // just modify the property in the entry and storeit again
                    Reflect.set(target, prop, value);
                    entry.e[prop] = serialize(value);
                    await this.__storeObjectEntry0__(entry);
                    // console.log("** 1 > simple prop modified", '[' + prop + ']', value);
                    this.afterSet(target, prop, value);

                    await this.processPendingSetQ(prop);

                    this.emit('change', { prop, obj: this.proxy$ });
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
                    }
                    // __storeReference__ does also set the property with the decorated value
                    await this.__storeReference__(prop, value, entry.m);
                }
            } catch (e) {
                this.logger.error('GUN', e);
            }
        })();

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
                console.log("Error processing 'set' queue", e);
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
        throw ErrCantReserveProperty(name);
    }
/*

    deleteProperty(target, prop, receiver) {
        let propertySpec = this.metaClass$.getAttribute(prop);
        if (!propertySpec || !propertySpec.persistent) return; // this attribute can not be persistent and therefore is also rejected
        // todo [OPEN] do verifications based on the propertySpec

        // todo [OPEN]
        //  - since the 'real' value is set async, keep a pending set to 'await' the next get of the same property
        //  - introdcue in 'get' a pending request queue

        (async () => {
            const entry = this.handle$.entry;
            const oldValue = Reflect.get(target, prop);       // check if the stored value needs to be loaded first!
            this.beforeDelete(target, prop, value, receiver);

            // todo [OPEN]:
            //  - check what kind of value was there before: simple or refernce
            //  - remove simple property or reference
            this.afterDelete(target, prop, receiver);

            //@$MOD
            this.emit('change', { prop, obj: this.proxy$ });
        })();

        return true;
    }
*/

    //
    //
    //
    __prepareMeta__() {
        if (this.meta.metaClass) return ;
        // create a default metaclass for the target
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

    /*
        format of an entry (JSON stringified)
        e: t͛{ v, p, s, c }
            v ... persister version
            p ... pubkey for verify -> check with known keys
            s ... signature
            c ... ciphertext (encrypted entry), contains: metadata, propertiesmapping for references, serialized properties with primitives + dates

           cipertext: encrypted with the permissions (user or role) sym encryption key
           { m: { o, m }, e }
                 m ... metadata
                    o ... origin, <kind>:<reference_or_name>
                    r ... reference property map (properties with referenced entities)
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

        const meta = await this.__storeObjectEntry1__(props, propertiesmap);

        // now store all properties with references
        // each references object will be wrapped with a thoregondecorator, check it the object is already deocrated
        // the decorator will use the 'root' from this and the random propertyname as its root
        // some references treated different
        for await (const name of Object.keys(refs)) {
            const obj = refs[name];
            await this.__storeReference__(name, obj, meta);
        }
/*
        await Object.entries(refs).aForEach(async ([name, obj]) => {
            await this.__storeReference__(name, obj, meta);
        });
*/

        // console.log(this.handle$.store);
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

    /*async*/ __storeObjectEntry0__(entry) {
        return new Promise(async (resolve, reject) => {
            try {
                const handle$ = this.handle$;
                const salt    = handle$.salt ?? universe.random();
                if (!handle$.salt) handle$.salt = salt;
                handle$.entry = entry;
                const sentry  = { v: PERSISTER_VERSION, p: this.encrypt$.pub, s: salt, c: await this.encrypt$(entry, salt) };
                const eentry  = T + JSON.stringify(sentry);
                const node    = handle$.store;
                const enode   = node.get(T);
                enode.put(eentry, (ack) => {
                    if (ack.err) {
                        this.logger.error("GUN", ack.err);
                        reject(ack.err);
                    } else {
                        if (!handle$.listen) {
                            enode.on((item, key) => this.modifiedEntry(item, key));       // this is the objects entry
                            node.map().on((item, key) => this.modifiedItem(item, key));   // those are the properties with references
                            handle$.listen = true;
                        }
                        if (this._reserved) {
                            this._reserved = false;
                            (async () => {
                                // retard the 'materialized' event
                                await doAsync();
                                this.emit('materialized', { obj: this.proxy$ });
                            })();
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
        const handle$ = this.handle$;
        const sentry      = JSON.parse(item.substr(2));
        const entry       = await this.decrypt$(sentry.c, handle$.salt);
        // the entry got modified
        if (entry) {
            // todo [OPEN]: $@KIND check what kind of value was there before! remove either the simple property of the reference if different
            if (JSON.stringify(entry) === JSON.stringify(handle$.entry)) return; // quick check if something has been modified
            // this happens only when the property was synced (from another node)!
            const oldprops    = handle$.entry?.e ?? {};     // if it was reserved there will not be an entry
            const simpleprops = entry.e;
            handle$.entry     = entry;
            if (this._reserved) {
                this._reserved = false;
                this.emit('materialized', { obj: this.proxy$ });
            }
            Object.entries(simpleprops).forEach(([prop, newValue]) => {
                if (this.pendingSet[prop] != undefined) return;
                newValue = deserialize(newValue);
                const oldValue = oldprops[prop];
                // $@PENDINGSET
                if (newValue !== oldValue) {
                    // set the new value in the thoregon object
                    if (newValue == undefined) {
                        Reflect.deleteProperty(this.target, prop);
                        this.emit('change', { prop, obj: this.proxy$ });    // other event type?
                    } else {
                        Reflect.set(this.target, prop, newValue);
                        this.emit('change', { prop, obj: this.proxy$ });
                    }
                }
            })
        }
    }

    async modifiedItem(item, key) {
        //@$MOD: check pending local 'set propery'
        const handle$ = this.handle$;
        // console.log("**> modified ", '[' + key + ']', item);
        if (key === T) return;

        const itemsoul = await Gun.node.soul(item);
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
                // console.log("**> named prop modified", '[' + prop + ']', item);
            }
        } else {
            prop = key;
            // a variable property was modified
            if (attrmode == ATTRIBUTE_MODE.VARENCRYPT) {
                const meta = this.$entry.m.k;
                const skey  = meta.k;
                const salt = meta.s;
                const iv   = meta.iv;
                prop       = await SEA.decrypt({ ct: key, iv, s: salt }, skey);
            }
            // console.log("**> variable prop modified", '[' + prop + ']', item);
        }
        // $@PENDINGSET
        if (prop/* && this.pendingSet[prop] == undefined*/) {
            // todo [OPEN]: $@KIND check what kind of value was there before! remove either the simple property of the reference if different
            // check 'item' is undefined -> remove variable attribute
            if (attrmode !== ATTRIBUTE_MODE.NAMED) {
                this.varprops.add(prop);
                // notify changed variable attribute -> endless iterator
            }
            /* $@SOUL */
            if (!this.propsouls[prop] || this.propsouls[prop] !== itemsoul) {
                this.propsouls[prop] = itemsoul;
                this.emit('change', { prop, obj: this.proxy$ });
            }
        } // else: check what to do. this is a named property w/o mapping
    }

    // todo: if (transaction) await add to transaction
    async __storeReference__(name, obj, meta) {
        let modified = true;
        let key = meta.r?.[name];
        const varAttrs = this.metaClass$.attributeMode;
        if (!key && varAttrs !== ATTRIBUTE_MODE.NAMED) {     // check if entry has variable attributes
            if (varAttrs === ATTRIBUTE_MODE.VARABLE) {
                key = name;
            } else {
                const skey = meta.k.k;
                const salt = meta.k.s;
                const iv = meta.k.iv;
                const encrypted = await SEA.encrypt(name, skey, { salt, iv });
                key = encrypted.ct;
            }
        }
        // check if it is already thoregon entry
        // create a thoregon entry and reference it
        if (!obj.$thoregon) {
            const metaclass = this.metaClass$;
            const store = this.handle$.store.get(key);
            if (!obj.$thoregonEntity) {
                // not a thoregon entity, persist it anyways
                obj = ThoregonDecorator.observe(obj, { store, encrypt: this.encrypt$, decrypt: this.decrypt$, inmem: false });
                await obj.__materialize__();
            } else {
                obj = await obj.create({ store, encrypt: this.encrypt$, decrypt: this.decrypt$, inmem: false });
            }

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
            //console.log("**> 1 store reference", soul);
        } else {
            // this is an already persistent thoregon entity.
            // just get the objects node and store it
            const ref = obj.$ref;
            const node = this.handle$.store.get(key);
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
            // console.log("**> 2 store reference", soul);
        }
        Reflect.set(this.target, name, obj); // replace the object in the property with the wrapper (proxy)

        this.afterSet(this.target, name, obj);

        await this.processPendingSetQ(name);

        if (modified) this.emit('change', { prop: name, obj: this.proxy$ });
    }

    async __dissociate__() {
        const props = {};
        const refs  = {};
        const nils  = [];

        const metaClass = this.metaClass$;

        if (metaClass.attributeMode === ATTRIBUTE_MODE.NAMED && !metaClass.hasAttributes()) {
            this.logger.error("Can't store object. no attributes im metaclass defined", this.metaClass$);
            return;
        }

        //@$ATTR -> also store simple serializable items as reference
        await Object.entries(this.target).aForEach(async ([prop, value]) => {
            let propertySpec = this.metaClass$.getAttribute(prop);
            if (!propertySpec || !propertySpec.persistent) return; // this attribute can not be persistent

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

if (!Object.prototype.$thoregon) Object.defineProperties(Object.prototype, {
    '$thoregon'  : { configurable: false, enumerable: false, writable: false, value: undefined },
    '$collection': { configurable: false, enumerable: false, writable: false, value: undefined },
});
