/**
 * proxy handler to create a Promise chain
 * the 'await' is passed through the chain, the last promise returns the result
 * works also for functions
 *
 * Usage:
 *   instead of nested brackets:
 *      await (await (await (await obj.a).b).c).fn()
 *
 *   the await is passed on:
 *      await obj.a.b.c.fn();
 *
 * How it works:
 *
 *  - wraps a Promise with a Proxy to intercept any 'get' property on the promise.
 *  - if it is 'then', 'catch' or 'finally' return the corresponding function bound to the Promise
 *  - if the Promise has the wanted property, also return it
 *  - otherwise return a PromiseChain which, when fulfills (then) the promise when requested and resolve to the wanted property value
 *
 *  - to get the 'apply' trap working, the target of the proxy must be a Function!
 *  - also the 'this' for the function must be bound to the right object
 *  - the 'prevoius' promise, if there is any, must be resolved to get the 'this' for the function
 *  - otherwise the chain keeps the objects which results in the 'get' trap
 *  - bind the object from the last 'get' as 'this' to the function in the 'apply' trap
 *  - if the function is not invoked in an object context, 'this' is undefined.
 *
 * when to 'await' respectively 'then' is invoked on the last Promise in the chain, all Promises before
 * will be fulfilled (except there is an exception)
 *
 * todo
 *  - [OPEN] check if optional selector works: await obj.a?.b?.c
 *  - [REFACTOR]: review & cleanup the _$ properties, reduce if possible  { with: _$t -> Promise.resolve(thisTarget) }
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
    static with(fn, prev, thisTarget) {
        const chain   = new this();
        const promise = new Promise(fn);            // Promise to build the chain
        const pfn     = new Function();             // target for the proxy to get the 'apply' trap working
        if (prev)       chain._$p = prev;           // chain previous
        if (thisTarget) chain._$t = thisTarget;     // use object as 'this' in the apply trap
        chain._$_     = promise;
        pfn._$_       = promise;
        const proxy   = new Proxy(pfn, chain);      // wrap it to intercept 'get' and 'apply'
        return { proxy, chain };
    }

    //
    // decorator (proxy handler)
    //

    apply(target, thisArg, argumentsList) {
        // if it is not a PromiseChain just return the property value
        if (!('_$_' in target)) return target();
        const promise = target._$_;

        // now chain the Promise
        const { proxy, chain } =  PromiseChain.with((resolve, reject) => {
            promise
                .then((fn) => {
                    // bind the right 'this'. it may be 'undefined' if the function was called w/o context.
                    //  - need to resolve the prevoius promise first (if there is one), bind the result as 'this'
                    //  - chain is the handler we are now in
                    //  - chain._$p is the handler where 'apply' was called
                    //  - chain._$p._$p is the handler from where the function was fetched (if it was so)
                    // 'thisTarget' is undefined if the function is not invoked in an object context!
                    const prom = chain._$p._$p._$_;
                    if (prom) {
                        prom.then((x) => {
                            const thisTarget = x ?? chain._$p?._$p?._$t;
                            const result = Reflect.apply(fn, thisTarget, argumentsList);
                            resolve(result);
                        })
                    } else {
                        const thisTarget = chain._$p?._$p?._$t;
                        const result = Reflect.apply(fn, thisTarget, argumentsList);
                        resolve(result);
                    }
                })
                .catch((err) => reject(err));
        }, this);

        return proxy;
    }

    get(target, prop, receiver) {
        // if it is not a PromiseChain just return the property value
        if (!('_$_' in target)) return Reflect.get(...arguments);
        const promise = target._$_;

        // bind Promise functions and return it
        if (prop === 'then' && prop in promise) return promise.then.bind(promise);
        if (prop === 'catch' && prop in promise) return promise.catch.bind(promise);
        if (prop === 'finally' && prop in promise) return promise.finally.bind(promise);

        // just forward if it exists
        if (prop in promise) return Reflect.get(...arguments);

        // now chain the Promise
        const { proxy, chain } =  PromiseChain.with((resolve, reject) => {
            // resolve(target);
            promise
                .then((res) => {
                    const value = Reflect.get(res, prop);
                    chain._$t = value;
                    resolve(value);
                })
                .catch((err) => reject(err));
        }, this);

        return proxy;
    }

    //
    // proxy handler additional fns
    //

/*
    set(target, prop, value, receiver) {
        return Reflect.set(...arguments);
    }

    has(target, key) {
        return key in target;
    }

    ownKeys(target) {
        return Reflect.ownKeys(target);
    }
*/
}
