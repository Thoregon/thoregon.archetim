/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

/*
    todo [OPEN]:
        - partition files to avoid very large file sizes
 */

import Event                   from "./event.mjs";
import { timeout }             from "/evolux.universe";
import {
    localserialize,
    localdeserialize,
    persistancedeserialize,
    persistanceserialize
}                              from "/evolux.util/lib/serialize.mjs";
import NeulandDB               from "/thoregon.neuland/src/storage/neulanddb.mjs";
import FSNeulandChannelAdapter from "./storage/fsneulandchanneladapter.mjs";

const ONE_HOUR            = 60 * 60 * 1000;
const CHANNEL_STORAGE_OPT = { location: (universe.NEULAND_STORAGE_OPT.location ?? 'data') + '/channels', backup: ONE_HOUR, maxmod: 5 }

const DBGID = '** NeulandDB';

const getChannelsDir = () => (universe.NEULAND_STORAGE_OPT.location ?? 'data') + '/channels';

export default class Channel extends NeulandDB {

    constructor(name, spec) {
        super(name);
        this.init(FSNeulandChannelAdapter, { ...CHANNEL_STORAGE_OPT, name, dontPublish: true });
        this.spec    = spec;
        this._isStopped = false;
    }

    static create(name, spec) {
        const channel = new this(name, spec);
        return universe.observe(channel);
    }

    static async load(name, spec) {
        const channel = new this(name, spec);
        return universe.observe(channel);
    }

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
        // const ser = persistanceserialize(event);
        const ser = localserialize(event);
        this.storage.push(ser);
        this.modified({});
        console.log("-- Channel.send ", this.name, this.size(), event.type, event.id);
        this.emit("message", { type: event.type, sent: event.sent, id: event.id, detail: event.detail } );
    }

    buildEvent({ type, detail } = {}) {
        this._materializeDetail(detail);
        detail.materialize?.();
        const entry = { id: `${this.name}_${universe.random(8)}`, type, detail };
        return entry;
    }

    getEvent(idx) {
        const ser = this.get(idx);
        const deser = localdeserialize(ser);
        const obj = deser.obj;
        const event = Event.create(obj);
        return event;
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
    // storage
    //

    _materializeDetail(detail) {
        if (detail == undefined) return;
        detail.materialize?.();
        Object.values( (value) => value?.materialize?.() );
    }

    async stop() {
        this._isStopped = true;
        this.modified({ immed: true });
        await timeout(200);
    }

    //
    // neuland db overrides
    //

    set(soul, item, opt) {
        throw Error("Channel#set: operation not allowed");
    }

    del(soul, opt) {
        throw Error("Channel#del: operation not allowed");
    }

    //
    // testing and debugging
    //

    clear() {
        this.storage.clear();
        this._store();
    }

    /**
     * filter events in this channel
     *
     * @param fn  ... (evt) => true
     */
    filter(fn) {
        const found = [];
        for (let i = 0; i < this.size(); i++) {
            const entry = this.getEvent(i);
            if (fn(entry)) found.push(entry);
        }
        return found;
    }

    /*

    //
    // old channel
    //
    //

    static from({ name, spec, entries } = {}, location) {
        const channel = this.create(name);
        if (spec)    channel.spec = spec;
        if (entries) channel.entries = entries;
        if (location) channel._dir = location;
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
        console.log("-- Channel.send ", this.name, this.entries.length, entry.type, entry.id);
        this.emit("message", { type: entry.type, id: entry.id, detail: entry.detail } );
    }

    buildEvent({ type, detail } = {}) {
        detail.materialize?.();
        const entry = Event.create({ id: `${this.name}_${universe.random(8)}`, type, detail });
        return entry;
    }

    getEvent(idx) {
        return this.entries[idx];
    }

    last() {
        return this.entries.length - 1;
    }

    // persistence
    //

    static async load(name, location) {
        try {
            const start = Date.now();
            const fs = universe.fs;    // get file system
            const dir = location ?? getChannelsDir();
            const filename = 'channel_' + name + '.json';
            let stat;
            try {
                stat = await fs.stat(dir + '/' + filename);
            } catch (ignore) {}
            if (!stat) return;
            const json = await fs.readFile(dir + '/' + filename, { encoding: 'utf8' });
            const deser = localdeserialize(json);
            const obj = deser.obj;
            if (!obj) return null;
            const channel = Channel.from(obj);
            channel._dir = location;
            console.log("-- Channel.load", channel.name, channel.entries.length, `t: ${Date.now() - start}ms`);
            return channel;
        } catch (e) {
            console.error("** Channel", e);
        }
    }

    async store() {
        if (this.storing) return false;
        this.storing = true;
        try {
            await this.ensureChannelDir();
            const fs = universe.fs;    // get file system
            const dir = this._dir ?? getChannelsDir();
            const filename = 'channel_' + this.name + '.json';
            const json = localserialize(this);
            await fs.writeFile(dir + '/' + filename, json, 'utf8');
            console.log("-- Channel.store", this.name);
            return true;
        } catch (e) {
            console.error("** Channel", e);
        } finally {
            this.storing = false;
        }
        return false;
    }

    async save0() {
        if (!await this.store()) {
            console.log("-- Channel.store: enqueue while storing", this.name);
            if (this._storeTimout) clearTimeout(this._storeTimout);
            this._storeTimout = setTimeout(() => this.save0(), WAIT_STORE)
        }
    }

    async ensureChannelDir(){
        const fs = universe.fs;    // get file system
        const dir = this._dir ?? getChannelsDir();
        let stat;
        try {
            stat = await fs.stat(dir);
        } catch (ignore) {
            console.error("** Channel.ensureChannelDir", ignore);
        }
        if (!stat) {
            await fs.mkdir(dir, { recursive: true });
            await fs.mkdir(dir + '/backup', { recursive: true });
        }
    }
*/

}
