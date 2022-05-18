/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

export default class PromiseChain {

    //
    // instance
    //

    /**
     *
     * @param fn
     * @return {Promise<unknown>}
     */
    static with(fn) {
        const chain   = new this();
        const promise = new Promise(fn);
        const proxy   = new Proxy(promise, chain);
        return proxy;
    }

    //
    // decorator (proxy handler)
    //

    has(target, key) {
        return key in target;
    }

    ownKeys(target) {
        return Reflect.ownKeys(target);
    }

    apply(target, thisArg, argumentsList) {
        if (!('then' in target)) return target();       // check if it is a Promise (thenable)
        return PromiseChain.with((resolve, reject) => {
            target
                .then((fn) => {
                    const result = Reflect.apply(fn, thisArg, argumentsList);
                    resolve(result);
                })
                .catch((err) => reject(err));
        });
    }

    get(target, prop, receiver) {
        if (prop in target) return Reflect.get(...arguments);       // just forward if it exists
        if (!('then' in target)) return Reflect.get(...arguments);  // check if it is a Promise (thenable)
        return PromiseChain.with((resolve, reject) => {
            target
                .then((value) => resolve(value))
                .catch((err) => reject(err));
        })
    }

    set(target, prop, value, receiver) {
        return Reflect.set(...arguments);
    }
}
