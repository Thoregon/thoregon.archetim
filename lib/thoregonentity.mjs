/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */
import ThoregonDecorator from "./thoregondecorator.mjs";
import MetaClass         from "./metaclass/metaclass.mjs";
// import { doAsync }       from "/evolux.universe";

const ThoregonEntity = (base) => class ThoregonEntity extends (base || Object) {

    static async create(props, { store, inmem = false } = {}) {
        // get class for schema and instantiate
        // if missing create an object
        const instance = new this(props);
        // decorate the object
        const entity = await instance.create({ store, inmem });

        return entity;
    }

    // get the entity either with its id or from the reference to the store
    static async from(idOrRefStore) {
        const encrypt = async (obj) => obj;
        const decrypt = async (obj) => obj;
        encrypt.pub = '1234567890';
        decrypt.pub = '1234567890';

        // get the instance from
        const instance = await ThoregonDecorator.from(idOrRefStore, { encrypt, decrypt});
        // await doAsync();
        return instance;
    }

/*
    static async exists(idOrRef) {
        // check if the entity exists, either with its id or from the reference to the store
    }
*/

    static get metaClass() {
        return this._metaclass;
    }

    get metaClass() {
        return this.constructor.metaClass;
    }

    async create({ store, inmem = false } = {}) {
        // todo [OPEN]:
        //  - replace with real encryption and signing
        //  - private objects use the identities keys
        //  - shared objects use the keys from identities credentials
        const encrypt = async (obj) => obj;
        const decrypt = async (obj) => obj;
        encrypt.pub = '1234567890';
        decrypt.pub = '1234567890';
        // decorate the object
        const entity = ThoregonDecorator.observe(this, { store, encrypt, decrypt, inmem });

        // if the schema defines persistence 'immediate' store it
        if (this.metaClass.persistencemode === MetaClass.PERSISTENCE_MODE.IMMEDIATE) await entity.__store__();
        // todo: if (this.metaClass.persistencemode === MetaClass.PERSISTENCE_MODE.TRANSACTION) await entity.__add2transaction__();
        return entity;
    }

    // this may be replaced by the firewalls in the PULS (service worker)
    static checkIn({ url } = {}, metaClass) {
        // todo [OPEN]: add the class to the known classes. needed for persistence
        this._metaclass = metaClass.getInstance();
        dorifer.checkinClass(url, this, this._metaclass);
        // console.log("checkIn", url);
    }

    get $thoregonEntity() {
        return this;
    }

    // mixin defaults

}

//
// Polyfill
//

if (!Object.prototype.$thoregonEntity) Object.defineProperty(Object.prototype, '$thoregonEntity', { configurable: false, enumerable: false, writable: false, value: undefined })

export default ThoregonEntity;
