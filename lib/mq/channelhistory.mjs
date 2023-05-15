import ThoregonEntity                           from "../thoregonentity.mjs";
import MetaClass, { ATTRIBUTE_MODE, ANY_CLASS } from "../metaclass/metaclass.mjs";
import Directory                                from "../directory.mjs";
import Channel                                  from "./channel.mjs";

/**
 * a channel history is used to track which enties from a channel has been processed already
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

export class ChannelHistoryMeta extends MetaClass {

    initiateInstance() {
        this.name                     = "ChannelHistory";
        // this.attributeMode            = ATTRIBUTE_MODE.VARENCRYPT;

        this.object("channel", Channel, { autocomplete: false, merge: false, description: '' });
        this.object("first", Object,    { merge: false, description: 'first of the entries which was processed' });
        this.object("pending", Object,  { merge: false, description: 'entry which is processing' });
        this.object("latest", Object,   { merge: false, description: 'this is the latest of the processed entries from the channel. all subsequent entries need to be processed' });
        this.collection('errors', Directory, { embedded: true, autocomplete: true, description: 'all entries which had an error during processing and are currently unresoved' });
    }
}

export default class ChannelHistory extends ThoregonEntity() {

    archive(entry) {
        if (!this.first) this.first = entry;
        this.latest = entry;
    }

    hadError(entry) {
        this.errors.put(entry.soul, entry);
    }

    get size() {

    }


}

ChannelHistory.checkIn(import.meta, ChannelHistoryMeta);
