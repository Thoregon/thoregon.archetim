/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */
import ThoregonDecorator from "./thoregondecorator.mjs";

const PERSISTENCE_MODE = {
    "NONE"       : "none",
    "IMMEDIATE"  : "immediate",
    "TRANSACTION": "transaction"
}

const defaultSchema = {
    meta: {
        persistence: PERSISTENCE_MODE.IMMEDIATE
    }
}

const ThoregonEntity = (base) => class ThoregonEntity extends (base || Object) {

    static async create(props) {
        // get class for schema and instantiate
        // if missing create an object
        const instance = new this(props);

        const schema = { meta: { persistence: defaultSchema.meta.persistence } };

        // todo [OPEN]: replace with real encryption and signing
        const encrypt = (obj) => obj;
        const decrypt = (obj) => obj;
        // decorate the object
        const entity = ThoregonDecorator.observe(instance, { schema, encrypt, decrypt });

        // if the schema defines persistence 'immediate' store it
        if (schema.meta.persistence === PERSISTENCE_MODE.IMMEDIATE) await entity.__store__();

        return entity;
    }

    static async exists(id) {

    }

    static async get(id) {

    }

    static get metaClass() {
        return this._metaclass;
    }

    get myMetaClass() {
        return this.constructor.metaClass;
    }
    static checkIn({ url } = {}, metaClass) {
        // todo [OPEN]: add the class to the known classes. needed for persistence
        this._metaclass = metaClass.getInstance();
        console.log("checkIn", url);
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
