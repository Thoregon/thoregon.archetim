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
        const promise = new Promise(fn);
        const pfn     = new Function();
        if (prev)       chain._$p = prev;
        if (thisTarget) chain._$t = thisTarget;
        pfn._$_       = promise;
        const proxy   = new Proxy(pfn, chain);
        return { proxy, chain };
    }

    bind(thisTarget) {

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
                    // bind the right 'this'. it may be 'undefined' if the function was called w/o context, or the Object the function was called on.
                    //  - chain is the handler we are now in
                    //  - chain._$p is the handler where 'apply' was called
                    //  - chain._$p._$p is the handler from where the function was fetched (if it was so)
                    // 'thisTarget' may be undefined!
                    const thisTarget = chain._$p?._$p?._$t; // ?? chain._$p?._$t ?? chain._$t;
                    const result = Reflect.apply(fn, thisTarget, argumentsList);
                    resolve(result);
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
