/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import ThoregonDecorator          from "./thoregondecorator.mjs";

const checkInQ = [];

function ensureglobal() {
    if (!globalThis.universe) return;
    if (!universe.ThoregonObject)    universe.$ThoregonObject    = ThoregonObject;
    if (!universe.ThoregonDecorator) universe.$ThoregonDecorator = ThoregonDecorator
}

const ThoregonEntity = (base) => class ThoregonEntity extends (base || Object) {

/* todo [OPEN]: must be instantiated with Cls.create() not with new Cls()
    constructor(...args) {
        if (!new.target) {
            throw new TypeError('calling Foo constructor without new is invalid');
        }
        super(...args);
    }
*/


    //
    // Instantiation
    //

    /**
     * materialize - create a persistent object
     * the object is immediately persistent
     * gets a random soul if soul is omitted
     *
     * optionally, a soul can be provided
     *
     * @param props
     * @param soul     ... the soul how the object can be found
     * @param inmem
     * @returns {ThoregonEntity}
     */
    static materialize(props, { soul, encrypt, decrypt } = {}) {
        ensureglobal();
        const instance = new this();
        const entity = instance.materialize(props,{ soul, encrypt, decrypt });
        return entity;
    }

    /**
     * create - initiate an object which become persistent when
     * - it is assigned to a property of a ThoregonEntity (persistent object)
     * - if a soul is provided
     * - it is sould by invoking .materialize() - gets a random soul
     * @param props
     * @return {ThoregonEntity}
     */

    static create(props, { soul, encrypt, decrypt } = {}) {
        ensureglobal();
        // get class for schema and instantiate
        const instance = new this();
        const entity = instance.create(props, { soul, encrypt, decrypt, create: true });
        return entity;
    }

    /**
     * get the entity either with its id or from the reference to the soul
     * - always returns a thoregon entity
     * -
     *
     * if nothing exists locally
     * - a thoregon entity is returned which is not 'materialized' ->   entity.materialized() = false
     * - if a class is provided, the thoregon entity is initialized with an instance of the specified class
     *
     * @param {String} soul
     * @param {ThoregonEntity} cls
     * @param {boolean} dothrow
     * @returns {ThoregonEntity}
     */
    static from(soul, { Cls } = {}) {
        ensureglobal();
        const { encrypt, decrypt } = this.getCrypto();

        Cls = Cls ?? this;
        // get the instance from
        const instance = universe.ThoregonDecorator.from(soul, { encrypt, decrypt, Cls });
        return instance;
    }

    /**
     * get the entity either with its id or from the reference to the soul
     * - waits until the entity is synced if it wasn't available
     *
     * !! DON'T USE
     *
     * @param {String} soul
     * @param {ThoregonEntity} cls
     * @param {boolean} dothrow
     * @returns {ThoregonEntity}
     */
/*
    static async available(soul, { Cls, dothrow } = {}) {
        const { encrypt, decrypt } = this.getCrypto();

        Cls = Cls ?? this;
        // get the instance from
        const instance = await universe.ThoregonDecorator.available(soul, { encrypt, decrypt, Cls });
        return instance;
    }
*/
    //
    // initialization
    //

    /**
     * materialize - create a persistent object
     * the object is immediately persistent,
     * even if no soul is provided (will get a random one)
     *
     * @param soul     ... the soul how the object can be found
     * @param inmem
     * @returns {Promise<*>}
     */

    materialize(props, { soul, encrypt, decrypt } = {}) {
        const { encrypt: fallbackencrypt, decrypt: fallbackdecrypt } = this.getCrypto();
        // Object.assign(this, props);

        const entity = universe.ThoregonDecorator.observe(this, { props, soul, encrypt: encrypt ?? fallbackencrypt, decrypt: decrypt ?? fallbackdecrypt });
        entity.__materialize__();
        return entity;
    }

    /**
     * create - initiate an object which become persistent when it is assigned
     * to a property of a ThoregonEntity (persistent object) or a soul is provided
     *
     * @param props
     * @return {Promise<void>}
     */
    create(props, { soul, encrypt, decrypt, create=true } = {}) {
        const { encrypt: fallbackencrypt, decrypt: fallbackdecrypt } = this.getCrypto();
        // Object.assign(this, props);

        const entity = universe.ThoregonDecorator.observe(this, { props, soul, create, encrypt: encrypt ?? fallbackencrypt, decrypt: decrypt ?? fallbackdecrypt });
        if (soul) entity.__materialize__();
        return entity;
    }

    //
    // reflection
    //

    static get metaClass() {
        return this._metaclass;
    }

    get metaClass() {
        return this.constructor.metaClass;
    }

    // this may be replaced by the firewalls in the PULS (service worker)
    static checkIn({ url } = {}, metaClass) {
        // todo [OPEN]: add the class to the known classes. needed for persistence
        this._metaclass = metaClass.getInstance();
        if (globalThis.dorifer) {
            dorifer.checkinClass(url, this, this._metaclass);
        } else {
            checkInQ.push(() => dorifer.checkinClass(url, this, this._metaclass));
        }
        // console.log("checkIn", url);
    }

    static doCheckIn() {
        checkInQ.forEach(fn => {
            try {
                fn()
            } catch (e) {
                console.log("Dorifer checkinQ", e);
            }
        });
    }

    static get $thoregonClass() {
        return true;
    }

    get $thoregonEntity() {
        return this;
    }

    //
    // logging & debugging
    //

    static getlog$() {
        return ThoregonDecorator.getlog();
    }

    static clearlog$() {
        ThoregonDecorator.clearlog()
    }

    //
    // safety & security
    //


    static getCrypto(opt) {
        // $@CRED
        // todo [OPEN]:
        //  - replace with real encryption and signing
        //  - private objects use the identities keys
        //  - shared objects use the keys from identities credentials
        const pubkey = 'THOREGON';
        const encrypt = async (item) => item;
        const decrypt = async (item) => item;
        return { encrypt, decrypt };
    }

    async getCrypto(opt) {
        return await this.constructor.getCrypto(opt);
    }

}

//
// Polyfill
//

if (!Object.prototype.$thoregonClass) Object.defineProperty(Object.prototype, '$thoregonClass', { configurable: false, enumerable: false, writable: false, value: undefined });
if (!Object.prototype.$thoregonEntity) Object.defineProperty(Object.prototype, '$thoregonEntity', { configurable: false, enumerable: false, writable: false, value: undefined });
if (!Function.prototype.metaClass) Object.defineProperty(Function.prototype, 'metaClass', { configurable: false, enumerable: false, get: function () { return this._metaclass } });
if (!Function.prototype.checkIn) Object.defineProperty(Function.prototype, 'checkIn', { configurable: false, enumerable: false, writable: false, value: function ({ url } = {}, metaClass) { globalThis.dorifer?.checkinClass(url, this, metaClass) } });

//
// exports
//

export default ThoregonEntity;

export class ThoregonObject extends ThoregonEntity() {}

ensureglobal();
