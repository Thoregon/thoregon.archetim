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
import ThoregonObject from "./thoregonobject.mjs";
import Reporter       from "/evolux.supervise/lib/reporter.mjs";
import SEA            from "/evolux.everblack/lib/crypto/sea.mjs";
import { isNil }      from "/evolux.util/lib/objutils.mjs";
import {
    isSerialized,
    serialize,
    simpleSerialize,
    canReference,
    deserialize,
    isPromise,
    classOrigin,
    originAsClass,
} from "./serialize.mjs";

import MetaClass, { VARIABLE_ATTRIBUTE_MODE } from "./metaclass/metaclass.mjs";

import { ErrObjectNotFound } from "./errors.mjs";
import en                    from "../../thoregon.aurora/lib/formating/dayjs/locale/en.js";

const T     = universe.T;
const PXAES = 'TS';      // thoregon symetric AES encrypted

const PERSISTER_VERSION = '21_1';

const ANY_METACLASS = MetaClass.any();

const EMPTY_ITERATOR = {
    [Symbol.asyncIterator]() {
        return { async next() { return { done: true } } }
    }
};

export default class ThoregonDecorator extends Reporter(AccessObserver) {

    //
    // creation
    //

    // don't  wrap target with WeakRef, because no other referrence may exist

    constructor(target, parent, { handle$, store, metaClass, encrypt, decrypt, inmem, neglectmeta }) {
        super(target, parent);
        this.meta        = { metaClass };
        this.encrypt$    = encrypt;
        this.decrypt$    = decrypt;
        this.inmem       = inmem;
        this.neglectmeta = neglectmeta;
        if (handle$) {
            this.handle$ = handle$;
        } else if (store) this.handle$ = { where: '', store };

        this.__prepareMeta__();
    }

    static observe(target, { handle$, store, metaClass, parent, encrypt, decrypt, inmem = false, neglectmeta = false } = {}) {
        const proxy = super.observe(target, parent, { handle$, store, metaClass, encrypt, decrypt, inmem, neglectmeta });
        if (globalThis.FinalizationRegistry) {
            // todo [REFACTOR]:
            //  - introduce a FinalizationRegistry on the proxy to invalidate this handler
        }
        return proxy;
    }

