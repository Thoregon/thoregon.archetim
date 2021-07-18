/**
 * unified interface for an underlying graph
 *
 * the graph is managed by a content handler
 *
 * todo [OPEN]: content streams read/write
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import InMemoryContentHandler  from "./inmemorycontenthandler.mjs";
import { ErrNoContentHandler } from "../errors.mjs";

const parts = (path) => Array.isArray(path) ? path : path.split('.');

export default class Node {

    constructor({
                    key,
                    parent
                } = {}) {
        Object.assign(this, { key, parent });
        if (parent) {
            if (!parent._contenthandler) throw ErrNoContentHandler();
            this._contenthandler = parent._contenthandler; // contenthandler is a singleton per root
        }
        this._children  = {};
        this._parents   = [];
        this._listeners = [];
    }

    /*
     * navigational
     */

    /**
     * create a graph root with a content handler
     * if content handler is omitted, an InMemoryContentHandler
     * will be used.
     *
     * @param {ContentHandler} contenthandler
     * @return {Node}
     */
    static root(contenthandler) {
        let root = new this({ key : '' });
        root._contenthandler = contenthandler || new InMemoryContentHandler();
        return root;
    }

    /**
     * get the child node with a name
     * always answers a node
     *
     * if underlying graph is not a DAG, the content handler will forward
     * the error from the target graph
     *
     * @param key
     * @return {Node|*}
     */
    get(key) {
        if (this._children[key]) return this._children[key];
        let node = new this.constructor({ key, parent: this });     // keep inheritance when subclasses of Node are used
        this._children[key] = node;
        node._parents.push(this);
        this._contenthandler.addParent(node, this);
        return node;
    }

    path(path) {
        let keys = parts(path);
        let node = this.get(keys.shift());
        return (keys.length > 0) ? node.path(keys) : node;
    }

    isRoot() {
        return this._parents.length === 0;
    }

    get location() {
        return (this._parents.length > 0 ? !this._parents[0].isRoot() ? this._parents[0].location+'.' : '' : '') + this.key;
    }

    /**
     * walks up the nodes n times
     * specify -1 to get the root node
     * if the graph is not a DAG, this method walks up
     * to the first defined parent. CAUTION: this is not deterministic!
     * @param n
     * @return {*|undefined|void|Node}
     */
    back(n) {
        return n > 0 ? this._parents.length > 0 ? this._parents[0].back(n-1) : this : this;
    }

    /*
     * content
     */
    put(item) {
        if (item.no͛de) {
            // is a node
            this._children[item.key] = item;
            item._parents.push(this);
            this._contenthandler.addParent(item, this);
        } else {
            this._contenthandler.setValue(this, item);
        }
        this.emit(item);
    }

    drop() {
        this._contenthandler.dropValue(this);
    }

    /*async*/get val() {
        // return Promise.resolve(this.once((item) => item));
        return new Promise((resolve, reject) => {
            try { this.once(resolve);} catch (e) { reject(e) }
        });
    }

    /*
     * get information about the node
     */

    async stat() {
        return await this._contenthandler.stat(this);
    }

    /*
     * stream interface to the node content
     */

    get stream() {
        this._contenthandler.getStream(this);
    }

    /*async*/set stream(stream) {
        // todo
    }

    /*
     * iterator interface to the node content
     */

    get iterator() {
        this._contenthandler.getIterator(this);
    }

    /*async*/set iterator(stream) {
        // todo
    }

    /*
     * permissions & rectrictions
     */

    async isRestricted() {
        return this._contenthandler.isRestricted(this);
    }

    /**
     * join this node with an id handle (this must be resolveable to a  key pair)
     * @param idhandle
     */
    async join(idhandle) {
        return this._contenthandler.join(this, idhandle);
    }


    /*
     * subscriptions
     */

    once(fn) {
        this._contenthandler.getValue(this).then(fn);
        return this;
    }

    not(fn) {
        this._contenthandler.getValue(this).then((value) => {
            if (!value) fn();
        });
        return this;
    }

    on(fn) {
        return this;
    }

    off() {
        return this;
    }

    // publish
    emit(item) {

    }


    /*
     * structural
     */
    /**
     *
     * @param transformfn
     */
    map(transformfn) {
        // check if needed
    }

    get no͛de() {
        return true;
    }

    _isCyle(node) {
        node = node || this;
        return this.parent ? this.parent === node || this.parent._isCycle(node) : false;
    }

}

class ItemIterator {

    on() {

    }

    once() {

    }
}
