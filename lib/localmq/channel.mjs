/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import Event from "./event.mjs";

export default class Channel {

    constructor(name, spec) {
        this.name = name;
        this.spec = spec;
        this.entries = [];
        this._save = (channel) => {};
    }

    static create(name, spec) {
        const channel = new this(name, spec);
        return universe.observe(channel);
    }

    static from({ name, entries } = {}) {
        const channel = this.create(name);
        if (entries) channel.entries = entries;
        return channel;
    }

    sendEvent(type, detail = {}) {
        if (!type) return;  // log and throw
        const entry = this.buildEvent({ type, detail });
        this.send(entry);
    }

    send(entry) {
        this.entries.push(entry);
        this._save(this);
        this.emit("message", { type: entry.type, id: entry.id, detail: entry.detail } );
    }

    buildEvent({ type, detail } = {}) {
        const entry = Event.create({ id: `${this.name}_${universe.random(8)}`, type, detail });
        return entry;
    }

    getEvent(idx) {
        return this.entries[idx];
    }

    last() {
        return this.entries.length - 1;
    }

    //
    // testing and debugging
    //

    clear() {
        this.entries = [];
        this._save(this);
    }

}
