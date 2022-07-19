/**
 *  base class to implement content handlers
 *
 *  only one per content root
 *  all nodes below get the same handler
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

export default class ContentHandler {

    constructor(anchor) {
        this.anchor = anchor;
    }

    /**
     * answer if the graph for this content handler is directed and acyclic
     * @return {boolean}
     */
    isDAG() {
        return false;
    }

    /**
     * if it is not a DAG, a node may have multiple parents
     * @param node
     * @param parent
     */
    addParent(node, parent) {
        // implement by subclass
    }

    setValue(node, item) {
        // implement by subclass
    }

    async getValue(node) {
        // implement by subclass
    }

    /**
     * basic readable stream implementation
     *
     * override by subclass if you need a 'real' stream
     * @param node
     * @return {Promise<ReadableStream<any>>}
     */
    getStream(node) {
        return new ReadableStream({
          start : async (controller) => controller.enqueue(await this.getValue(node)),
          cancel: () => {}
        });
    }

    /**
     * for those who prefer to have an iterator.
     * just provides the value
     *
     * todo: maybe it is better to return an iterator for the subnodes
     *
     * override by subclass if you need a 'real' stream
     * @param node
     * @return {[Symbol.asyncIterator]} object with an async iterator
     */
    getIterator(node) {
        return {
            [Symbol.asyncIterator]() {
                return {
                    done : false,
                    async next() {
                        if (this.done) return { done: true };
                        this.done = true;
                        return { done: false, value: await this.getValue(node) };
                    },
                    return() {
                        // This will be reached if the consumer called 'break' or 'return' early in the loop.
                        return { done: true };
                    }
                }
            }
        }
    }

    async stat(node) {
        // implement by subclass
    }

    dropValue(node) {
        // implement by subclass
    }

    /*
     * security
     */

    async isRestricted(node) {
        // override by subclass
        return false;
    }

    async join(node, idhandle) {
        // override by subclass
        return true
    }
}
