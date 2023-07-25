import ChannelEntry, { ChannelEntryMeta } from "./channelentry.mjs";

/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

export class EventMeta extends ChannelEntryMeta {
    initiateInstance() {
        super.initiateInstance();
        this.name = "Event";

        this.text("type");
        this.text("detail");
    }
}

export default class Event extends ChannelEntry {}

Event.checkIn(import.meta, EventMeta);
