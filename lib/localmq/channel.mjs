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

import Event                                from "./event.mjs";
import { localserialize, localdeserialize } from "/evolux.util/lib/serialize.mjs";

const WAIT_STORE = 250;

const getChannelsDir = () => (universe.NEULAND_STORAGE_OPT.location ?? 'data') + '/channels';

export default class Channel {

    constructor(name, spec) {
        this.name    = name;
        this.spec    = spec;
        this.entries = [];
        this.storing = false;
        this._save   = (channel) => channel.save0 ();
    }

    static create(name, spec) {
        const channel = new this(name, spec);
        return universe.observe(channel);
    }

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

    //
    // utilities
    //

    getAllTransationsWithType(type) {
        const found = this.entries.filter((entry) => entry.type === type);
    }

    //
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
        if (!stat) await fs.mkdir(dir);
    }

    //
    // testing and debugging
    //

    clear() {
        this.entries = [];
        this._save(this);
    }

}
