/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

export default class RemoteDirectory {
    // todo [REFACTOR]: check which methods must be implemented locally
    //  - add(entry)

    static create({ soul, encrypt, decrypt, opt } = {}) {

    }

    //
    // meta
    //

    get $isRemoteCollection() {
        return true;
    }

    // get isNeulandCollection() {
    //     return true;
    // }


    //
    // access
    //

    async get(observer, key) {
        const entry = await observer.get(key);
        return { done: true, params: entry };
    }

    async set(observer, key, val) {
        await observer.set(key, val);
        return { done: false, params: null };
    }

    // has(observer, key) {
    //     return observer.has(key);
    // }

    remove(observer, key) {
        observer.deleteProperty(key);
        return { done: false }
    }

    delete(observer, key) {
        return this.remove(key);
    }

    getAny(observer) {
        const $keys = this.$keys;
        if ($keys.is_empty) return { done: true };
        const key = $keys[0];
        return { done: true,  params: { key, item: this.get(key) } };
    }


    clear(observer) {
        observer.__clear__();
        return { done: false };
    }

    //
    // async iterator functions
    // todo: add 'lazy' functions working like an iterator on request
    //

    get asyncIterator() {
        return this[Symbol.asyncIterator];
    }

    async asyncForEach(fn) {
        for await (const [key, value] of this) {
            await fn(value);
        }
    }

    async asyncForEachKey(fn) {
        for await (const [key, value] of this) {
            await fn(key);
        }
    }

    async asyncForEachEntry(fn) {
        for await (const [key, value] of this) {
            await fn([key, value]);
        }
    }

    async asyncFind(fn) {
        for await (const [key, value] of this) {
            const found = await fn(value);
            if (found) return value;
        }
    }

    async asyncFindKey(fn) {
        for await (const [key, value] of this) {
            const item = await fn(key);
            if (value) return value;
        }
    }

    async asyncMap(fn) {
        const col = [];
        for await (const [key, value] of this) {
            const item = await fn(value);
            col.push(item);
        }
        return col;
    }

    async asyncFilter(fn) {
        const col = [];
        for await (const [key, value] of this) {
            const found = await fn(value);
            if (found) col.push(value);
        }
        return col;
    }

    async asyncFilterKey(fn) {
        const col = [];
        for await (const [key, value] of this) {
            const found = await fn(key);
            if (found) col.push(key);
        }
        return col;
    }

    /*
     * async iterator interface
     */
    async *[Symbol.asyncIterator]() {
        const keys = this.$keys;
        for await (const key of keys) {
            const value = await this.$access.get(this.$access.target, key); // await this.get(this, key);
            // yield value;
            yield [key, value];
        }
    }


}

if (globalThis.universe) universe.$Directory = RemoteDirectory;