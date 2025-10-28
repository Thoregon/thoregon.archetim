/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

export default class Event {

    constructor(id, { type, detail }) {
        Object.assign(this, { id, type, detail });
    }


    static create({ id, type, detail } = {}) {
        const event = new this(id, { type, detail });
        return universe.observe(event);
    }

}
