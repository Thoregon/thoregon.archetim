import ThoregonEntity           from "../thoregonentity.mjs";
import MetaClass, { ANY_CLASS } from "../metaclass/metaclass.mjs";
import Command                  from "./command.mjs";
import Event                    from "./event.mjs";

/**
 * Channel
 *
 * todo [REFACTOR]: entry order
 * currently there is no handling for network partitions
 * if multiple clients send to this channel the order is not
 * maintained and some entries may be lost.
 * need a merge for the entry chain
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */


export class ChannelMeta extends MetaClass {

    initiateInstance() {
        this.name                     = "Channel";
        // this.attributeMode            = ATTRIBUTE_MODE.VARENCRYPT;

        this.text('name');
        this.object("first", ANY_CLASS, { merge: false, description: 'the first entry in this channel' });
        this.object("last", ANY_CLASS, { merge: false, description: 'the last entry in this channel' });
    }

    chainAutoComplete(entity) {
        // todo: chain the auto complete for directories, use options to specify the class to use for the chain
        // return new Directory();  !! this is dangerous, maybe we need a specialized class
    }
}

export default class Channel extends ThoregonEntity() {


    "@synchronized"
    sendEvent(type, detail) {
        const entry = this.buildEvent({ type, detail });
        this.send(entry);
    }

    "@synchronized"
    sendCommand(type, detail) {
        const entry = this.buildCommand({ type, detail });
        this.send(entry);
    }

    "@synchronized"
    send(entry) {
        const last = this.last;
        if (last) {
            last.next = entry;
            entry.prev = last;
        } else {
            this.first = entry;
        }
        this.last = entry;
    }

    buildEvent({ type, detail } = {}) {
        const entry = Event.create({ id: `${this.name}_${universe.random(8)}`, type, detail });
        return entry;
    }

    buildCommand({ type, detail } = {}) {
        const entry = Event.create({ id: `${this.name}_${universe.random(8)}`, type, detail });
        return entry;
    }

    get size() {
        // todo: count
        return this.first ? 1 : 0;
    }

}


Channel.checkIn(import.meta, ChannelMeta);
