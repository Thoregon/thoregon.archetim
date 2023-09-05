import ChannelEntry, { ChannelEntryMeta } from "./channelentry.mjs";
import { ANY_CLASS }                      from "../metaclass/metaclass.mjs";

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
        this.name       = "Event";
        this.storeImmed = true;
        // all attributes defined in super meta class

        this.text('id', { description: 'Event id' });
        this.text('type', { description: 'Event type' });
        this.object('detail', ANY_CLASS, { description: 'Arbitrary event data' });
    }
}

export default class Event extends ChannelEntry {}

Event.checkIn(import.meta, EventMeta);
