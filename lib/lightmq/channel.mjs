/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import fs          from 'fs';
import path        from 'path';

// import Event       from "./event.mjs";
import Event       from "../localmq/event.mjs";
import { timeout } from "/evolux.universe";
import {
    localserialize,
    localdeserialize,
}                              from "/evolux.util/lib/serialize.mjs";


const getChannelsDir = () => (universe.NEULAND_STORAGE_OPT.location ?? 'data') + '/channels';

export default class Channel {

    constructor(name, spec) {
        this.name       = name;
        this.spec       = spec;
        this.events     = [];
        this._isStopped = true;
    }

    static create(name, spec) {
        const channel = new this(name, spec);
        return universe.observe(channel);
    }

    static async load(name, spec) {
        // don't do anything, new one will be created
    }

    //
    // Events
    //


    //
    // Events
    //

    sendEvent(type, detail = {}) {
        if (!type) return;  // log and throw
        const event = this.buildEvent({ type, detail });
        this.send(event);
        return event;
    }

    send(event) {
        if (this._isStopped) {
            console.error(">> Channel", this.name, " send event after stop", JSON.stringify(event));
            return;
        }
        event.sent = universe.now;
        event.detail.sent = universe.now;
        this.events.push(event);
        console.log("-- Channel.send ", this.name, this.size(), event.type, event.id);
        this.emit("message", { type: event.type, sent: event.sent, id: event.id, detail: event.detail } );
        this._logEvent(event)
    }

    buildEvent({ type, detail } = {}) {
        const entry = Event.create({ id:`${this.name}_${universe.random(8)}`, type, detail });
        return entry;
    }

    getEvent(idx) {
        // const event = Event.create(obj);
        const event = this.events[idx];
        return event;
    }

    size() {
        return this.events.length;
    }

    last() {
        return this.size() - 1;
    }

    forEach(fn) {
        for (let i = 0; i < this.size(); i++) {
            const event = this.getEvent(i);
            fn(event, i);
        }
    }

    //
    // log
    //

    _logEvent(event) {
        const dir = `${getChannelsDir()}/${this.name}`;
        const filepath = `${dir}/${universe.inow}_${event.type}_${event.id}.json`;
        const ser = localserialize(event);
        fs.writeFile(filepath, ser, err => {});
    }

    //
    // lifecycle
    //

    async start() {
        const dir = `${getChannelsDir()}/${this.name}`;
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        this._isStopped = false;
    }

    async store() {}

    async stop() {
        this._isStopped = true;
        this.events = [];
        // nothing more to do
    }
}