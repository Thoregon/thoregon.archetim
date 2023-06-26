/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import { isFunction } from "/evolux.util";

const EXCLUDEDPROPS = ['is_empty', 'constructor'];
const STOPCLS       = Object.getPrototypeOf({});

const saveGetProperty = (obj, prop) => {try {
        return Reflect.get(obj, prop);
    } catch (ignore) {
        return undefined;
    }
}

const isPrivate = (e) => (e.startsWith('_') || e.endsWith('_') || e.startsWith('$') || e.endsWith('$'));

export default class JSInspector {

    static schemaFrom(obj) {
        const inspector = new this();
        // inspector._obj  = obj;
        const schema = inspector.inspect(obj);
        return schema;
    }

    inspect(obj) {
        const properties = this.getAllPropertyNames(obj);
        const methods    = this.getAllMethodNames(obj);
        const events     = [...properties];
        const schema     = {
            meta: {
                name: obj.constructor.name
            },
            properties: {},
            attributes: {},
            methods: {},
            events: {}
        };

        properties.forEach(prop => schema.properties[prop] = { type: 'any' });
        schema.events['change'] = { params: { event: { type: 'any' } } };     // todo: is an Event type
        methods.forEach(method => {
            const parameters = {};
            this.getFnParamNames(saveGetProperty(obj, method)).forEach(param => parameters[param] = { type: 'any' });
            schema.methods[method] = { parameters, return: { type: 'any' } };
        } );

        return schema;
    }

    getAllPropertyNames(obj) {
        let props = Reflect.ownKeys(obj);
        let cls   = obj.constructor.prototype;
        while (cls && cls !== STOPCLS) {
            let pnames = Object.getOwnPropertyNames(cls).filter((name) => !isFunction(saveGetProperty(cls, name)));
            props = [...pnames, ...props].unique();
            cls   = Object.getPrototypeOf(cls);
        };

        return this.filterProperties(props);
    }

    filterProperties(props) {
        return props.filter(e => !EXCLUDEDPROPS.includes(e) && !isPrivate(e));
    }

    getAllMethodNames(obj) {
        let cls   = obj.constructor.prototype;
        let props = [];

        while (cls && cls !== STOPCLS) {
            let fnnames = Object.getOwnPropertyNames(cls).filter((name) => isFunction(saveGetProperty(cls, name)));
            props = [...fnnames, ...props].unique();
            cls   = Object.getPrototypeOf(cls);
        };

        return this.filterProperties(props);
    }

    getFnParamNames(fn){
        if (!isFunction(fn)) return [];
        const fstr = fn.toString();
        // this should be a standard reflection of javascript, as long as it does not exist use this regex
        return fstr.match(/\(.*?\)/)[0].replace(/[()]/gi,'').replace(/\s/gi,'').split(',').filter(name => !!name);
    }

    getAnnotation(constructor, name) {
        const cstr = constructor.toString();
        const rx = new RegExp(`.*\/\/@(.*)\n.*${name}\(`, 'm');
        return cstr.match(rx)?.[1];
    }

    getFnAnnotation(fn){
        if (!isFunction(fn)) return [];
        const fstr = fn.toString();
        // this should be a standard reflection of javascript, as long as it does not exist use this regex
        return fstr.match(/.*\{\n.*\/\/@(.*)\n.*/m)?.[1];
    }
}

