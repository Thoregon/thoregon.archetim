/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */
import FSNeulandStorageAdapter from "/thoregon.neuland/modules/nodepeer/fsneulandstorageadapter.mjs";

export default class FSNeulandChannelAdapter extends FSNeulandStorageAdapter {


    //
    // DB type
    //

    newInnerDB() {
        return [];
    }

    //
    // adaption
    //

    keys() {
        return [];
    }


    size() {
        const db = this.db;
        return db.length;
    }

    has(idx) {
        return idx < db.length;
    }

    get(idx) {
        const db = this.db;
        if (!db) return;
        return db[idx];
    }

    set(idx, item) {
        throw Error("channeladapter#set: operation not allowed");
    }

    del(idx) {
        throw Error("channeladapter#set: operation not allowed");
    }

    push(item) {
        let db = this.db;
        if (!db) db = this.db = this.newInnerDB();
        db.push(item);
    }

    clear() {
        let db = this.db = this.newInnerDB();
    }

    forEach(fn) {
        if (!this.db) return;
        this.db.forEach(fn);
    }

}