    static async from(root, { cls, metaClass, parent, encrypt, decrypt }) {
        let store;
        if (await root.is) {
            store = root;
        } else {
            store =  universe.archetim.persitenceRoot[root];
            if (!await store.is) return;
        }
        try {
            const { target, handle$ } = await this.__restore__(store, decrypt);
            const proxy               = this.observe(target, { handle$, metaClass, parent, encrypt, decrypt });
            return proxy;
        } catch (ignore) {}
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

    get hasVariableAttributes$() {
        return this.metaClass$.variableAttributes !== VARIABLE_ATTRIBUTE_MODE.NONE;
    }

    /*
     * Proxy handler implementation
     */
/*

    has(target, key) {
        // todo
        return Reflect.has(target, key); // key in target;
    }

    ownKeys(target) {
        let props = Reflect.ownKeys(target);
        props = props.filter(key => !key.startsWith('_') && !key.startsWith('$')); // filter private properties
        return props;
    }
*/

    propertyKey(prop) {
        // lookup name in properties map
        return this.$entry.m.r?.[prop]
    }

    simpleProperties$$(properties) {
        const entry = this.$entry;
        if (!entry) return;
        const names = Object.keys(entry.e);
        for (const name in names) {
            properties.push(name);
        }
    }

    namedProperties$$(properties) {
        const entry = this.$entry;
        if (!entry || !entry.m.r) return;
        const names = Object.keys(entry.m.r);
        for (const name in names) {
            properties.push(name);
        }
    }

    variableProperties$$(properties) {
        return new Promise((resolve, reject) => {
            const entry = this.$entry;
            if (!entry) return;
            const varAttrs = this.metaClass$.variableAttributes;
            if (varAttrs === VARIABLE_ATTRIBUTE_MODE.NONE) return;
            const encrypted = (this.metaClass$.variableAttributes === VARIABLE_ATTRIBUTE_MODE.ENCRYPT);
            const key       = encrypted ? entry.m.k.k  : undefined;
            const salt      = encrypted ? entry.m.k.s  : undefined;
            const iv        = encrypted ? entry.m.k.iv : undefined;
            this.handle$.store.once(async (obj) => {
                await Object.keys(obj).aForEach(async (name) => {
                    if (name === T) return;
                    if (encrypted) name = SEA.decrypt(name, key, { salt, iv });
                    properties.push(name);
                });
                resolve();
            });
        })
    }

    get propertyNames() {
        return new Promise(async (resolve, reject) => {
            const entry = this.$entry;
            if (!entry) return EMPTY_ITERATOR;
            let i = 0;
            const properties = [];
            // todo [REFACTOR]: because 'variableProperties$$' adds the items async, the length check may not be sufficient to check the end!
            this.simpleProperties$$(properties);
            this.namedProperties$$(properties);
            await this.variableProperties$$(properties);
            resolve({
                [Symbol.asyncIterator]() {
                    return {
                        async next() {
                            if (i >= properties.length) return { done: true };
                            return { done: false, value: properties[i++] };
                        }
                    }
                }
            })
        });
    }

    // check if there is an entry in the property mapping
    // check if there was nothing stored (!keep in sync)
    // retrieve the reference, if there was nothing remember,
    // get default if provided

    // references always returns a promise which needs to be resolved

    doGet(target, prop, receiver) {
        // if (prop !== 'then') console.log("doGet 1", prop);
        if (prop === 'then') return;
        if (Reflect.has(this.target, prop)) return Reflect.get(this.target, prop);
        return new Promise(async (resolve, reject) => {
            try {
                // if (prop !== 'then') console.log("doGet 2", prop);
                // if (!this.$entry) await this.__restore__();
                // if (prop !== 'then') console.log("doGet 3", prop);
                if (!Reflect.has(this.target, prop)) {
                    let ref = this.propertyKey(prop);
                    const varAttrs = this.metaClass$.variableAttributes;
                    if (!ref) {
                        if (varAttrs === VARIABLE_ATTRIBUTE_MODE.ENCRYPT) {
                            const meta = this.$entry.m;
                            const skey = meta.k.k;
                            const salt = meta.k.s;
                            const iv   = meta.k.iv;
                            ref        = (await SEA.encrypt(name, skey, { salt, iv })).ct;
                        } else {
                            ref = prop;
                        }
                    }
                    if (ref) {
                        const store = this.handle$.store[ref];
                        if (await store.is) {
                            // get the class!
                            const obj = await ThoregonObject.from(store);
                            super.doSet(target, prop, obj, receiver);
                        }
                    }
                }
                // if (prop !== 'then') console.log("doGet 4", prop);
                const res = super.doGet(target, prop, receiver);
                // if (prop !== 'then') console.log("doGet 5", prop);
                resolve(res);
            } catch (e) {
                reject(e);
            }
        });
    }

    set(target, prop, value, receiver) {
        /* don't uncomment again! if the value is replaced with its wrapper, it must be set and also the change event must be sent!
                // check if the value is the same
                let curVal = this.target[prop];
                let newVal = value
                if (curVal === newVal) return;
                // if a proxy is compared, proxy === wrapped value isn't true. compare the raw values
                if (curVal.$access) curVal = curVal.$access.target;
                if (newVal.$access) newVal = newVal.$access.target;
                if (curVal === newVal) return;  // check again
        */
        let propertySpec = this.metaClass$.getAttribute(prop);
        if (!propertySpec || !propertySpec.persistent) return; // this attribute can not be persistent and therefore is also rejected

        (async () => {
            const entry = this.handle$.entry;
            const oldValue = super.doGet(target, prop, receiver);       // check if the stored value needs to be loaded first!
            value = this.beforeSet(target, prop, value, receiver) ?? value;
            if (isNil(value)) {
                // todo
            } else if (simpleSerialize(value) || propertySpec.embedded) {
                // just modify the property in the entry and storeit again
                super.doSet(target, prop, value, receiver);
                entry.e[prop] = serialize(value);
                await this.__storeObjectEntry0__(entry);
            } else if (!propertySpec.embedded && canReference(value) && !simpleSerialize(value)) {
                const varAttrs = this.metaClass$.variableAttributes;
                if (varAttrs === VARIABLE_ATTRIBUTE_MODE.NONE) {
                    const propertiesmap = entry.m.r;
                    if (!propertiesmap[prop]) {
                        propertiesmap[prop] = universe.random(9);
                        await this.__storeObjectEntry0__(entry);
                    }
                }
                // __storeReference__ does also set the property with the decorated value
                await this.__storeReference__(prop, value, entry.m);
            }
            this.afterSet(target, prop, value, receiver);

            this.emit('change', { prop, oldValue, newValue: value});
        })();

        return true;
    }

    deleteProperty() {

    }

    //
    //
    //
    __prepareMeta__() {
        if (this.meta.metaClass) return ;
        // create a default metaclass for the target
        this.meta.metaClass = this.target.metaClass ?? ANY_METACLASS;
    }

    // doSet()

    /*
     * thoregon
     */

    get $ref() {
        return this.handle$.store;
    }

    get $entry() {
        return this.handle$?.entry;
    }

    get __id__() {
        //  return 'soul' of the item
        return this.handle$.where || this.$ref.soul;
    }

    static async __restore__(store, decrypt$) {
        // restore entry
        const where = await store.soul;
        const handle$ = { where, store };
        const eentry = await store[T].val;
        // console.log("restore", handle$.store[T].$access.gunnode.location);
        if (!eentry) throw ErrObjectNotFound(where);
        const sentry = JSON.parse(eentry.substr(2));
        const salt = sentry.s;
        // console.log("restore entry found");
        const entry = await decrypt$(sentry.c, salt);   // //@$CRYPT -> decrypt fn with the right credential!
        handle$.entry = entry;
        // console.log("restore entry set");
        const Cls = originAsClass(entry.m.o);
        const target = new Cls();
        // restore all simple attributes
        const props = {};
        Object.entries(entry.e).forEach(([name, value]) => props[name] = deserialize(value));
        Object.assign(target, props);

        return { target, handle$ };
    }

    async __store__() {
        if (!this.handle$) {
            // create a random root
            let root = universe.random();
            this.handle$ = { where: root, store: universe.archetim.persitenceRoot[root] };
        }
        // distinguish between collections, objects and other special builtin objects like Maps, Sets, ...
        // streams and files are NOT iterables! they are stored with their origin and the current position if specified. they are therefore 'simple serializable' objects like Date
        await this.__storeObject__();
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
        await Object.entries(refs).aForEach(async ([name, obj]) => {
            await this.__storeReference__(name, obj, meta);
        });

        // console.log(this.handle$.store);
    }

    async __storeObjectEntry1__(props, propertiesmap) {
        // build the entry with
        const meta = { o: classOrigin(this.target) };
        const varAttrs = this.metaClass$.variableAttributes;
        if (varAttrs === VARIABLE_ATTRIBUTE_MODE.NONE) {
            meta.r = propertiesmap;
        } else if (varAttrs === VARIABLE_ATTRIBUTE_MODE.ENCRYPT) {
            // key, salt, iv
            const k = universe.random();
            const s = universe.random(9);
            const iv = [...SEA.random(15)];
            meta.k = { k , s , iv };
        }
        const entry = { e: { ...props }, m: meta };
        await this.__storeObjectEntry0__(entry);
        return meta;
    }

    async __storeObjectEntry0__(entry) {
        const handle$ = this.handle$;
        const salt = handle$.salt ?? universe.random();
        if (!handle$.salt) handle$.salt = salt;
        handle$.entry = entry;
        const sentry = { v: PERSISTER_VERSION, p: this.encrypt$.pub, s: salt, c: await this.encrypt$(entry, salt)};
        const eentry = T + JSON.stringify(sentry);
        handle$.store[T] = eentry;
    }

    // todo: if (transaction) await add to transaction
    async __storeReference__(name, obj, meta) {
        let key = meta.r?.[name];
        const varAttrs = this.metaClass$.variableAttributes;
        if (!key && varAttrs !== VARIABLE_ATTRIBUTE_MODE.NONE) {     // check if entry has variable attributes
            if (varAttrs === VARIABLE_ATTRIBUTE_MODE.ASIS) {
                key = name;
            } else {
                const skey = meta.k.k;
                const salt = meta.k.s;
                const iv = meta.k.iv;
                key = (await SEA.encrypt(name, skey, { salt, iv })).ct;
            }
        }
        // check if it is already thoregon entry
        // create a thoregon entry and reference it
        if (!obj.$thoregon) {
            const metaclass = this.metaClass$;
            if (!obj.$thoregonEntity) {
                // not a thoregon entity, persist it anyways
                obj = ThoregonDecorator.observe(obj, { store: this.handle$.store[key], encrypt: this.encrypt$, decrypt: this.decrypt$, inmem: false, neglectmeta: false });
                await obj.__store__();
            } else {
                obj = await obj.create({ store: this.handle$.store[key], encrypt: this.encrypt$, decrypt: this.decrypt$, inmem: false, neglectmeta: false });
            }
            super.doSet(this.target, name, obj, this); // replace the object in the property with the wrapper (proxy)
        } else {
            // this is an already persistent thoregon entity.
            // just get the objects node and store it
            const ref = obj.$ref;
            // now create a reference to the object
            this.handle$.store[key] = ref;
        }
    }

    async __dissociate__() {
        const props = {};
        const refs  = {};
        const nils  = [];

        const metaClass = this.metaClass$;

        if (metaClass.variableAttributes === VARIABLE_ATTRIBUTE_MODE.NONE && !metaClass.hasAttributes()) {
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
