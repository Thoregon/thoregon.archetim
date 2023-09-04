import ThoregonEntity                           from "../thoregonentity.mjs";
import MetaClass, { ATTRIBUTE_MODE, ANY_CLASS } from "../metaclass/metaclass.mjs";

/**
 * the channel entries are a double linked (prev/next) list
 * managed by a Channel
 *
 * todo [REFACTOR]: entry order
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

export class ChannelEntryMeta extends MetaClass {

    initiateInstance() {
        this.name                     = "ChannelEntry";

        this.text("id", { description: 'event id' });
        this.text("type", { description: 'type of the entry' });
        this.object("detail", Object, { embedded: true, description: 'detail data for the entry' });
        // since 'created' will be maintained automatically, does not need another timestamp

        this.object("prev", Object, { description: 'the entry previous to this. if there is no previous entry it is obvious the first.' });
        this.object("next", Object, { description: 'the entry next to this. if there is no next entry it is obvious the last.' });
    }
}

export default class ChannelEntry extends ThoregonEntity() {

}


ChannelEntry.checkIn(import.meta, ChannelEntryMeta);
